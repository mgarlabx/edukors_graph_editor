/**
 * The courses open at once, one tab each. A click shows a course, the cross
 * (or a middle click) closes it, dragging reorders; nodes copied in one tab
 * paste into another.
 */
import { isDirty, useEditor, type DocSlice } from "../store/editor";
import { activateDoc, moveDoc, useDocs } from "../store/docs";
import { closeDoc, createCourse, docLabel } from "./files";
import { IconButton } from "../ui/controls";
import { CloseIcon, PlusIcon } from "../ui/icons";
import { t } from "../i18n";
import { baseName, folderName, keyLabel } from "./os";

/** Marks a drag as a tab being moved. */
const DRAG = "application/edukors-tab";

const fileOf = (path: string | null) => (path ? baseName(path) : null);

export function DocTabs() {
  const order = useDocs((s) => s.order);
  const parked = useDocs((s) => s.parked);
  const active = useEditor((s) => s.docId);
  const livePath = useEditor((s) => s.path);
  // Two files of the same name: each tab also shows its folder.
  const files = order.map((id) => fileOf(id === active ? livePath : (parked[id]?.path ?? null)));
  return (
    <div className="doc-tabs" role="tablist" aria-label={t("tabs.label")}>
      {order.map((id, i) => (
        <DocTab key={id} id={id} active={id === active} twin={!!files[i] && files.filter((f) => f === files[i]).length > 1} />
      ))}
      <IconButton className="doc-tabs-add" title={`${t("file.new")} (${keyLabel("⌘N")})`} onClick={createCourse}>
        <PlusIcon size={16} />
      </IconButton>
    </div>
  );
}

function DocTab({ id, active, twin }: { id: string; active: boolean; twin: boolean }) {
  const live = useEditor((s) => (s.docId === id ? s : null));
  const parked = useDocs((s) => s.parked[id]);
  const doc: DocSlice | undefined = live ?? parked;
  if (!doc) return null;
  const dirty = isDirty(doc);
  const label = docLabel(doc);
  return (
    <div
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      className={`doc-tab ${active ? "is-active" : ""} ${dirty ? "is-dirty" : ""}`}
      title={doc.path ?? t("file.untitledHint", { name: label })}
      onClick={() => activateDoc(id)}
      onAuxClick={(e) => {
        if (e.button !== 1) return;
        e.preventDefault();
        closeDoc(id);
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        activateDoc(id);
      }}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG, id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DRAG)) e.preventDefault();
      }}
      onDrop={(e) => {
        const from = e.dataTransfer.getData(DRAG);
        if (!from || from === id) return;
        e.preventDefault();
        const box = e.currentTarget.getBoundingClientRect();
        moveDoc(from, id, e.clientX > box.left + box.width / 2);
      }}
    >
      <span className="doc-tab-name">{label}</span>
      {twin && doc.path && <span className="doc-tab-folder">{folderName(doc.path)}</span>}
      <button
        type="button"
        className="doc-tab-close"
        title={`${t("tabs.close")} (${keyLabel("⌘W")})`}
        aria-label={`${t("tabs.close")}: ${label}`}
        onClick={(e) => {
          e.stopPropagation();
          closeDoc(id);
        }}
      >
        {dirty && <span className="doc-tab-dot" aria-hidden="true" />}
        <CloseIcon size={14} />
      </button>
    </div>
  );
}
