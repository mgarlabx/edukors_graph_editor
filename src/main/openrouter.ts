/** The preview's AI goes only to OpenRouter: the key never travels anywhere else (ported from src-tauri's ai_post). */
export const OPENROUTER = "https://openrouter.ai/";

export function isOpenRouterUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "openrouter.ai" && !u.username && !u.password && (u.port === "" || u.port === "443");
  } catch {
    return false;
  }
}
