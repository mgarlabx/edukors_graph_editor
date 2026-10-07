import "./polyfills";
import React from "react";
import ReactDOM from "react-dom/client";
import "@xyflow/react/dist/style.css";
import "./styles.css";
import App from "./App";
import { useEditor } from "./store/editor";
import { useDocs } from "./store/docs";
import { useUi } from "./store/ui";
import { useAgent } from "./agent/store";

// For the end-to-end tests: the stores, in development builds only.
if (import.meta.env.DEV) Object.assign(window, { __editor: useEditor, __docs: useDocs, __ui: useUi, __agent: useAgent });

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
