/** The conversation: the person's messages, the agent's answers, thoughts and tool calls. */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useAgent } from "./store";
import type { Item, LiveBlock } from "./transcript";
import { Markdown } from "./Markdown";
import { mcpToolName } from "./mcpConfig";
import { hasKey, t } from "../i18n";
import { ChevronRightIcon, TargetIcon } from "../ui/icons";

const PREFIX = "mcp__edukors__";
export const shortTool = (name: string) => (name.startsWith(PREFIX) ? name.slice(PREFIX.length) : name);

const fileName = (path: unknown) => (typeof path === "string" ? path.split("/").pop() : undefined);
const host = (url: unknown) => {
  try {
    return new URL(String(url)).host;
  } catch {
    return typeof url === "string" ? url : undefined;
  }
};

/** What a tool call does, in the person's words, and on what. */
export function toolLabel(name: string, input: Record<string, unknown>): { label: string; detail?: string } {
  const tool = shortTool(name);
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);
  switch (tool) {
    case "read_course":
      return Array.isArray(input.nodes) && input.nodes.length ? { label: t("agent.tool.read_nodes", { nodes: input.nodes.join(", ") }) } : { label: t("agent.tool.read_course") };
    case "get_schema":
      return { label: t("agent.tool.get_schema"), detail: str(input.definition) };
    case "edit_course":
    case "replace_course":
      return { label: t(`agent.tool.${tool}`), detail: str(input.summary) };
    case "new_course":
      return { label: t("agent.tool.new_course"), detail: str(input.title) };
    case "show_node":
      return { label: t("agent.tool.show_node", { id: String(input.id ?? "") }) };
    case "Read":
      return { label: t("agent.tool.Read"), detail: fileName(input.file_path) };
    case "Glob":
    case "Grep":
      return { label: t(`agent.tool.${tool}`), detail: str(input.pattern) };
    case "WebSearch":
      return { label: t("agent.tool.WebSearch"), detail: str(input.query) };
    case "WebFetch":
      return { label: t("agent.tool.WebFetch"), detail: host(input.url) };
    case "Bash":
      return { label: t("agent.tool.Bash"), detail: str(input.description) };
    case "Skill":
      return { label: t("agent.tool.Skill"), detail: str(input.skill) ?? str(input.command) };
    default:
      return { label: hasKey(`agent.tool.${tool}`) ? t(`agent.tool.${tool}`) : mcpToolName(tool) };
  }
}

type Op = Record<string, any>;

/** The operations of an edit, one line each: what happens to which step. */
export function OpsList({ tool, input }: { tool: string; input: Record<string, unknown> }) {
  if (shortTool(tool) === "replace_course") {
    const c = (input.course ?? {}) as { nodes?: unknown[]; edges?: unknown[] };
    return <p className="agent-ops-note">{t("agent.op.nodes", { n: c.nodes?.length ?? 0, e: c.edges?.length ?? 0 })}</p>;
  }
  const ops: Op[] = Array.isArray(input.operations) ? (input.operations as Op[]) : [];
  if (!ops.length) return null;
  return (
    <ul className="agent-ops">
      {ops.map((op, i) => {
        const [mark, text] = opLine(op);
        return (
          <li key={i}>
            <span className={`agent-op-mark agent-op-${op?.op}`}>{mark}</span>
            <span>{text}</span>
          </li>
        );
      })}
    </ul>
  );
}

function opLine(op: Op): [string, string] {
  const typeName = (type: unknown) => (hasKey(`type.${type}`) ? t(`type.${type}`) : String(type ?? ""));
  const title = (loc: unknown) => (Array.isArray(loc) ? String(loc.find((e) => e?.text)?.text ?? "") : "");
  switch (op?.op) {
    case "add_node": {
      const name = title(op.node?.title);
      return ["+", `${t("agent.op.add", { id: op.node?.id ?? "" }).trim()} · ${typeName(op.node?.type)}${name ? ` · “${name}”` : ""}`];
    }
    case "update_node":
      return ["✎", `${t("agent.op.update", { id: op.id })} (${["title", "content", "section"].filter((k) => op[k] !== undefined).join(", ")})`];
    case "delete_node":
      return ["−", t("agent.op.delete", { id: op.id })];
    case "rename_node":
      return ["↻", t("agent.op.rename", { id: op.id, to: op.new_id })];
    case "set_edges":
      return ["→", `${t("agent.op.edges", { id: op.from })}: ${(Array.isArray(op.edges) ? op.edges : []).map((e: Op) => e?.to).join(", ") || "—"}`];
    case "update_info":
      return ["ⓘ", `${t("agent.op.info")}: ${Object.keys(op.info ?? {}).join(", ")}`];
    default:
      return ["?", String(op?.op ?? "")];
  }
}

function Todos({ input }: { input: Record<string, unknown> }) {
  const todos = Array.isArray(input.todos) ? (input.todos as { content?: string; status?: string; activeForm?: string }[]) : [];
  return (
    <ul className="agent-todos">
      {todos.map((todo, i) => (
        <li key={i} className={`agent-todo agent-todo-${todo.status}`}>
          <span className="agent-todo-box">{todo.status === "completed" ? "✓" : todo.status === "in_progress" ? "◐" : ""}</span>
          <span>{todo.status === "in_progress" ? todo.activeForm || todo.content : todo.content}</span>
        </li>
      ))}
    </ul>
  );
}

