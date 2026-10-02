import type { Course } from "../schema/types";
import { newNode, SCHEMA_URL } from "./nodeTypes";

const today = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const uuid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });

/** A new course (plan 5.8): a UUID, today's date, 1.0.0, the schema address and one sm1 to start from. */
export const newCourse = (lang: string, title: string, author = ""): Course => {
  const start = newNode("static-md", "sm1", [lang]);
  start.title = [{ lang, text: title }];
  return {
    $schema: SCHEMA_URL,
    info: {
      "course-id": uuid(),
      "source-language": lang,
      "other-languages": [],
      title: [{ lang, text: title }],
      author,
      version: "1.0.0",
      date: today(),
      start: "sm1",
    },
    nodes: [start],
    edges: [],
  };
};
