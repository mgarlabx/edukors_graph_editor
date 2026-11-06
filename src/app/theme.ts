/** The theme on screen: Common's (Settings → Appearance), which it resolves to light or dark on <html data-theme>. */
import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

export const currentTheme = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

const subscribe = (fn: () => void) => {
  const observer = new MutationObserver(fn);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
};

export const useTheme = (): Theme => useSyncExternalStore(subscribe, currentTheme, () => "light");
