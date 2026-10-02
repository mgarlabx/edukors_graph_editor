//! The agent's process: `agent/sidecar.mjs`, the Claude Agent SDK under Node.
//!
//! The webview starts it the first time the agent panel opens. It is one child
//! process spoken to in JSON lines: what the webview sends goes to its stdin as
//! it is, and each line it writes comes back to the webview as an `agent`
//! event, stamped with the generation of the process that wrote it, so that a
//! line from a process already replaced is recognized as such.
//!
//! Claude Code, under the SDK, uses the Claude account logged in on this Mac.
//! API keys are taken out of the process's environment so that the account is
//! what gets used.

use std::collections::VecDeque;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};

/// Node versions older than this cannot run the SDK.
const MIN_NODE: u32 = 18;

#[derive(Default)]
pub struct Agent {
    running: Mutex<Option<Running>>,
    generation: AtomicU64,
}

struct Running {
    child: Child,
    stdin: ChildStdin,
    generation: u64,
}

#[derive(Serialize)]
pub struct Started {
    generation: u64,
    /// false when the process was already running
    fresh: bool,
}

impl Agent {
    /// Closes the process's stdin, which lets it close Claude Code cleanly, and
    /// kills it if it is still there a second later.
    pub fn stop(&self) {
        let Some(Running { mut child, stdin, .. }) = self.running.lock().ok().and_then(|mut r| r.take()) else {
            return;
        };
        drop(stdin);
        for _ in 0..20 {
            if matches!(child.try_wait(), Ok(Some(_))) {
                return;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        let _ = child.kill();
        let _ = child.wait();
    }
}

#[tauri::command]
pub fn agent_start(app: AppHandle, agent: State<Agent>) -> Result<Started, String> {
    let mut running = agent.running.lock().map_err(|e| e.to_string())?;
    if let Some(r) = running.as_mut() {
        if matches!(r.child.try_wait(), Ok(None)) {
            return Ok(Started { generation: r.generation, fresh: false });
        }
    }
    let node = find_node().ok_or("node-missing")?;
    let script = find_script(&app).ok_or("sidecar-missing")?;
    let cwd = app.path().app_data_dir().map_err(|e| e.to_string())?.join("agent");
    std::fs::create_dir_all(&cwd).map_err(|e| format!("{}: {e}", cwd.display()))?;

    let generation = agent.generation.fetch_add(1, Ordering::SeqCst) + 1;
    let mut child = Command::new(&node)
        .arg(&script)
        .current_dir(script.parent().unwrap_or(Path::new("/")))
        .env("EDUKORS_AGENT_CWD", &cwd)
        .env("PATH", search_path(&node))
        .env_remove("ANTHROPIC_API_KEY")
        .env_remove("ANTHROPIC_AUTH_TOKEN")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("{}: {e}", node.display()))?;
    let (Some(stdin), Some(stdout), Some(stderr)) = (child.stdin.take(), child.stdout.take(), child.stderr.take()) else {
        let _ = child.kill();
        return Err("the agent's pipes could not be opened".into());
    };

    // The last lines of stderr, to say why the process stopped if it does.
    let tail = Arc::new(Mutex::new(VecDeque::<String>::new()));
    let stderr_thread = {
        let tail = tail.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                eprintln!("{line}");
                if let Ok(mut t) = tail.lock() {
                    if t.len() >= 30 {
                        t.pop_front();
                    }
                    t.push_back(line);
                }
            }
        })
    };
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let mut value = serde_json::from_str::<Value>(&line).unwrap_or_else(|_| json!({ "t": "log", "text": line }));
            if let Value::Object(map) = &mut value {
                map.insert("gen".into(), json!(generation));
            }
            let _ = app.emit("agent", value);
        }
        let _ = stderr_thread.join();
        let stderr = tail.lock().map(|t| Vec::from(t.clone()).join("\n")).unwrap_or_default();
        let _ = app.emit("agent", json!({ "t": "exit", "gen": generation, "stderr": stderr }));
    });

    *running = Some(Running { child, stdin, generation });
    Ok(Started { generation, fresh: true })
}

#[tauri::command]
pub fn agent_send(agent: State<Agent>, msg: Value) -> Result<(), String> {
    let mut running = agent.running.lock().map_err(|e| e.to_string())?;
    let r = running.as_mut().ok_or("the agent is not running")?;
    let mut line = serde_json::to_string(&msg).map_err(|e| e.to_string())?;
    line.push('\n');
    r.stdin
        .write_all(line.as_bytes())
        .and_then(|_| r.stdin.flush())
        .map_err(|e| format!("the agent stopped: {e}"))
}

#[tauri::command]
pub fn agent_stop(agent: State<Agent>) {
    agent.stop();
}

// ---------------------------------------------------------------- where ----

