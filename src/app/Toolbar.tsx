import { useEffect, useRef, useState } from "react";
import { courseLangs, useEditor, type Tab } from "../store/editor";
import { useUi } from "../store/ui";
import { createCourse, openCourse, saveCourse } from "./files";
import { copyNodes, cutNodes, deleteSelection, pasteNodesFromClipboard } from "./clipboard";
import { INSERT_GROUPS, NODE_DRAG, insertNode } from "./insert";
import { TYPE_STYLE } from "../course/nodeTypes";
import { typeDescription } from "../schema/describe";
import { IconButton } from "../ui/controls";
import {
  AiIcon,
  CheckCircleIcon,
  CopyIcon,
  CutIcon,
  ErrorIcon,
  GlobeIcon,
  HelpIcon,
  JsonIcon,
  LayoutIcon,
  MapIcon,
  NewFileIcon,
  OpenIcon,
  PasteIcon,
  PlusIcon,
  PreviewIcon,
  RedoIcon,
  SaveIcon,
  SettingsIcon,
  SidebarIcon,
  TrashIcon,
  UndoIcon,
  WarningIcon,
} from "../ui/icons";
import { t } from "../i18n";

const TABS: { id: Tab; Icon: typeof MapIcon; key: string }[] = [
  { id: "canvas", Icon: MapIcon, key: "⌘M" },
  { id: "json", Icon: JsonIcon, key: "⌘J" },
  { id: "preview", Icon: PreviewIcon, key: "⌘P" },
];

