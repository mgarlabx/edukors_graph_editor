import { useState } from "react";
import { courseLangs, useEditor } from "../store/editor";
import { useUi, type InspectorTab } from "../store/ui";
import type { Course, CourseNode } from "../schema/types";
import { tip } from "../schema/describe";
import { PREFIX, TYPE_STYLE } from "../course/nodeTypes";
import { renameNode } from "../course/ops";
import { localize } from "../course/localize";
import { Field, Help, NumberInput, TextInput } from "../ui/controls";
import { textFields } from "../i18n/texts";
import { LocalizedField } from "./fields";
import { ExtrasField } from "./ExtrasField";
import { t } from "../i18n";

/** Edits one node of the course: `edit((node, course) => …, label)`. */
export const useNodeEdit = (id: string) => {
  const update = useEditor((s) => s.update);
  return (fn: (node: CourseNode, course: Course) => void, label: string) =>
    update((c) => {
      const node = c.nodes.find((n) => n.id === id);
      if (node) fn(node, c);
    }, `${id}:${label}`);
};

/** One language of a text is empty where the course has it: the languages marked in the inspector's head. */
export function emptyLangs(course: Course, node: string | null): Set<string> {
  const langs = courseLangs(course);
  const out = new Set<string>();
  for (const f of textFields(course)) {
    if (!f.translatable || (node === null ? f.node !== undefined : f.node !== node)) continue;
    for (const l of langs) if (!f.list.find((e) => e?.lang === l)?.text?.trim()) out.add(l);
  }
  return out;
}

/**
 * The language every text of the inspector is shown and written in: the one
 * the map shows its titles in, so changing it here changes it there too. A dot
 * marks a language where a text of this part is still empty.
 */
export function LangBar({ empty }: { empty: Set<string> }) {
  const course = useEditor((s) => s.course)!;
  const shown = useEditor((s) => s.canvasLang);
  const setLang = useEditor((s) => s.setCanvasLang);
  const langs = courseLangs(course);
  if (langs.length < 2) return null;
  const active = langs.includes(shown) ? shown : langs[0];
  return (
    <div className="insp-langs">
      <span className="insp-langs-label">
        {t("insp.lang")} <Help text={t("insp.langHint")} />
      </span>
      <div className="insp-seg" role="radiogroup" aria-label={t("insp.lang")}>
        {langs.map((l, i) => (
          <button
            key={l}
            role="radio"
            aria-checked={l === active}
            className={`${l === active ? "is-active" : ""} ${empty.has(l) ? "is-empty" : ""}`}
            title={i === 0 ? t("lang.source") : undefined}
            onClick={() => setLang(l)}
          >
            {i === 0 ? `${l} ★` : l}
          </button>
        ))}
      </div>
    </div>
  );
}

const TABS: InspectorTab[] = ["data", "spec", "extras"];

/** The inspector's tabs, at the foot of its head: the same three for the course, a node and an edge. */
function InspectorTabs() {
  const tab = useUi((s) => s.inspectorTab);
  const setTab = useUi((s) => s.setInspectorTab);
  return (
    <div className="insp-tabs" role="tablist" aria-label={t("insp.tabs")}>
      {TABS.map((id) => (
        <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "is-active" : ""} onClick={() => setTab(id)}>
          {t(`insp.tab.${id}`)}
        </button>
      ))}
    </div>
  );
}

/** What one of the inspector's tabs shows: nothing while another is open. */
export function Tab({ id, children }: { id: InspectorTab; children: React.ReactNode }) {
  const tab = useUi((s) => s.inspectorTab);
  return tab === id ? <div className="insp-groups" role="tabpanel">{children}</div> : null;
}

/**
 * The top of the inspector, kept in view as it scrolls, drawn like the head of
 * a pane of the preferences: a tile in the color of the type, the title, what
 * it is and its id under it, the language of its texts, and the tabs.
 */
export function PanelHeader({
  kind,
  color,
  icon,
  id,
  title,
  actions,
  langs,
}: {
  kind: string;
  color?: string;
  icon: React.ReactNode;
  id?: string;
  title: React.ReactNode;
  actions?: React.ReactNode;
  /** the languages whose texts are empty here; none: no language bar (a part without texts) */
  langs?: Set<string>;
}) {
  return (
    <header className="insp-head" style={{ "--type-color": color } as React.CSSProperties}>
      <div className="insp-head-top">
        <span className="insp-tile is-large">{icon}</span>
        <div className="insp-head-text">
          <h2 className="insp-title">{title}</h2>
          <div className="insp-head-sub">
            <span>{kind}</span>
            {id && <code className="insp-tag">{id}</code>}
          </div>
        </div>
        {actions && <span className="insp-head-actions">{actions}</span>}
      </div>
      {langs && <LangBar empty={langs} />}
      <InspectorTabs />
    </header>
  );
}

/**
 * One of the inspector's two parts: what every node has (common), and what its
 * type has; a head like a pane of the preferences, the fields in cards below.
 */