/// The script: beside the app when it is bundled, else the project's own copy,
/// which is where `npm run app:dev` (and a build made on this Mac) runs it from.
fn find_script(app: &AppHandle) -> Option<PathBuf> {
    if let Some(p) = std::env::var_os("EDUKORS_AGENT_SCRIPT").map(PathBuf::from) {
        if p.is_file() {
            return Some(p);
        }
    }
    if let Ok(dir) = app.path().resource_dir() {
        let bundled = dir.join("agent/sidecar.mjs");
        if bundled.is_file() {
            return Some(bundled);
        }
    }
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../agent/sidecar.mjs").canonicalize().ok().filter(|p| p.is_file())
}

fn node_major(path: &Path) -> Option<u32> {
    let out = Command::new(path).arg("--version").stdin(Stdio::null()).output().ok()?;
    if !out.status.success() {
        return None;
    }
    String::from_utf8_lossy(&out.stdout).trim().trim_start_matches('v').split('.').next()?.parse().ok()
}

/// A Node the SDK can run on. An app opened from the Finder does not get the
/// shell's PATH, so the usual places are tried too, and the login shell last.
pub fn find_node() -> Option<PathBuf> {
    let usable = |p: &Path| p.is_file() && node_major(p).is_some_and(|v| v >= MIN_NODE);
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(p) = std::env::var_os("EDUKORS_NODE") {
        candidates.push(PathBuf::from(p));
    }
    if let Some(path) = std::env::var_os("PATH") {
        candidates.extend(std::env::split_paths(&path).map(|dir| dir.join("node")));
    }
    if let Some(h) = &home {
        for rel in [".local/bin/node", ".volta/bin/node", ".asdf/shims/node", ".local/share/fnm/aliases/default/bin/node", "Library/Application Support/fnm/aliases/default/bin/node"] {
            candidates.push(h.join(rel));
        }
        candidates.extend(nvm_nodes(h));
    }
    candidates.extend(["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"].map(PathBuf::from));
    if let Some(found) = candidates.into_iter().find(|p| usable(p)) {
        return Some(found);
    }
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let out = Command::new(shell).args(["-lc", "command -v node"]).stdin(Stdio::null()).output().ok()?;
    let found = PathBuf::from(String::from_utf8_lossy(&out.stdout).trim());
    usable(&found).then_some(found)
}

/// The Node versions nvm installed, newest first.
fn nvm_nodes(home: &Path) -> Vec<PathBuf> {
    let Ok(dir) = std::fs::read_dir(home.join(".nvm/versions/node")) else {
        return Vec::new();
    };
    let mut found: Vec<(Vec<u32>, PathBuf)> = dir
        .filter_map(Result::ok)
        .map(|entry| {
            let name = entry.file_name().to_string_lossy().trim_start_matches('v').to_string();
            (name.split('.').map(|n| n.parse().unwrap_or(0)).collect(), entry.path().join("bin/node"))
        })
        .collect();
    found.sort_by(|a, b| b.0.cmp(&a.0));
    found.into_iter().map(|(_, path)| path).collect()
}

/// PATH for the process: Node's own folder first, then what there was.
fn search_path(node: &Path) -> String {
    let mut dirs: Vec<PathBuf> = node.parent().map(Path::to_path_buf).into_iter().collect();
    if let Some(path) = std::env::var_os("PATH") {
        dirs.extend(std::env::split_paths(&path));
    }
    for dir in ["/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"] {
        dirs.push(PathBuf::from(dir));
    }
    let mut seen = std::collections::HashSet::new();
    dirs.retain(|d| seen.insert(d.clone()));
    std::env::join_paths(dirs).map(|p| p.to_string_lossy().into_owned()).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn node_is_found_on_this_machine() {
        // The development machine has Node; the check is that it is found
        // even without the shell's PATH, as when the app opens from the Finder.
        let saved = std::env::var_os("PATH");
        std::env::set_var("PATH", "/usr/bin:/bin");
        let found = find_node();
        if let Some(p) = saved {
            std::env::set_var("PATH", p);
        }
        let node = found.expect("node not found");
        assert!(node_major(&node).unwrap() >= MIN_NODE);
    }

    #[test]
    fn the_search_path_starts_with_node_and_has_no_repeats() {
        let path = search_path(Path::new("/opt/x/bin/node"));
        let dirs: Vec<_> = std::env::split_paths(&path).collect();
        assert_eq!(dirs[0], PathBuf::from("/opt/x/bin"));
        let unique: std::collections::HashSet<_> = dirs.iter().collect();
        assert_eq!(unique.len(), dirs.len());
    }

    #[test]
    fn the_script_is_in_the_project() {
        let dev = Path::new(env!("CARGO_MANIFEST_DIR")).join("../agent/sidecar.mjs");
        assert!(dev.is_file());
    }
}