export function Toolbar() {
  const course = useEditor((s) => s.course);
  const tab = useEditor((s) => s.tab);
  const setTab = useEditor((s) => s.setTab);
  const canvasLang = useEditor((s) => s.canvasLang);
  const setCanvasLang = useEditor((s) => s.setCanvasLang);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const hasSelection = useEditor((s) => s.selection.nodes.length > 0);
  const canDelete = useEditor((s) => s.selection.nodes.length > 0 || s.selection.edge !== null);
  const onCanvas = !!course && tab === "canvas";
  const open = useUi((s) => s.open);
  const agentOpen = useUi((s) => s.agent);
  const inspectorOpen = useUi((s) => s.inspector);
  const previewSideOpen = useUi((s) => s.previewSide);
  const sidebarOpen = agentOpen || (tab === "preview" ? previewSideOpen : inspectorOpen);

  return (
    <header className="toolbar" role="toolbar" aria-label="Edukors Graph Editor">
      <div className="tool-group">
        <IconButton title={`${t("file.new")} (⌘N)`} onClick={createCourse}>
          <NewFileIcon />
        </IconButton>
        <IconButton title={`${t("file.open")} (⌘O)`} onClick={() => openCourse()}>
          <OpenIcon />
        </IconButton>
        <IconButton title={`${t("file.save")} (⌘S)`} onClick={() => saveCourse(false)} disabled={!course}>
          <SaveIcon />
        </IconButton>
      </div>
      <span className="divider" />
      <div className="tool-group">
        <IconButton title={`${t("edit.undo")} (⌘Z)`} disabled={!canUndo} onClick={() => useEditor.getState().undo()}>
          <UndoIcon />
        </IconButton>
        <IconButton title={`${t("edit.redo")} (⇧⌘Z)`} disabled={!canRedo} onClick={() => useEditor.getState().redo()}>
          <RedoIcon />
        </IconButton>
      </div>
      <span className="divider" />
      <div className="tool-group">
        <InsertMenu disabled={!course} />
        <IconButton title={`${t("edit.cut")} (⌘X)`} disabled={!onCanvas || !hasSelection} onClick={cutNodes}>
          <CutIcon />
        </IconButton>
        <IconButton title={`${t("edit.copy")} (⌘C)`} disabled={!onCanvas || !hasSelection} onClick={copyNodes}>
          <CopyIcon />
        </IconButton>
        <IconButton title={`${t("edit.paste")} (⌘V)`} disabled={!onCanvas} onClick={pasteNodesFromClipboard}>
          <PasteIcon />
        </IconButton>
        <IconButton title={`${t("edit.delete")} (⌫)`} disabled={!onCanvas || !canDelete} onClick={deleteSelection} className="danger">
          <TrashIcon />
        </IconButton>
      </div>
      {course && (
        <>
          <span className="divider" />
          <div className="tool-group view-tabs" role="tablist">
            {TABS.map(({ id, Icon, key }) => (
              <IconButton
                key={id}
                role="tab"
                aria-selected={tab === id}
                title={`${t(`tab.${id}`)} (${key})`}
                className={tab === id ? "is-active" : ""}
                onClick={() => setTab(id)}
              >
                <Icon />
              </IconButton>
            ))}
          </div>
          <span className="divider" />
          <div className="tool-group">
            <label className="tool-select" title={t("canvas.langHint")}>
              <GlobeIcon />
              <select className="input input-small" value={canvasLang} onChange={(e) => setCanvasLang(e.target.value)} aria-label={t("canvas.langHint")}>
                {courseLangs(course).map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
            <IconButton title={`${t("canvas.layout")} (⇧⌘L)`} onClick={() => useEditor.getState().requestLayout()}>
              <LayoutIcon />
            </IconButton>
            <ValidationBadge />
          </div>
        </>
      )}
      <span className="divider" />
      <div className="tool-group">
        <IconButton title={`${t("prefs.title")} (⌘,)`} onClick={() => open("prefs")}>
          <SettingsIcon />
        </IconButton>
        <IconButton title={t("help.title")} onClick={() => open("help")}>
          <HelpIcon />
        </IconButton>
      </div>
      {course && (
        <div className="tool-group tool-group-end">
          <IconButton
            title={`${t("sidebar.toggle")} (⌥⌘0)`}
            className={sidebarOpen ? "is-active" : ""}
            aria-pressed={sidebarOpen}
            onClick={() => useUi.getState().toggleSidebar(tab === "preview")}
          >
            <SidebarIcon />
          </IconButton>
          <IconButton
            title={`${t("agent.title")} (⇧⌘A)`}
            className={`tool-agent ${agentOpen ? "is-active" : ""}`}
            aria-pressed={agentOpen}
            onClick={() => useUi.getState().toggleAgent()}
          >
            <AiIcon />
          </IconButton>
        </div>
      )}
    </header>
  );
}

/** The + and its list of the ten types, to click or to drag onto the map; it closes on a pick, a click outside or Esc. */
function InsertMenu({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    // Captured: the map's pane stops the pointer's events from going further up.
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <span className="insert-wrap" ref={wrap}>
      <IconButton
        title={t("insert.button")}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={open ? "is-active" : ""}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <PlusIcon />
      </IconButton>
      {open && !disabled && (
        <div className="insert-menu" role="menu" aria-label={t("insert.button")}>
          {INSERT_GROUPS.map(({ label, types }) => (
            <div key={label} role="group" aria-label={t(label)}>
              <div className="insert-label">{t(label)}</div>
              {types.map((type) => (
                <button
                  key={type}
                  type="button"
                  role="menuitem"
                  className="insert-item"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(NODE_DRAG, type);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onDragEnd={() => setOpen(false)}
                  onClick={() => {
                    setOpen(false);
                    insertNode(type);
                  }}
                  title={typeDescription(type)}
                  style={{ "--type-color": TYPE_STYLE[type].color } as React.CSSProperties}
                >
                  <span className="insert-icon">{TYPE_STYLE[type].icon}</span>
                  <span>{t(`type.${type}`)}</span>
                </button>
              ))}
            </div>
          ))}
          <p className="insert-hint">{t("insert.hint")}</p>
        </div>
      )}
    </span>
  );
}

function ValidationBadge() {
  const d = useEditor((s) => s.diagnostics);
  const toggle = useUi((s) => s.toggleBottom);
  if (!d) return null;
  const state = d.errors ? "error" : d.warnings ? "warning" : "ok";
  return (
    <button type="button" className={`icon-btn tool-badge tool-badge-${state}`} onClick={() => toggle("problems")} title={`${t("problems.title")} (⇧⌘M)`} aria-label={t("problems.title")}>
      {!d.errors && !d.warnings && <CheckCircleIcon />}
      {d.errors > 0 && (
        <span className="tool-count">
          <ErrorIcon /> {d.errors}
        </span>
      )}
      {d.warnings > 0 && (
        <span className="tool-count tool-count-warning">
          <WarningIcon /> {d.warnings}
        </span>
      )}
    </button>
  );
}
