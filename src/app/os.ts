/**
 * What the interface writes differently off the Mac: the shortcuts, written
 * with the Mac's symbols in the code and in the locales, and the separator of
 * a file's path. Where the system does not say (tests, some browsers), the
 * Mac's forms stay.
 */
const platform = typeof navigator === "undefined" ? "" : (navigator.platform ?? "");
const windows = /^Win/i.test(platform);
const notMac = windows || /^Linux/i.test(platform);

const MODIFIERS: [string, string][] = [
  ["⌃", "Ctrl"],
  ["⌘", "Ctrl"],
  ["⌥", "Alt"],
  ["⇧", "Shift"],
];
const KEYS: Record<string, string> = { "⇥": "Tab", "↵": "Enter", "⌫": "Delete" };

/**
 * "⇧⌘S" → "Ctrl+Shift+S" off the Mac, in a label or in a sentence; as it is on a
 * Mac. A symbol followed by a blank names the key itself ("⌘ is Ctrl") and stays.
 */
export const keyLabel = (text: string): string =>
  notMac
    ? text.replace(/([⌃⌘⌥⇧]+)(\S)|[⇥↵⌫]/gu, (whole, mods?: string, key?: string) => {
        if (!mods || !key) return KEYS[whole] ?? whole;
        const names = new Set(MODIFIERS.filter(([symbol]) => mods.includes(symbol)).map(([, name]) => name));
        return [...names, KEYS[key] ?? key].join("+");
      })
    : text;

/** Whether a key event holds the system's command key: ⌘ on a Mac, Ctrl elsewhere (on a Mac, ⌃ keeps its text bindings). */
export const commandKey = (e: { metaKey: boolean; ctrlKey: boolean }): boolean => (notMac ? e.ctrlKey : e.metaKey);

const SEPARATOR = windows ? /[\\/]/ : "/";

/** A path's last part: the file's name. */
export const baseName = (path: string): string => path.split(SEPARATOR).pop() ?? path;

/** The name of the folder a file is in. */
export const folderName = (path: string): string => path.split(SEPARATOR).slice(-2, -1)[0] ?? "";
