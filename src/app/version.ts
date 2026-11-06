/**
 * The editor's version, as the app is built with it: package.json holds the release date (YY.M.D, Common's rule),
 * set into the bundle by scripts/build.mjs and shown as v.YY.MM.DD.
 */
declare const __APP_VERSION__: string | undefined;

export const APP_NAME = "Edukors Graph Editor";
export const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
