/**
 * Layer 1: the course against the embedded schema.json, through Ajv.
 *
 * Ajv reports the way a schema is built, not the way an author thinks: a bad
 * condition comes back as three failed branches of a oneOf, a quiz node with a
 * wrong id as a failed if/then. readable() folds those into one sentence each:
 * a key of the locales, shown in the interface's language, and in English in
 * the issue's message, which is what the agent reads.
 */
import Ajv2020, { type ErrorObject } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import schema from "./schema.json";
import { t, translate, type Params } from "../i18n";
import type { Issue } from "../validate/rules";

const ajv = new Ajv2020({ allErrors: true, strict: false, allowUnionTypes: true });
addFormats(ajv);
ajv.addKeyword({ keyword: "x-enumDescriptions", schemaType: "object" });

export const validateSchema = ajv.compile(schema);
const nodeSchema = ajv.getSchema(`${schema.$id}#/$defs/node`)!;

/** Validates a single node, as the generator does before it shows a draft. */
export const validateNodeSchema = (node: unknown): string[] =>
  nodeSchema(node) ? [] : collapse(nodeSchema.errors ?? []).map((e) => `${e.instancePath || "/"} ${t(...readable(e))}`);

/** Drops the errors that only explain another one: failed branches and if/then wrappers. */
const collapse = (errors: ErrorObject[]): ErrorObject[] => {
  const oneOfPaths = errors.filter((e) => e.keyword === "oneOf").map((e) => e.instancePath);
  return errors.filter((e) => {
    if (e.keyword === "if") return false;
    if (e.keyword !== "oneOf" && e.schemaPath.includes("/oneOf/"))
      return !oneOfPaths.some((p) => e.instancePath === p || e.instancePath.startsWith(p + "/"));
    // "contains" is reported alongside minContains/maxContains, which say it better
    if (e.keyword === "contains" && errors.some((o) => o.instancePath === e.instancePath && o.keyword !== "contains"))
      return false;
    return true;
  });
};

const readable = (e: ErrorObject): [key: string, params: Params] => {
  const p = e.params as Record<string, unknown>;
  switch (e.keyword) {
    case "required":
      return ["ajv.required", { field: String(p.missingProperty) }];
    case "additionalProperties":
      return ["ajv.additional", { field: String(p.additionalProperty) }];
    case "pattern":
      if (e.instancePath === "/info/start") return ["ajv.start", {}];
      return ["ajv.pattern", { pattern: String(p.pattern) }];
    case "type":
      return ["ajv.type", { type: String(p.type) }];
    case "enum":
      return ["ajv.enum", { values: (p.allowedValues as unknown[]).join(", ") }];
    case "const":
      return ["ajv.const", { value: JSON.stringify(p.allowedValue) }];
    case "minItems":
      return ["ajv.minItems", { limit: String(p.limit) }];
    case "maxItems":
      return ["ajv.maxItems", { limit: String(p.limit) }];
    case "minProperties":
      return ["ajv.minProperties", { limit: String(p.limit) }];
    case "maxProperties":
      return ["ajv.maxProperties", { limit: String(p.limit) }];
    case "minLength":
      return ["ajv.minLength", {}];
    case "minimum":
      return ["ajv.minimum", { limit: String(p.limit) }];
    case "format":
      return ["ajv.format", { format: String(p.format) }];
    case "uniqueItems":
      return ["ajv.unique", {}];
    case "contains":
    case "minContains":
    case "maxContains":
      return ["ajv.oneCorrect", {}];
    case "oneOf":
      return ["ajv.condition", {}];
    case "not":
      return ["ajv.not", {}];
    case "propertyNames":
      return ["ajv.propertyName", {}];
    default:
      return ["ajv.other", { keyword: e.keyword }];
  }
};

/** Where an instance path points, in the editor's terms. */
const locate = (course: unknown, path: string): { where: string; node?: string; edge?: number } => {
  const parts = path.split("/").slice(1);
  if (parts[0] === "nodes" && parts.length > 1) {
    const node = (course as { nodes?: { id?: unknown }[] })?.nodes?.[Number(parts[1])];
    const id = typeof node?.id === "string" ? node.id : undefined;
    const rest = parts.slice(2).join(".");
    return { where: id ? `node ${id}${rest ? "." + rest : ""}` : `nodes[${parts[1]}]`, node: id };
  }
  if (parts[0] === "edges" && parts.length > 1) {
    const edge = (course as { edges?: { from?: unknown; to?: unknown }[] })?.edges?.[Number(parts[1])];
    const rest = parts.slice(2).join(".");
    return {
      where: `edge ${String(edge?.from)} -> ${String(edge?.to)}${rest ? "." + rest : ""}`,
      edge: Number(parts[1]),
    };
  }
  return { where: parts.join(".") || "course" };
};

export const schemaIssues = (course: unknown): Issue[] => {
  if (validateSchema(course)) return [];
  const seen = new Set<string>();
  const out: Issue[] = [];
  for (const e of collapse(validateSchema.errors ?? [])) {
    const { where, node, edge } = locate(course, e.instancePath);
    const [code, params] = readable(e);
    const message = translate("en", code, params);
    const id = `${where}|${message}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ level: "error", where, message, code, params, node, edge, source: "schema" });
  }
  return out;
};
