// The Graph Editor's bridge (window.graph), next to Common's EdukorsDesktop. Added to every page of the main session,
// it is exposed only on the app's own page; the main process checks the sender again on every call (index.ts).
import { contextBridge, ipcRenderer } from "electron";

const methods = ["prefsLoad", "prefsSave", "keyStatus", "keySet", "keyDelete", "aiPost", "aiModels", "legacyConversations", "frame", "frameForget", "export", "fullScreen"];
if (location.protocol === "file:" && /\/dist\/index\.html$/.test(location.pathname) && window === window.top)
  contextBridge.exposeInMainWorld("graph", {
    invoke: (method: string, ...args: unknown[]) => (methods.includes(method) ? ipcRenderer.invoke("graph:" + method, ...args) : Promise.reject(Error("Unknown method"))),
  });
