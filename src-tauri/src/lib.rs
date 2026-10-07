//! The native half of the editor.
//!
//! The webview owns the course; this side owns what a webview should not:
//! the file system, the Keychain and the network. The OpenRouter key is read
//! from the Keychain here and added to the request here, so it never reaches
//! JavaScript, and the only hosts a request may go to are OpenRouter's.
//!
//! The AI agent of the side panel runs in a process of its own, started and
//! spoken to from here (agent.rs).

mod agent;
#[cfg(target_os = "macos")]
mod macos;

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::menu::{CheckMenuItemBuilder, Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, RunEvent, State};

const KEYCHAIN_SERVICE: &str = "org.edukors.grapheditor";
const KEYCHAIN_ACCOUNT: &str = "openrouter";
const ALLOWED_HOST: &str = "https://openrouter.ai/";

/// Files the system asked us to open before the webview was listening.
#[derive(Default)]
struct OpenedFiles(Mutex<Vec<String>>);

// ---------------------------------------------------------------- files ----

#[tauri::command]
fn read_text(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("{path}: {e}"))
}

/// Written beside the target and renamed over it, so a crash mid-write never
/// leaves half a course on disk.
#[tauri::command]
fn write_text(path: String, contents: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    let tmp = target.with_extension(format!(
        "{}.tmp",
        target.extension().and_then(|e| e.to_str()).unwrap_or("")
    ));
    std::fs::write(&tmp, contents.as_bytes()).map_err(|e| format!("{path}: {e}"))?;
    std::fs::rename(&tmp, &target).map_err(|e| format!("{path}: {e}"))
}

#[tauri::command]
fn take_opened_files(state: State<OpenedFiles>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().unwrap())
}

// ---------------------------------------------------------------- prefs ----

fn prefs_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("prefs.json"))
}

#[tauri::command]
fn prefs_load(app: AppHandle) -> Result<Value, String> {
    let path = prefs_path(&app)?;
    match std::fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text).map_err(|e| e.to_string()),
        Err(_) => Ok(Value::Object(Default::default())),
    }
}

#[tauri::command]
fn prefs_save(app: AppHandle, prefs: Value) -> Result<(), String> {
    let path = prefs_path(&app)?;
    let text = serde_json::to_string_pretty(&prefs).map_err(|e| e.to_string())?;
    std::fs::write(path, text).map_err(|e| e.to_string())
}

// ------------------------------------------------------------- keychain ----

fn keychain() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT).map_err(|e| e.to_string())
}

fn read_key() -> Option<String> {
    keychain().ok()?.get_password().ok().filter(|k| !k.trim().is_empty())
}

#[tauri::command]
fn key_status() -> bool {
    read_key().is_some()
}

#[tauri::command]
fn key_set(key: String) -> Result<(), String> {
    let key = key.trim();
    if key.is_empty() {
        return Err("empty key".into());
    }
    keychain()?.set_password(key).map_err(|e| e.to_string())
}

#[tauri::command]
fn key_delete() -> Result<(), String> {
    match keychain()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// ------------------------------------------------------------------ http ----

#[derive(Serialize)]
struct HttpAnswer {
    status: u16,
    json: Option<Value>,
    raw: String,
    error: Option<String>,
    ms: u128,
}

fn client(timeout: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout.clamp(5, 600)))
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())
}

/// One POST to OpenRouter with the key from the Keychain. Mirrors ai_http() in
/// the player's src/ai.php: it decides nothing beyond the key and the headers.
#[tauri::command]
async fn ai_post(url: String, body: Value, timeout: Option<u64>) -> Result<HttpAnswer, String> {
    if !url.starts_with(ALLOWED_HOST) {
        return Err(format!("refused: {url} is not an OpenRouter address"));
    }
    let key = read_key().ok_or_else(|| "no OpenRouter key in the Keychain".to_string())?;
    let started = Instant::now();
    let sent = client(timeout.unwrap_or(45))?
        .post(&url)
        .bearer_auth(key)
        .header("HTTP-Referer", "https://edukors.org/graph/")
        .header("X-Title", "Edukors Graph Editor")
        .json(&body)
        .send()
        .await;
    let response = match sent {
        Ok(r) => r,
        Err(e) => {
            return Ok(HttpAnswer {
                status: 0,
                json: None,
                raw: String::new(),
                error: Some(e.to_string()),
                ms: started.elapsed().as_millis(),
            })
        }
    };
    let status = response.status().as_u16();
    let raw = response.text().await.unwrap_or_default();
    let json: Option<Value> = serde_json::from_str(&raw).ok();
    let error = match (&json, status) {
        (None, _) => Some("unreadable answer".to_string()),
        (Some(j), s) if s >= 400 => Some(
            j.pointer("/error/message")
                .and_then(|m| m.as_str())
                .map(str::to_string)
                .unwrap_or_else(|| format!("request failed ({s})")),
        ),
        _ => None,
    };
    Ok(HttpAnswer { status, json, raw, error, ms: started.elapsed().as_millis() })
}

