// @ts-check
/**
 * The conversations of the providers whose own history the editor cannot read.
 *
 * Claude Code keeps its conversations in files the SDK reads back for us. The
 * Antigravity CLI keeps its own, in a format of its own that nothing promises
 * to keep stable, and it only hands out the id. So the editor writes its own
 * journal beside it: one file per conversation, one line per event, which is
 * exactly what the panel folds into the conversation on screen
 * (src/agent/transcript.ts). The provider's own id is kept in the first line,
 * to resume the conversation on its side.
 */
import { appendFileSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, rmSync, statSync, writeFileSync, closeSync } from "node:fs";
import { join } from "node:path";

/** How much of a file is read to find the first message, when listing. */
const HEAD_BYTES = 32_768;

/**
 * @param {string} dir the folder the journals live in
 */
export function journal(dir) {
  const file = (/** @type {string} */ sid) => join(dir, `${sid.replace(/[^A-Za-z0-9_-]/g, "_")}.ndjson`);

  const ensure = () => mkdirSync(dir, { recursive: true });

  /** The first bytes of a file, as whole lines. */
  function head(/** @type {string} */ path) {
    const fd = openSync(path, "r");
    try {
      const buffer = Buffer.alloc(HEAD_BYTES);
      const read = readSync(fd, buffer, 0, HEAD_BYTES, 0);
      const text = buffer.subarray(0, read).toString("utf8");
      const lines = text.split("\n");
      // The last line may have been cut in the middle.
      if (read === HEAD_BYTES) lines.pop();
      return lines;
    } finally {
      closeSync(fd);
    }
  }

  /** @param {string} line */
  const parse = (line) => {
    try {
      return line.trim() ? JSON.parse(line) : null;
    } catch {
      return null;
    }
  };

  return {
    /** Starts a conversation's file, with what the provider calls it. @param {string} sid @param {Record<string, unknown>} meta */
    start(sid, meta) {
      ensure();
      writeFileSync(file(sid), JSON.stringify({ meta: { ...meta, started: Date.now() } }) + "\n");
    },

    /** Changes what is kept about the conversation, keeping what was there. @param {string} sid @param {Record<string, unknown>} meta */
    setMeta(sid, meta) {
      const was = this.meta(sid);
      const path = file(sid);
      let rest = "";
      try {
        rest = readFileSync(path, "utf8").split("\n").slice(1).join("\n");
      } catch {
        ensure();
      }
      writeFileSync(path, JSON.stringify({ meta: { ...was, ...meta } }) + "\n" + rest);
    },

    /** @param {string} sid @returns {Record<string, any>} */
    meta(sid) {
      try {
        return parse(head(file(sid))[0] ?? "")?.meta ?? {};
      } catch {
        return {};
      }
    },

    /** @param {string} sid @param {any} ev */
    append(sid, ev) {
      try {
        ensure();
        appendFileSync(file(sid), JSON.stringify(ev) + "\n");
      } catch {
        /* a conversation without its journal still works on screen */
      }
    },

    /** The conversation, as the events that made it. @param {string} sid */
    read(sid) {
      let text = "";
      try {
        text = readFileSync(file(sid), "utf8");
      } catch {
        return [];
      }
      return text
        .split("\n")
        .map(parse)
        .filter((x) => x && typeof x.ev === "string");
    },

    /** Every conversation, the most recently written first. */
    list() {
      /** @type {{ id: string; firstPrompt?: string; lastModified: number }[]} */
      const out = [];
      let names;
      try {
        names = readdirSync(dir);
      } catch {
        return out;
      }
      for (const name of names) {
        if (!name.endsWith(".ndjson")) continue;
        const path = join(dir, name);
        try {
          const stat = statSync(path);
          const lines = head(path);
          const meta = parse(lines[0] ?? "")?.meta ?? {};
          const first = lines.map(parse).find((x) => x && x.ev === "user");
          out.push({
            id: String(meta.sid ?? name.slice(0, -".ndjson".length)),
            ...(first?.text ? { firstPrompt: String(first.text) } : {}),
            lastModified: stat.mtimeMs,
          });
        } catch {
          /* a file being written, or gone */
        }
      }
      return out.sort((a, b) => b.lastModified - a.lastModified);
    },

    /** @param {string} sid */
    remove(sid) {
      rmSync(file(sid), { force: true });
    },
  };
}
