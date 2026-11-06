/**
 * The course file: `.egrx`, an Edukors package (Common's EdukorsPackage, docs/document-package.md there),
 * and the formats it meets: `.egf`/`.json` (opened as imports) and `.egf` (exported, for the player).
 *
 *   graph/course.json                    { format: "edukors.graph.course", version: 1, style, course }
 *   graph/_rels/course.json.rels         the AI conversations
 *   graph/ai/conversations/<id>.json     the course's AI conversations (Common)
 *   graph/ai/legacy-conversations.json   conversations kept by versions 2.19-2.20, when there were any
 *
 * `course` is an Edukors Graph course exactly as the .egf schema describes it: the schema never changes, and an
 * exported .egf is that course as it is. Media files of their own (pictures, videos) are not part of this version.
 *
 * This module never touches the file system, so the page and the main process share it.
 */
import "edukors-common-ux/src/package/package.js";
import "edukors-common-ux/src/ai/ui/ai-conversations.js";
import { DEFAULT_STYLE, detectStyle, stringify, syntaxErrorAt, type JsonStyle } from "./serialize";
import type { Course } from "../schema/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
const pkg = () => (globalThis as any).EdukorsPackage;
const conversationsLayer = () => (globalThis as any).EdukorsAiConversations;

export const APP = "graph";
export const MAIN = "graph/course.json";
export const FORMAT = "edukors.graph.course";
export const VERSION = 1;
export const EXTENSION = ".egrx";

const REL_LEGACY = "https://edukors.org/package/relationships/legacy-conversations";
const LEGACY_PART = "graph/ai/legacy-conversations.json";

export interface CourseFile {
  course: Course;
  /** the JSON style of the .egf the course came from, so that exporting it writes the same bytes */
  style: JsonStyle;
  /** the course's AI conversations, as Common's assistant keeps them */
  conversations: unknown[];
  /** conversations of versions 2.19-2.20, kept whole (JSON bytes) */
  legacyConversations?: Uint8Array;
}

export class CourseFileError extends Error {}

const titleOf = (course: Course): string => {
  const info = (course as any)?.info;
  const entries = Array.isArray(info?.title) ? info.title : [];
  const own = entries.find((e: any) => e?.lang === info?.["source-language"]);
  return String(own?.text ?? entries.find((e: any) => e?.text)?.text ?? "");
};

const isCourse = (value: unknown): value is Course =>
  !!value && typeof value === "object" && !Array.isArray(value) && "nodes" in (value as object);

const styleOf = (raw: unknown): JsonStyle => {
  const s = (raw ?? {}) as Partial<JsonStyle>;
  return {
    indent: typeof s.indent === "string" && /^( {1,8}|\t)$/.test(s.indent) ? s.indent : DEFAULT_STYLE.indent,
    trailingNewline: typeof s.trailingNewline === "boolean" ? s.trailingNewline : DEFAULT_STYLE.trailingNewline,
    ascii: typeof s.ascii === "boolean" ? s.ascii : DEFAULT_STYLE.ascii,
  };
};

/** The course as an .egrx. */
export async function encodeEgrx(file: CourseFile, { version = "dev" }: { version?: string } = {}): Promise<Uint8Array> {
  if (!isCourse(file.course)) throw new CourseFileError("There is no course to save.");
  const parts: { name: string; contentType: string; content: Uint8Array }[] = [];
  const relationships: { id: string; type: string; target: string }[] = [];
  if (file.legacyConversations) {
    parts.push({ name: LEGACY_PART, contentType: "application/json", content: file.legacyConversations });
    relationships.push({ id: "rIdLegacyConversations", type: REL_LEGACY, target: "ai/legacy-conversations.json" });
  }
  const conversations = conversationsLayer().toPackage(APP, file.conversations ?? []);
  const language = (file.course as any)?.info?.["source-language"];
  return pkg().write({
    app: { name: APP, version },
    main: {
      name: MAIN,
      contentType: pkg().contentType(APP, "course"),
      content: { format: FORMAT, version: VERSION, style: styleOf(file.style), course: file.course },
      relationships: [...relationships, ...conversations.relationships],
    },
    parts: [...parts, ...conversations.parts],
    properties: { title: titleOf(file.course) || undefined, language: typeof language === "string" && language ? language : undefined },
  });
}

/** An .egrx, read strictly: a file is untrusted input. Throws CourseFileError with a message for the person. */
export async function decodeEgrx(bytes: Uint8Array): Promise<CourseFile> {
  let doc: any;
  try {
    doc = await pkg().read(bytes);
  } catch (e) {
    throw new CourseFileError((e as Error)?.message || "This is not a valid course file.");
  }
  if (doc.main.name !== MAIN || doc.main.contentType !== pkg().contentType(APP, "course")) throw new CourseFileError("This document belongs to another EDUKORS app.");
  const raw = doc.json(MAIN);
  if (raw?.format !== FORMAT) throw new CourseFileError("This is not an Edukors Graph course.");
  if (!Number.isInteger(raw.version) || raw.version > VERSION) throw new CourseFileError("This course was saved by a newer version of the editor.");
  if (!isCourse(raw.course)) throw new CourseFileError("The course in this file is damaged.");
  const legacy = doc.relationships(MAIN).find((rel: any) => !rel.external && rel.type === REL_LEGACY && rel.target === LEGACY_PART);
  let conversations: unknown[] = [];
  try {
    conversations = conversationsLayer().fromPackage(doc);
  } catch {
    conversations = [];
  }
  return { course: raw.course, style: styleOf(raw.style), conversations, ...(legacy ? { legacyConversations: doc.bytes(legacy.target) } : {}) };
}

/** An .egf (or an older .json) course, opened as an import: its text checked, its JSON style kept. */
export function importEgf(text: string): CourseFile {
  const raw = text.replace(/^﻿/, "");
  let course: unknown;
  try {
    course = JSON.parse(raw);
  } catch {
    const at = syntaxErrorAt(raw);
    throw new CourseFileError(at ? `This file is not valid JSON (line ${at.line}, column ${at.column}).` : "This file is not valid JSON.");
  }
  if (!isCourse(course)) throw new CourseFileError("This file is not an Edukors Graph course.");
  return { course, style: detectStyle(raw), conversations: [] };
}

/** The course as an .egf for the player, the Moodle plugin or the gallery: the course as it is, in its own JSON style. */
export const exportEgf = (file: Pick<CourseFile, "course" | "style">): string => stringify(file.course, file.style);