/// The public model list, for prices and for the model pickers. No key needed.
#[tauri::command]
async fn ai_models() -> Result<Value, String> {
    let response = client(30)?
        .get("https://openrouter.ai/api/v1/models")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    response.json::<Value>().await.map_err(|e| e.to_string())
}

// ------------------------------------------------------------------ menu ----

fn labels(lang: &str) -> [&'static str; 31] {
    match lang {
        "en" => [
            "File", "New course", "Open…", "Save", "Save as…", "Clear history", "Export course…",
            "Edit", "Undo", "Redo", "View", "Fit graph", "Auto layout", "EGF", "Preview",
            "Preferences…", "Window", "Help", "User guide", "Duplicate", "Close tab", "Next tab",
            "Previous tab", "AI agent", "Map", "Minimize", "Recent", "Delete", "Problems", "Map language",
            "Sidebar",
        ],
        "es" => [
            "Archivo", "Nuevo curso", "Abrir…", "Guardar", "Guardar como…", "Borrar historial",
            "Exportar curso…", "Editar", "Deshacer", "Rehacer", "Ver", "Ajustar grafo",
            "Organizar automáticamente", "EGF", "Vista previa", "Preferencias…",
            "Ventana", "Ayuda", "Guía de uso", "Duplicar", "Cerrar pestaña", "Pestaña siguiente",
            "Pestaña anterior", "Agente de IA", "Mapa", "Minimizar", "Recientes", "Eliminar",
            "Problemas", "Idioma del mapa", "Barra lateral",
        ],
        _ => [
            "Arquivo", "Novo curso", "Abrir…", "Salvar", "Salvar como…", "Limpar histórico",
            "Exportar curso…", "Editar", "Desfazer", "Refazer", "Ver", "Enquadrar grafo",
            "Organizar automaticamente", "EGF", "Preview", "Preferências…", "Janela",
            "Ajuda", "Guia de uso", "Duplicar", "Fechar aba", "Próxima aba", "Aba anterior",
            "Agente de IA", "Mapa", "Minimizar", "Recentes", "Excluir", "Problemas", "Idioma do mapa",
            "Barra lateral",
        ],
    }
}

/// The items macOS provides, which would otherwise come in English: about,
/// hide, hide others, quit, cut, copy, paste, select all, zoom, full screen.
fn system_labels(lang: &str) -> [&'static str; 10] {
    match lang {
        "en" => [
            "About Edukors Graph Editor", "Hide Edukors Graph Editor", "Hide others",
            "Quit Edukors Graph Editor", "Cut", "Copy", "Paste", "Select all", "Zoom", "Full screen",
        ],
        "es" => [
            "Acerca de Edukors Graph Editor", "Ocultar Edukors Graph Editor", "Ocultar otros",
            "Salir de Edukors Graph Editor", "Cortar", "Copiar", "Pegar", "Seleccionar todo", "Zoom",
            "Pantalla completa",
        ],
        _ => [
            "Sobre o Edukors Graph Editor", "Ocultar o Edukors Graph Editor", "Ocultar outros",
            "Encerrar o Edukors Graph Editor", "Recortar", "Copiar", "Colar", "Selecionar tudo", "Zoom",
            "Tela cheia",
        ],
    }
}