/** One step of the agent's work, with the dot of the timeline. */
const Step = ({ dot, children, className = "" }: { dot: string; children: ReactNode; className?: string }) => (
  <div className={`agent-step ${className}`}>
    <span className={`agent-dot agent-dot-${dot}`} aria-hidden="true" />
    <div className="agent-step-body">{children}</div>
  </div>
);

function ToolItem({ item }: { item: Extract<Item, { kind: "tool" }> }) {
  const tool = shortTool(item.name);
  const [open, setOpen] = useState(false);
  const { label, detail } = toolLabel(item.name, item.input);
  if (tool === "TodoWrite")
    return (
      <Step dot={item.status === "error" ? "error" : "done"}>
        <div className="agent-tool-head">
          <strong>{label}</strong>
        </div>
        <Todos input={item.input} />
      </Step>
    );
  const hasOps = tool === "edit_course" || tool === "replace_course";
  return (
    <Step dot={item.status === "running" ? "running" : item.status === "error" ? "error" : "done"} className="agent-tool">
      <button type="button" className="agent-tool-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <strong>{label}</strong>
        {detail && <span className="agent-tool-detail">{detail}</span>}
        <ChevronRightIcon size={14} className={`icon agent-chevron ${open ? "is-open" : ""}`} />
      </button>
      {open && (
        <div className="agent-tool-body">
          {hasOps ? (
            <OpsList tool={item.name} input={item.input} />
          ) : (
            <>
              <div className="agent-tool-label">{t("agent.input")}</div>
              <pre className="agent-pre">{JSON.stringify(item.input, null, 2)}</pre>
            </>
          )}
          {item.result !== undefined && item.result !== "" && (
            <>
              <div className="agent-tool-label">{t("agent.result")}</div>
              <pre className={`agent-pre ${item.status === "error" ? "is-error" : ""}`}>{item.result}</pre>
            </>
          )}
        </div>
      )}
    </Step>
  );
}

function Thinking({ text, live }: { text: string; live?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Step dot="thinking" className="agent-thinking">
      <button type="button" className="agent-tool-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <em>{live ? t("agent.thinking") : t("agent.thought")}</em>
        <ChevronRightIcon size={14} className={`icon agent-chevron ${open ? "is-open" : ""}`} />
      </button>
      {open && <div className="agent-thinking-text">{text}</div>}
    </Step>
  );
}

const time = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

export function Notice({ item }: { item: Extract<Item, { kind: "notice" }> }) {
  const code = item.code ?? "";
  const key = code.startsWith("err.") ? `agent.${code}` : `agent.n.${code}`;
  let text = hasKey(key) ? t(key) : "";
  let detail = item.text;
  if (code === "rate_rejected" || code === "rate_warning") {
    text = t(`agent.n.${code}`, { when: item.text ? t("agent.n.resets", { time: time(item.text) }) : "" });
    detail = "";
  }
  if (code === "interrupted") detail = "";
  return (
    <div className={`agent-notice agent-notice-${item.level}`} role={item.level === "error" ? "alert" : undefined}>
      {text && <div>{text}</div>}
      {detail && <div className="agent-notice-detail">{detail}</div>}
    </div>
  );
}

function ItemView({ item }: { item: Item }) {
  switch (item.kind) {
    case "user":
      return (
        <div className="agent-user">
          <div className="agent-user-text">{item.text}</div>
          {item.context && (
            <div className="agent-user-context">
              <TargetIcon size={12} />
              <span>{item.context}</span>
            </div>
          )}
        </div>
      );
    case "text":
      return (
        <Step dot="text">
          <Markdown text={item.text} />
        </Step>
      );
    case "thinking":
      return <Thinking text={item.text} />;
    case "tool":
      return <ToolItem item={item} />;
    case "notice":
      return <Notice item={item} />;
    case "divider":
      return <div className="agent-divider">{t("agent.compacted")}</div>;
  }
}

function LiveView({ block }: { block: LiveBlock }) {
  if (block.type === "text")
    return block.text ? (
      <Step dot="text">
        <Markdown text={block.text} />
      </Step>
    ) : null;
  if (block.type === "thinking") return <Thinking text={block.text} live />;
  const { label } = toolLabel(block.name ?? "", {});
  return (
    <Step dot="running" className="agent-tool">
      <div className="agent-tool-head">
        <strong>{label}</strong>
      </div>
    </Step>
  );
}

/** The conversation, kept scrolled to its end while the person has not scrolled up. */
export function Messages({ empty }: { empty: ReactNode }) {
  const items = useAgent((s) => s.items);
  const live = useAgent((s) => s.live);
  const busy = useAgent((s) => s.busy);
  const asks = useAgent((s) => s.asks.length);
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useLayoutEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [items, live, busy, asks]);

  const streaming = live?.blocks.some((b) => !b.done);
  return (
    <div
      className="agent-messages"
      ref={box}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
      }}
      aria-live="polite"
    >
      {!items.length && !busy ? empty : null}
      {items.map((item) => (
        <ItemView key={item.key} item={item} />
      ))}
      {live?.blocks.map((block) => (
        <LiveView key={`${live.messageId}:${block.index}`} block={block} />
      ))}
      {busy && !streaming && !asks && (
        <div className="agent-working">
          <span className="spinner" /> {t("agent.thinking")}
        </div>
      )}
    </div>
  );
}
