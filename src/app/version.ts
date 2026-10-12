/**
 * The editor's version, as the app is built with it (src-tauri/tauri.conf.json;
 * package.json and src-tauri/Cargo.toml carry the same number: see
 * scripts/bump-version.mjs).
 */
import tauriConf from "../../src-tauri/tauri.conf.json";

/** As people read it: "1.12.0" is "1.12"; a patch release keeps its third number. */
export const shortVersion = (version: string) => version.replace(/\.0$/, "");

export const APP_NAME = tauriConf.productName;
export const APP_VERSION = shortVersion(tauriConf.version);