/// The node types, in the order of NODE_TYPES in src/course/nodeTypes.ts.
const NODE_TYPES: [&str; 10] = [
    "static-md", "static-html", "dynamic-md", "dynamic-html", "quiz", "form", "bool", "choice",
    "score", "noul",
];

/// The Insert menu's title and the names of the types, as the webview calls them.
fn insert_labels(lang: &str) -> (&'static str, [&'static str; 10]) {
    match lang {
        "en" => (
            "Insert",
            [
                "Text", "HTML", "AI text", "AI HTML", "Quiz", "Form", "Yes/no", "Choice (AI)",
                "Score (AI)", "Probability (AI)",
            ],
        ),
        "es" => (
            "Insertar",
            [
                "Texto", "HTML", "Texto con IA", "HTML con IA", "Cuestionario", "Formulario", "Sí/no",
                "Elección (IA)", "Nota (IA)", "Probabilidad (IA)",
            ],
        ),
        _ => (
            "Inserir",
            [
                "Texto", "HTML", "Texto com IA", "HTML com IA", "Quiz", "Formulário", "Sim/não",
                "Escolha (IA)", "Nota (IA)", "Probabilidade (IA)",
            ],
        ),
    }
}

/// What each recent file is called in the menu: its name, and its folder
/// too when another file of the list has the same name.
fn recent_labels(paths: &[String]) -> Vec<String> {
    let split = |p: &str| -> (String, String) {
        let path = std::path::Path::new(p);
        let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| p.to_string());
        let folder = path
            .parent()
            .and_then(|d| d.file_name())
            .map(|d| d.to_string_lossy().into_owned())
            .unwrap_or_default();
        (name, folder)
    };
    let parts: Vec<(String, String)> = paths.iter().map(|p| split(p)).collect();
    parts
        .iter()
        .map(|(name, folder)| {
            let twins = parts.iter().filter(|(n, _)| n == name).count();
            if twins > 1 && !folder.is_empty() {
                format!("{name} — {folder}")
            } else {
                name.clone()
            }
        })
        .collect()
}

/// What the menu shows of the course on screen: the languages its titles can
/// be read in on the map, and the one they are read in now.
#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MapLangs {
    langs: Vec<String>,
    current: String,
}

/// What else the menu follows of the webview: whether a course is open, how
/// many tabs there are, and whether a dialog is (its text fields, such as the
/// preferences' key, are there with no course open too).
#[derive(Default, Deserialize)]
struct MenuState {
    course: bool,
    tabs: usize,
    dialog: bool,
}

/// Undo, redo, cut, copy, paste and select all: they act on the course or on
/// the text fields of a dialog, and are off when neither is on screen.
const TEXT_EDIT: [&str; 6] = ["undo", "redo", "cut", "copy", "paste", "select-all"];

/// The items that act on the course on screen, off while there is none, and
/// every type of the Insert menu with them. The webview keeps the same list
/// (NEEDS_COURSE in src/app/menu.ts), for the keys the menu does not take.
const NEEDS_COURSE: [&str; 14] = [
    "close-tab", "save", "save-as", "export-player", "duplicate", "delete", "fit", "layout",
    "tab-canvas", "tab-json", "tab-preview", "problems", "agent", "sidebar",
];

fn item_enabled(id: &str, state: &MenuState) -> bool {
    match id {
        "next-tab" | "prev-tab" => state.tabs > 1,
        _ if TEXT_EDIT.contains(&id) => state.course || state.dialog,
        _ => state.course || !(NEEDS_COURSE.contains(&id) || id.starts_with("insert:")),
    }
}