export const Part = ({
  icon,
  color,
  title,
  tags,
  description,
  actions,
  children,
}: {
  icon: React.ReactNode;
  color?: string;
  title: React.ReactNode;
  tags?: string[];
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <section className="insp-part" style={{ "--type-color": color } as React.CSSProperties}>
    <header className="insp-part-head">
      <span className="insp-tile">{icon}</span>
      <h3>{title}</h3>
      {tags?.map((tag) => (
        <code key={tag} className="insp-tag">
          {tag}
        </code>
      ))}
      {actions && <span className="insp-part-actions">{actions}</span>}
    </header>
    {description && <p className="insp-part-desc">{description}</p>}
    {children}
  </section>
);

/** A card of fields, as in the preferences, under an optional small title: Identification, Exits… */
export const Group = ({ title, help, actions, children, count }: { title?: React.ReactNode; help?: string; actions?: React.ReactNode; children: React.ReactNode; count?: number }) => (
  <section className="insp-group">
    {(title || actions) && (
      <header className="insp-group-head">
        <h4>
          {title}
          {count !== undefined && <span className="insp-count">{count}</span>}
        </h4>
        <Help text={help} />
        {actions && <span className="insp-group-actions">{actions}</span>}
      </header>
    )}
    {children}
  </section>
);

export function NodeHeader({ node }: { node: CourseNode }) {
  const course = useEditor((s) => s.course)!;
  const lang = useEditor((s) => s.canvasLang);
  const style = TYPE_STYLE[node.type];
  const title = localize(node.title, lang).trim();
  return (
    <PanelHeader
      kind={t(`type.${node.type}`)}
      color={style.color}
      icon={style.icon}
      id={node.id}
      title={title || <span className="muted">{t("insp.untitled")}</span>}
      langs={emptyLangs(course, node.id)}
    />
  );
}

/** A node's id, section and title: the General group. */
export function NodeGeneral({ node }: { node: CourseNode }) {
  const course = useEditor((s) => s.course)!;
  const update = useEditor((s) => s.update);
  const select = useEditor((s) => s.select);
  const edit = useNodeEdit(node.id);
  const [newId, setNewId] = useState(node.id);
  const sections = course.info.sections ?? [];
  const lang = useEditor((s) => s.canvasLang);
  const idOk = new RegExp(`^${PREFIX[node.type]}[0-9]+$`).test(newId) && !course.nodes.some((n) => n.id === newId && n !== node);

  return (
    <Group title={t("insp.group.identity")}>
      <LocalizedField path={`node:${node.id}/title`} label={t("insp.title")} help={tip("node", "title")} kind="plain" />
      <div className="grid-2">
        <Field label="id" help={tip("node", "id")} error={!idOk && newId !== node.id ? t("insp.idInvalid", { prefix: PREFIX[node.type] }) : undefined}>
          <div className="row">
            <TextInput className="mono grow" value={newId} onChange={setNewId} pattern={/^[a-z]+[0-9]+$/} />
            {newId !== node.id && (
              <button
                className="btn btn-small"
                disabled={!idOk}
                onClick={() => {
                  update((c) => renameNode(c, node.id, newId), "rename");
                  select({ nodes: [newId], edge: null });
                }}
              >
                {t("insp.rename")}
              </button>
            )}
          </div>
        </Field>
        <Field label={t("insp.section")} help={tip("node", "section")}>
          {sections.length ? (
            <select
              className="input"
              value={node.section ?? 1}
              onChange={(e) =>
                edit((n) => {
                  const v = Number(e.target.value);
                  if (v === 1 && !sections.some((s) => s.number === 1)) delete n.section;
                  else n.section = v;
                }, "section")
              }
            >
              {!sections.some((s) => s.number === (node.section ?? 1)) && <option value={node.section ?? 1}>{node.section ?? 1}</option>}
              {sections.map((s) => (
                <option key={s.number} value={s.number}>
                  {s.number}. {localize(s.title, lang)}
                </option>
              ))}
            </select>
          ) : (
            <NumberInput
              value={node.section ?? 1}
              min={1}
              step={1}
              onChange={(v) =>
                edit((n) => {
                  if (!v || v === 1) delete n.section;
                  else n.section = Math.max(1, Math.round(v));
                }, "section")
              }
            />
          )}
        </Field>
      </div>
    </Group>
  );
}

/** A node's extras: the Advanced group. */
export function NodeAdvanced({ node }: { node: CourseNode }) {
  const edit = useNodeEdit(node.id);
  return (
    <Group>
      <ExtrasField
        owner={node.id}
        value={node.extras}
        help={tip("node", "extras")}
        onChange={(v) =>
          edit((n) => {
            if (v === undefined) delete n.extras;
            else n.extras = v;
          }, "extras")
        }
      />
    </Group>
  );
}

export const langsOf = (course: Course) => courseLangs(course);
