/**
 * Where the person writes, and the settings of the conversation below it:
 * whether the selection goes along, the files attached (as cards over the
 * text), the mode, the model and its effort (with the account and its usage),
 * send or stop. Which provider runs the agent is chosen in the preferences.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAgent, type Effort, type Mode } from "./store";
import type { ModelInfo } from "./events";
import { fileName, shortName } from "./attachments";
import { selectionLabel } from "./context";
import {ModelOptions,ModePicker,uiText} from "@edukors/ai-ui";
import {usePrefs} from "../store/prefs";
import { useEditor } from "../store/editor";
import { isTauri, pickOpen } from "../app/platform";
import { t, useUiLang } from "../i18n";
import { CloseIcon, PaperclipIcon, SendIcon, StopIcon, TargetIcon } from "../ui/icons";

export function modelName(models: ModelInfo[], value: string): string {
  if(value!=='default')return models.find(m=>m.value===value)?.displayName??value;
  const own=models.find(m=>m.value==='default'),resolved=own?.resolved?models.find(m=>m.value===own.resolved)?.displayName:undefined;
  return uiText(usePrefs.getState().uiLang,'defaultModel')+(resolved?' ('+resolved+')':'');
}
function ConversationControls(){
 const s=useAgent(),lang=useUiLang();
 return <><ModePicker lang={lang} value={s.mode} disabled={s.busy||s.legacy} plan onChange={mode=>s.setMode(mode as Mode)}/><ModelOptions lang={lang} models={s.models.map(m=>({id:m.value,label:m.value==='default'?modelName(s.models,m.value):m.displayName,efforts:m.efforts}))} loading={s.modelsState==="loading"} error={s.modelsState==="error"} onRetry={()=>void s.retryModels()} value={s.model} effort={s.effort} disabled={s.busy||s.legacy} onModel={s.setModel} onEffort={e=>s.setEffort(e as Effort)}/></>;
}
/** The selection on the canvas, which goes along with the message unless turned off. */
function SelectionChip() {
  const withSelection = useAgent((s) => s.withSelection);
  const toggle = useAgent((s) => s.toggleSelection);
  // Re-rendered with the selection and the course's titles.
  useEditor((s) => s.selection);
  useEditor((s) => s.course);
  const label = selectionLabel();
  if (!label) return null;
  return (
    <button type="button" className={`agent-chip agent-selection ${withSelection ? "" : "is-off"}`} onClick={toggle} title={withSelection ? t("agent.selectionOn") : t("agent.selectionOff")} aria-pressed={withSelection}>
      <TargetIcon size={13} />
      <span className="agent-chip-text">{label}</span>
    </button>
  );
}

/** A file attached to the message: its name, shortened, and an × that takes it off. */
export function AttachmentCard({ path, onRemove }: { path: string; onRemove?: () => void }) {
  const name = fileName(path);
  return (
    <span className={`agent-attachment ${onRemove ? "" : "is-static"}`} title={path}>
      <PaperclipIcon size={12} />
      <span className="agent-attachment-name">{shortName(name)}</span>
      {onRemove && (
        <button type="button" className="agent-attachment-x" onClick={onRemove} title={t("agent.attachRemove", { name })} aria-label={t("agent.attachRemove", { name })}>
          <CloseIcon size={11} />
        </button>
      )}
    </span>
  );
}

export function Composer({ focusKey }: { focusKey: number }) {
  const busy = useAgent((s) => s.busy);
  const send = useAgent((s) => s.send);
  const interrupt = useAgent((s) => s.interrupt);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const area = useRef<HTMLTextAreaElement>(null);
  const legacy=useAgent(s=>s.legacy), bound=useAgent(s=>s.conversationDocument),docId=useEditor(s=>s.docId);
  const ready = !legacy && !!docId && bound===docId && (!!text.trim() || files.length > 0);

  // 0: the panel came on screen without asking for the focus (ContentEditor.tsx).
  useEffect(() => {
    if (focusKey) area.current?.focus();
  }, [focusKey]);

  // The box grows with the text, up to a point.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(220, el.scrollHeight)}px`;
  }, [text]);

  // A suggestion from the empty conversation lands here.
  useEffect(() => {
    const put = (e: Event) => {
      setText((e as CustomEvent<string>).detail);
      area.current?.focus();
    };
    window.addEventListener("agent-suggest", put);
    return () => window.removeEventListener("agent-suggest", put);
  }, []);

  const submit = () => {
    if (!ready || busy) return;
    void send(text, files);
    setText("");
    setFiles([]);
  };

  const attach = async () => {
    const path = await pickOpen([]);
    if (path) setFiles((list) => (list.includes(path) ? list : [...list, path]));
    area.current?.focus();
  };

  const detach = (path: string) => {
    setFiles((list) => list.filter((p) => p !== path));
    area.current?.focus();
  };

  return (
    <div className="agent-composer">
      {files.length > 0 && (
        <div className="agent-attachments">
          {files.map((path) => (
            <AttachmentCard key={path} path={path} onRemove={() => detach(path)} />
          ))}
        </div>
      )}
      <textarea
        ref={area}
        className="agent-input"
        rows={2}
        value={text}
        placeholder={busy ? t("agent.placeholderBusy") : t("agent.placeholder")}
        aria-label={t("agent.placeholder")}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape" && busy) {
            e.preventDefault();
            interrupt();
          }
        }}
      />
      <div className="agent-composer-bar">
        <SelectionChip />
        {isTauri() && (
          <button type="button" className="agent-icon-btn" onClick={attach} title={t("agent.attach")} aria-label={t("agent.attach")}>
            <PaperclipIcon size={15} />
          </button>
        )}
        <span className="spacer" />
        <ConversationControls />
        {busy ? (
          <button type="button" className="agent-send is-stop" onClick={interrupt} title={t("agent.stop")} aria-label={t("agent.stop")}>
            <StopIcon size={16} />
          </button>
        ) : (
          <button type="button" className="agent-send" onClick={submit} disabled={!ready} title={t("agent.send")} aria-label={t("agent.send")}>
            <SendIcon size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