fn build_menu(app: &AppHandle, lang: &str, recent: &[String], map: &MapLangs, state: &MenuState) -> tauri::Result<Menu<tauri::Wry>> {
    let l = labels(lang);
    let s = system_labels(lang);
    let item = |id: &str, text: &str, accel: Option<&str>| {
        let b = MenuItemBuilder::with_id(id, text).enabled(item_enabled(id, state));
        match accel {
            Some(a) => b.accelerator(a).build(app),
            None => b.build(app),
        }
    };

    // Windows has no app menu: its items go to File and Help, where Windows has them.
    #[cfg(target_os = "macos")]
    let app_menu = SubmenuBuilder::new(app, "Edukors Graph Editor")
        .item(&PredefinedMenuItem::about(app, Some(s[0]), None)?)
        .separator()
        .item(&item("prefs", l[15], Some("CmdOrCtrl+,"))?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, Some(s[1]))?)
        .item(&PredefinedMenuItem::hide_others(app, Some(s[2]))?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, Some(s[3]))?)
        .build()?;

    // A recent file's id is its path, which the webview opens (src/App.tsx).
    let mut recents = SubmenuBuilder::new(app, l[26]).enabled(!recent.is_empty());
    for (path, label) in recent.iter().zip(recent_labels(recent)) {
        recents = recents.item(&item(&format!("recent:{path}"), &label, None)?);
    }
    if !recent.is_empty() {
        recents = recents.separator().item(&item("recent-clear", l[5], None)?);
    }
    let recents = recents.build()?;

    // Each course opens in a tab of its own; the webview keeps the tabs.
    let file = SubmenuBuilder::new(app, l[0])
        .item(&item("new", l[1], Some("CmdOrCtrl+N"))?)
        .item(&item("open", l[2], Some("CmdOrCtrl+O"))?)
        .item(&recents)
        .item(&item("close-tab", l[20], Some("CmdOrCtrl+W"))?)
        .separator()
        .item(&item("save", l[3], Some("CmdOrCtrl+S"))?)
        .item(&item("save-as", l[4], Some("CmdOrCtrl+Shift+S"))?)
        .separator()
        .item(&item("export-player", l[6], None)?);
    #[cfg(not(target_os = "macos"))]
    let file = file
        .separator()
        .item(&item("prefs", l[15], Some("CmdOrCtrl+,"))?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, Some(s[3]))?);
    let file = file.build()?;

    // Undo and redo are ours: outside a text field they walk the course
    // history, inside one the webview decides (see command() in src/App.tsx).
    let edit = SubmenuBuilder::new(app, l[7])
        .item(&item("undo", l[8], Some("CmdOrCtrl+Z"))?)
        .item(&item("redo", l[9], Some("CmdOrCtrl+Shift+Z"))?)
        .separator();
    // The system's cut, copy, paste and select all cannot be turned off, and on
    // macOS a text field takes those keys only through them: while there is
    // nothing for them to act on, stand-ins of ours, off, take their place.
    let edit = if item_enabled("cut", state) {
        edit.item(&PredefinedMenuItem::cut(app, Some(s[4]))?)
            .item(&PredefinedMenuItem::copy(app, Some(s[5]))?)
            .item(&PredefinedMenuItem::paste(app, Some(s[6]))?)
            .item(&PredefinedMenuItem::select_all(app, Some(s[7]))?)
    } else {
        edit.item(&item("cut", s[4], Some("CmdOrCtrl+X"))?)
            .item(&item("copy", s[5], Some("CmdOrCtrl+C"))?)
            .item(&item("paste", s[6], Some("CmdOrCtrl+V"))?)
            .item(&item("select-all", s[7], Some("CmdOrCtrl+A"))?)
    };
    let edit = edit
        .separator()
        .item(&item("duplicate", l[19], Some("CmdOrCtrl+D"))?)
        // No accelerator: ⌫ belongs to the text fields; the webview takes it on the map.
        .item(&item("delete", l[27], None)?)
        .build()?;

    // A language's id is "map-lang:" and its code, as the toolbar's globe lists them.
    let mut map_langs = SubmenuBuilder::new(app, l[29]).enabled(!map.langs.is_empty());
    for code in &map.langs {
        map_langs = map_langs.item(&CheckMenuItemBuilder::with_id(format!("map-lang:{code}"), code).checked(*code == map.current).build(app)?);
    }
    let map_langs = map_langs.build()?;

    let view = SubmenuBuilder::new(app, l[10])
        .item(&item("fit", l[11], Some("CmdOrCtrl+0"))?)
        .item(&item("layout", l[12], Some("CmdOrCtrl+Shift+L"))?)
        .item(&map_langs)
        .separator()
        .item(&item("tab-canvas", l[24], Some("CmdOrCtrl+M"))?)
        .item(&item("tab-json", l[13], Some("CmdOrCtrl+E"))?)
        .item(&item("tab-preview", l[14], Some("CmdOrCtrl+P"))?)
        .separator()
        .item(&item("problems", l[28], Some("CmdOrCtrl+Shift+M"))?)
        .item(&item("agent", l[23], Some("CmdOrCtrl+Shift+A"))?)
        .item(&item("sidebar", l[30], Some("CmdOrCtrl+Alt+0"))?)
        .separator()
        // Ours: macOS renames its own full screen item, in its language.
        .item(&item("fullscreen", s[9], Some(if cfg!(target_os = "macos") { "Ctrl+Super+F" } else { "F11" }))?)
        .build()?;

    // A type's id is "insert:" and the type, which the webview inserts
    // (src/app/insert.ts), in the groups of the toolbar's + list: content,
    // activities, AI judgements.
    let (insert_title, type_labels) = insert_labels(lang);
    let mut insert = SubmenuBuilder::new(app, insert_title).enabled(state.course);
    for (i, (ty, label)) in NODE_TYPES.iter().zip(type_labels).enumerate() {
        if i == 4 || i == 7 {
            insert = insert.separator();
        }
        insert = insert.item(&item(&format!("insert:{ty}"), label, None)?);
    }
    let insert = insert.build()?;

    // ⌘M shows the map, so Minimize is ours, without a shortcut.
    let window = SubmenuBuilder::new(app, l[16])
        .item(&item("minimize", l[25], None)?)
        .item(&PredefinedMenuItem::maximize(app, Some(s[8]))?)
        .separator()
        .item(&item("next-tab", l[21], Some("Ctrl+Tab"))?)
        .item(&item("prev-tab", l[22], Some("Ctrl+Shift+Tab"))?)
        .build()?;

    let help = SubmenuBuilder::new(app, l[17]).item(&item("help", l[18], None)?);
    #[cfg(not(target_os = "macos"))]
    let help = help.separator().item(&PredefinedMenuItem::about(app, Some(s[0]), None)?);
    let help = help.build()?;

    #[cfg(target_os = "macos")]
    let menus: [&dyn tauri::menu::IsMenuItem<tauri::Wry>; 7] = [&app_menu, &file, &edit, &view, &insert, &window, &help];
    #[cfg(not(target_os = "macos"))]
    let menus: [&dyn tauri::menu::IsMenuItem<tauri::Wry>; 6] = [&file, &edit, &view, &insert, &window, &help];
    MenuBuilder::new(app).items(&menus).build()
}

