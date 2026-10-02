/**
 * In-app dialogs that return a promise: the three-way "unsaved changes" choice,
 * a confirmation and a one-line prompt, in the editor's own language (the
 * native ones only offer two buttons).
 */
import { create } from "zustand";
import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";

type Choice = { id: string; label: string; primary?: boolean; danger?: boolean };

interface Pending {
  title: string;
  message: string;
  choices: Choice[];
  input?: { value: string; placeholder?: string };
  resolve: (choice: string, value?: string) => void;
}

const useDialogs = create<{ pending: Pending | null; open(p: Pending): void; close(): void }>()((set) => ({
  pending: null,
  open: (pending) => set({ pending }),
  close: () => set({ pending: null }),
}));

const ask = (title: string, message: string, choices: Choice[], input?: Pending["input"]) =>
  new Promise<{ choice: string; value?: string }>((resolve) =>
    useDialogs.getState().open({
      title,
      message,
      choices,
      input,
      resolve: (choice, value) => {
        useDialogs.getState().close();
        resolve({ choice, value });
      },
    }),
  );

/** Whether one of these dialogs is waiting for an answer. */
export const isDialogOpen = () => useDialogs.getState().pending !== null;

/** `name`: the course asked about, there being several open at once. */
export const askUnsaved = async (name: string): Promise<"save" | "discard" | "cancel"> =>
  (
    await ask(t("unsaved.title"), t("unsaved.message", { name }), [
      { id: "cancel", label: t("common.cancel") },
      { id: "discard", label: t("unsaved.discard"), danger: true },
      { id: "save", label: t("common.save"), primary: true },
    ])
  ).choice as "save" | "discard" | "cancel";

export const confirm = async (message: string, title = t("common.confirm"), ok = t("common.ok"), danger = false) =>
  (
    await ask(title, message, [
      { id: "cancel", label: t("common.cancel") },
      { id: "ok", label: ok, primary: !danger, danger },
    ])
  ).choice === "ok";

export const prompt = async (title: string, message: string, value = "", placeholder?: string): Promise<string | null> => {
  const r = await ask(title, message, [{ id: "cancel", label: t("common.cancel") }, { id: "ok", label: t("common.ok"), primary: true }], {
    value,
    placeholder,
  });
  return r.choice === "ok" ? (r.value ?? "") : null;
};

export const notify = async (title: string, message: string) => {
  await ask(title, message, [{ id: "ok", label: t("common.ok"), primary: true }]);
};

export function DialogHost() {
  const pending = useDialogs((s) => s.pending);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setValue(pending?.input?.value ?? "");
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [pending]);
  if (!pending) return null;
  const primary = pending.choices.find((c) => c.primary) ?? pending.choices[pending.choices.length - 1];
  return (
    <div className="modal-backdrop" onKeyDown={(e) => e.key === "Escape" && pending.resolve("cancel")}>
      <div className="modal modal-small" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title">
        <h2 id="dialog-title">{pending.title}</h2>
        <p className="pre">{pending.message}</p>
        {pending.input && (
          <input
            ref={inputRef}
            className="input wide"
            value={value}
            placeholder={pending.input.placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && pending.resolve(primary.id, value)}
          />
        )}
        <div className="modal-actions">
          {pending.choices.map((c, i) => (
            <button
              key={c.id}
              autoFocus={!pending.input && i === pending.choices.length - 1}
              className={`btn ${c.primary ? "btn-primary" : ""} ${c.danger ? "btn-danger" : ""}`}
              onClick={() => pending.resolve(c.id, value)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
