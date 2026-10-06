/**
 * The editor's version, as the app is built with it (src-tauri/tauri.conf.json;
 * package.json and src-tauri/Cargo.toml carry the same number).
 */
import tauriConf from "../../src-tauri/tauri.conf.json";

export const APP_NAME = tauriConf.productName;
/** As people read it: "1.12.0" is "1.12"; a patch release keeps its third number. */
export const APP_VERSION = tauriConf.version.replace(/\.0$/, "");