/// Rebuilt whenever the interface language, the recent files, the map's
/// languages or whether a course is open change (src/app/menu.ts).
#[tauri::command]
fn set_menu(app: AppHandle, lang: String, recent: Vec<String>, map: Option<MapLangs>, state: Option<MenuState>) -> Result<(), String> {
    let menu = build_menu(&app, &lang, &recent, &map.unwrap_or_default(), &state.unwrap_or_default()).map_err(|e| e.to_string())?;
    app.set_menu(menu).map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    app.run_on_main_thread(macos::strip_edit_menu).map_err(|e| e.to_string())?;
    Ok(())
}

// ------------------------------------------------------------------- run ----

/// A course file: `.egf` (Edukors Graph Format), or `.json` from before it.
fn is_course_file(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.ends_with(".egf") || lower.ends_with(".json")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    // A .egf opened from Explorer starts the app again with the file in its
    // arguments; while one is running, that one takes the file instead.
    #[cfg(windows)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
        let paths: Vec<String> = argv
            .iter()
            .skip(1)
            .filter(|a| is_course_file(a))
            .map(|a| PathBuf::from(&cwd).join(a))
            .filter(|p| p.is_file())
            .map(|p| p.to_string_lossy().into_owned())
            .collect();
        app.state::<OpenedFiles>().0.lock().unwrap().extend(paths.clone());
        for path in paths {
            let _ = app.emit("open-file", path);
        }
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }));
    let app = builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(OpenedFiles::default())
        .manage(agent::Agent::default())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            macos::quiet_edit_menu();
            // No course is open yet: what needs one starts off.
            let menu = build_menu(app.handle(), "pt", &[], &MapLangs::default(), &MenuState::default())?;
            app.set_menu(menu)?;
            // Files passed on the command line (useful in development).
            let args: Vec<String> = std::env::args()
                .skip(1)
                .filter(|a| is_course_file(a) && PathBuf::from(a).is_file())
                .collect();
            app.state::<OpenedFiles>().0.lock().unwrap().extend(args);
            Ok(())
        })
        .on_menu_event(|app, event| {
            if let (id @ ("minimize" | "fullscreen"), Some(window)) = (event.id().0.as_str(), app.get_webview_window("main")) {
                let _ = if id == "minimize" {
                    window.minimize()
                } else {
                    window.set_fullscreen(!window.is_fullscreen().unwrap_or(false))
                };
                return;
            }
            let _ = app.emit("menu", event.id().0.as_str());
        })
        .invoke_handler(tauri::generate_handler![
            read_text,
            write_text,
            take_opened_files,
            prefs_load,
            prefs_save,
            key_status,
            key_set,
            key_delete,
            ai_post,
            ai_models,
            set_menu,
            agent::agent_start,
            agent::agent_send,
            agent::agent_stop
        ])
        .build(tauri::generate_context!())
        .expect("error while building the editor");

    app.run(|handle, event| {
        // Quitting takes the agent's process, and Claude Code under it, along.
        if let RunEvent::Exit = &event {
            handle.state::<agent::Agent>().stop();
        }
        // AppKit fills the Edit menu once the app has launched.
        #[cfg(target_os = "macos")]
        if let RunEvent::Ready = &event {
            macos::strip_edit_menu();
        }
        // A .egf (or an older .json) opened from Finder: kept for the webview to take on boot, and
        // announced in case it is already running.
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        if let RunEvent::Opened { urls } = &event {
            let paths: Vec<String> = urls
                .iter()
                .filter_map(|u| u.to_file_path().ok())
                .map(|p| p.to_string_lossy().into_owned())
                .collect();
            handle.state::<OpenedFiles>().0.lock().unwrap().extend(paths.clone());
            for path in paths {
                let _ = handle.emit("open-file", path);
            }
        }
        let _ = (handle, event);
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join("edukors-editor-tests");
        std::fs::create_dir_all(&dir).unwrap();
        dir.join(name)
    }

    #[test]
    fn write_then_read_round_trips_and_leaves_no_temp_file() {
        let path = scratch("course.json");
        let text = "{\n  \"nodes\": [\"ção 中文\"]\n}\n";
        write_text(path.to_string_lossy().into(), text.into()).unwrap();
        assert_eq!(read_text(path.to_string_lossy().into()).unwrap(), text);
        assert!(!path.with_extension("json.tmp").exists());
    }

    #[test]
    fn overwriting_replaces_the_whole_file() {
        let path = scratch("overwrite.json");
        write_text(path.to_string_lossy().into(), "a much longer first version".into()).unwrap();
        write_text(path.to_string_lossy().into(), "short".into()).unwrap();
        assert_eq!(read_text(path.to_string_lossy().into()).unwrap(), "short");
    }

    #[test]
    fn reading_a_missing_file_names_it() {
        let err = read_text("/nonexistent/edukors.json".into()).unwrap_err();
        assert!(err.contains("/nonexistent/edukors.json"));
    }

    #[tokio::test]
    async fn the_key_only_ever_goes_to_openrouter() {
        let refused = ai_post("https://example.org/steal".into(), Value::Null, None).await;
        assert!(refused.err().unwrap().starts_with("refused"));
        let sneaky = ai_post("https://openrouter.ai.example.org/x".into(), Value::Null, None).await;
        assert!(sneaky.is_err());
    }

    #[test]
    fn every_menu_language_has_every_label() {
        for lang in ["pt", "en", "es", "xx"] {
            assert!(labels(lang).iter().all(|l| !l.is_empty()));
        }
        assert_eq!(labels("en")[3], "Save");
        assert_eq!(labels("pt")[3], "Salvar");
        assert_eq!(labels("es")[3], "Guardar");
        assert_eq!(labels("pt")[20], "Fechar aba");
        assert_eq!(labels("pt")[23], "Agente de IA");
        assert_eq!(labels("en")[23], "AI agent");
        assert_eq!(labels("pt")[24], "Mapa");
        assert_eq!(labels("en")[24], "Map");
        assert_eq!(labels("pt")[26], "Recentes");
        assert_eq!(labels("pt")[27], "Excluir");
        assert_eq!(labels("en")[28], "Problems");
        assert_eq!(labels("es")[29], "Idioma del mapa");
        assert_eq!(labels("pt")[30], "Barra lateral");
        assert_eq!(labels("pt")[5], "Limpar histórico");
        assert_eq!(labels("pt")[6], "Exportar curso…");
        assert_eq!(labels("pt")[13], "EGF");
        for lang in ["pt", "en", "es", "xx"] {
            assert!(system_labels(lang).iter().all(|l| !l.is_empty()));
        }
        assert_eq!(system_labels("pt")[3], "Encerrar o Edukors Graph Editor");
        assert_eq!(system_labels("es")[6], "Pegar");
    }

    #[test]
    fn the_insert_menu_lists_the_types_of_the_webview_by_their_names_there() {
        let ts = include_str!("../../src/course/nodeTypes.ts");
        let list = &ts[ts.find("NODE_TYPES: NodeType[] = [").unwrap()..];
        let list = &list[..list.find("];").unwrap()];
        let listed: Vec<&str> = list.split('"').skip(1).step_by(2).collect();
        assert_eq!(listed, NODE_TYPES);
        for (lang, json) in [
            ("pt", include_str!("../../src/i18n/locales/pt.json")),
            ("en", include_str!("../../src/i18n/locales/en.json")),
            ("es", include_str!("../../src/i18n/locales/es.json")),
        ] {
            let strings: Value = serde_json::from_str(json).unwrap();
            for (ty, name) in NODE_TYPES.iter().zip(insert_labels(lang).1) {
                assert_eq!(strings[format!("type.{ty}")], name, "{lang} {ty}");
            }
        }
        assert_eq!(insert_labels("pt").0, "Inserir");
    }

    #[test]
    fn without_a_course_only_what_needs_none_is_on() {
        let none = MenuState::default();
        for id in ["new", "open", "recent-clear", "prefs", "help", "minimize", "fullscreen"] {
            assert!(item_enabled(id, &none), "{id}");
        }
        for id in NEEDS_COURSE.iter().chain(&TEXT_EDIT).copied().chain(["insert:quiz", "next-tab", "prev-tab"]) {
            assert!(!item_enabled(id, &none), "{id}");
        }
        // A dialog's text fields take undo, the clipboard and select all, with no course open.
        let dialog = MenuState { dialog: true, ..MenuState::default() };
        assert!(TEXT_EDIT.iter().all(|id| item_enabled(id, &dialog)));
        assert!(!item_enabled("save", &dialog));
        let one = MenuState { course: true, tabs: 1, dialog: false };
        assert!(NEEDS_COURSE.iter().chain(&TEXT_EDIT).all(|id| item_enabled(id, &one)));
        assert!(item_enabled("insert:quiz", &one));
        assert!(!item_enabled("next-tab", &one));
        assert!(item_enabled("prev-tab", &MenuState { course: true, tabs: 2, dialog: false }));
    }

    #[test]
    fn the_webview_ignores_the_same_items_without_a_course() {
        let ts = include_str!("../../src/app/menu.ts");
        let list = &ts[ts.find("NEEDS_COURSE = [").unwrap()..];
        let list = &list[..list.find("];").unwrap()];
        let listed: Vec<&str> = list.split('"').skip(1).step_by(2).collect();
        assert_eq!(listed, NEEDS_COURSE);
    }

    #[test]
    fn course_files_are_egf_or_older_json() {
        assert!(is_course_file("/a/curso.egf"));
        assert!(is_course_file("/a/CURSO.EGF"));
        assert!(is_course_file("/a/curso.json"));
        assert!(!is_course_file("/a/curso.txt"));
    }

    #[test]
    fn recent_files_are_named_by_file_and_by_folder_only_when_names_repeat() {
        let paths = ["/a/curso.json", "/b/curso.json", "/c/outro.json"].map(String::from);
        assert_eq!(recent_labels(&paths), ["curso.json — a", "curso.json — b", "outro.json"]);
    }
}
