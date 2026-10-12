/**
 * Monaco, set up once for every editor that uses it: the JSON tab's and the
 * extras editor's. Each model is checked against its own schema, by file name:
 * the course against the format (…/course.json), a part's extras only as an
 * object (…/extras.json).
 */
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/language/json/json.worker?worker";
import schema from "../schema/schema.json";

self.MonacoEnvironment = {
  getWorker: (_: string, label: string) => (label === "json" ? new JsonWorker() : new EditorWorker()),
};
loader.config({ monaco });
monaco.json.jsonDefaults.setDiagnosticsOptions({
  validate: true,
  allowComments: false,
  enableSchemaRequest: false,
  schemas: [
    { uri: schema.$id, fileMatch: ["course.json"], schema },
    // Empty is allowed here: the extras editor takes {} as "no extras".
    { uri: `${schema.$id}#extras`, fileMatch: ["extras.json"], schema: { type: "object", description: schema.$defs.extras.description } },
  ],
});

export { monaco };

export const isDark = () =>
  document.documentElement.getAttribute("data-theme") === "dark" ||
  (!document.documentElement.getAttribute("data-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
