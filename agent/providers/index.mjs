// @ts-check
/**
 * The providers the agent can run on, and what each one needs on this machine.
 *
 * A provider is a module with `id`, `capabilities`, `detect()` and
 * `create(host)`; the instance it creates answers the requests the panel makes
 * (open, send, interrupt, set, close, list, history, remove, usage, login) and
 * speaks to the panel through the host (agent/host.js documents it).
 *
 * Only Claude Code travels inside the app. Antigravity and Codex are the
 * person's own install: the editor finds them, says so when they are missing,
 * and never downloads anything.
 */

/** In the order the panel offers them. */
export const PROVIDER_IDS = /** @type {const} */ (["claude", "antigravity", "codex"]);

const loaders = {
  claude: () => import("./claude.mjs"),
  antigravity: () => import("./antigravity.mjs"),
  codex: () => import("./codex.mjs"),
};

/** @type {Map<string, any>} */
const loaded = new Map();

/**
 * A provider's module, imported once.
 * @param {string} id
 */
export async function provider(id) {
  if (!loaded.has(id)) {
    const load = /** @type {Record<string, () => Promise<any>>} */ (loaders)[id];
    if (!load) throw new Error(`unknown provider: ${id}`);
    loaded.set(id, await load());
  }
  return loaded.get(id);
}

/**
 * Whether each provider can be used here, for the panel's menu. A provider
 * whose module cannot even be imported is reported as missing, never thrown.
 * @returns {Promise<{ id: string; available: boolean; reason?: string; version?: string }[]>}
 */
export async function detectAll() {
  return Promise.all(
    PROVIDER_IDS.map(async (id) => {
      try {
        const mod = await provider(id);
        const state = await mod.detect();
        return { id, available: Boolean(state.available), ...(state.reason ? { reason: state.reason } : {}), ...(state.version ? { version: state.version } : {}) };
      } catch (e) {
        return { id, available: false, reason: "missing", detail: String(/** @type {Error} */ (e)?.message ?? e) };
      }
    }),
  );
}
