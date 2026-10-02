/**
 * Help texts read from the schema itself (plan 5.2): every `description` and
 * every `x-enumDescriptions` becomes a tooltip, so the editor's help changes
 * when the schema does, with nothing to keep in sync by hand.
 */
import schema from "./schema.json";

type Def = { description?: string; properties?: Record<string, Def>; $ref?: string; "x-enumDescriptions"?: Record<string, string> };

const defs = (schema as unknown as { $defs: Record<string, Def> }).$defs;

const resolve = (d: Def | undefined): Def | undefined => {
  if (!d?.$ref) return d;
  const name = d.$ref.replace("#/$defs/", "");
  return { ...defs[name], ...d, $ref: undefined, description: d.description ?? defs[name]?.description };
};

/** describe("quizQuestion", "key") — the description of a property, or of the definition itself. */
export const describe = (def: string, prop?: string): string => {
  const d = def === "course" ? (schema as unknown as Def) : defs[def];
  if (!d) return "";
  if (!prop) return d.description ?? "";
  return resolve(d.properties?.[prop])?.description ?? "";
};

/** The x-enumDescriptions entry for a value: node types, field types, operators. */
export const enumDescription = (def: string, prop: string | null, value: string): string => {
  const d = prop ? resolve(defs[def]?.properties?.[prop]) : defs[def];
  return d?.["x-enumDescriptions"]?.[value] ?? "";
};

export const typeDescription = (type: string) => enumDescription("nodeType", null, type);

export const CONTENT_DEF: Record<string, string> = {
  "static-md": "staticMdContent",
  "static-html": "staticHtmlContent",
  "dynamic-md": "dynamicMdContent",
  "dynamic-html": "dynamicHtmlContent",
  quiz: "quizContent",
  form: "formContent",
  bool: "boolContent",
  choice: "choiceContent",
  score: "scoreContent",
  noul: "noulContent",
};
