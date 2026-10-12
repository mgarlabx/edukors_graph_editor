/**
 * A part's `extras` in the inspector: what other tools keep with it, which the
 * format does not define. A box shows them as JSON; the ✎, or a click on the
 * box, opens them in a JSON editor (ExtrasEditor). Optional: an empty box is
 * no extras at all. Written for any part that may have them (the course's
 * info, a node, an edge); `owner` tells them apart.
 */
import { lazy, Suspense, useState } from "react";
import { createPortal } from "react-dom";
import { useEditor } from "../store/editor";
import { stringify } from "../course/serialize";
import { Field, IconButton } from "../ui/controls";
import { EditIcon } from "../ui/icons";
import type { Extras } from "../schema/types";
import { t } from "../i18n";

const ExtrasEditor = lazy(() => import("./ExtrasEditor"));

export function ExtrasField({
  value,
  onChange,
  owner,
  help,
}: {
  value: unknown;
  /** undefined: take the extras away */
  onChange: (next: Extras | undefined) => void;
  owner: string;
  help?: string;
}) {
  const style = useEditor((s) => s.style);
  const [open, setOpen] = useState(false);
  const empty = value === undefined;
  const edit = () => setOpen(true);

  return (
    <Field
      label={
        <>
          {t("extras.label")} <span className="muted small">({t("insp.optional")})</span>
        </>
      }
      help={help}
      actions={
        <IconButton title={t("extras.edit")} onClick={edit}>
          <EditIcon size={15} />
        </IconButton>
      }
      hint={
        !empty && (
          <button className="link danger" onClick={() => onChange(undefined)}>
            {t("insp.remove")}
          </button>
        )
      }
    >
      <div
        className={`content-peek mono extras-peek ${empty ? "is-blank" : ""}`}
        role="button"
        tabIndex={0}
        title={t("extras.edit")}
        onClick={edit}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          edit();
        }}
      >
        <span className="content-peek-text">{empty ? t("extras.none") : stringify(value, { ...style, trailingNewline: false })}</span>
      </div>
      {/* over the page, so the inspector's scrolling never clips it */}
      {open &&
        createPortal(
          <Suspense fallback={null}>
            <ExtrasEditor value={value} owner={owner} title={t("extras.title")} onApply={onChange} onClose={() => setOpen(false)} />
          </Suspense>,
          document.body,
        )}
    </Field>
  );
}
