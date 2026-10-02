/**
 * The `when` of an edge as a tree of and/or groups (plan 5.3).
 *
 * Keys are offered from what the course produces, each with its scale; the
 * value box takes the shape of the key (a number, one of the options, true or
 * false, a text); and the editor warns where the player would never agree with
 * the author -- `eq` on a number the AI produced, a level compared against a
 * percentage. There is no `not` in the format: "invert" flips the operator to
 * its opposite and, for a group, applies De Morgan.
 */
import { useMemo } from "react";
import type { Condition, Operator } from "../schema/types";
import { useEditor } from "../store/editor";
import { enumDescription } from "../schema/describe";
import { isNumeric, keysOfCourse, OPERATOR_SYMBOL, OPPOSITE, operatorsFor, scaleLabel, type KeyInfo } from "../course/keys";
import { IconButton } from "../ui/controls";
import { t } from "../i18n";

type Cmp = { key: string; operator: Operator; value: string | number | boolean };

const isGroup = (c: Condition): c is { and: Condition[] } | { or: Condition[] } => "and" in c || "or" in c;
const joinerOf = (c: Condition) => ("and" in c ? "and" : "or");
const childrenOf = (c: Condition): Condition[] => ("and" in c ? c.and : "or" in c ? c.or : []);

export const invert = (c: Condition): Condition => {
  if ("and" in c) return { or: c.and.map(invert) };
  if ("or" in c) return { and: c.or.map(invert) };
  const cmp = c as Cmp;
  return { ...cmp, operator: OPPOSITE[cmp.operator] ?? cmp.operator };
};

const blank = (keys: KeyInfo[]): Cmp => {
  const k = keys[0];
  if (!k) return { key: "", operator: "eq", value: "" };
  return { key: k.key, operator: operatorsFor(k.scale)[0], value: defaultValue(k) };
};

const defaultValue = (k: KeyInfo | undefined): string | number | boolean => {
  if (!k) return "";
  if (k.scale === "bool") return true;
  if (k.scale === "option" || k.scale === "list") return k.options?.[0] ?? "";
  if (k.scale === "percent") return 70;
  if (k.scale === "unit") return 0.5;
  if (k.scale === "level") return Math.max(0, (k.levels ?? 2) - 2);
  if (isNumeric(k.scale)) return 1;
  return "";
};

export function ConditionEditor({ value, onChange }: { value: Condition; onChange: (c: Condition) => void }) {
  const course = useEditor((s) => s.course)!;
  const lang = useEditor((s) => s.canvasLang);
  const keys = useMemo(() => keysOfCourse(course, lang), [course, lang]);
  return (
    <div className="condition">
      <ConditionNode value={value} onChange={onChange} keys={keys} depth={0} />
    </div>
  );
}

function ConditionNode({
  value,
  onChange,
  onRemove,
  keys,
  depth,
}: {
  value: Condition;
  onChange: (c: Condition) => void;
  onRemove?: () => void;
  keys: KeyInfo[];
  depth: number;
}) {
  if (!isGroup(value))
    return <ComparisonRow value={value as Cmp} onChange={onChange} onRemove={onRemove} keys={keys} onWrap={() => onChange({ and: [value, blank(keys)] })} />;

  const joiner = joinerOf(value);
  const children = childrenOf(value);
  const setChildren = (list: Condition[]) => onChange(joiner === "and" ? { and: list } : { or: list });
  return (
    <div className={`cond-group depth-${depth % 3}`}>
      <div className="cond-group-head">
        <div className="segmented" role="radiogroup" aria-label={t("cond.joiner")}>
          {(["and", "or"] as const).map((j) => (
            <button key={j} role="radio" aria-checked={joiner === j} className={joiner === j ? "is-on" : ""} onClick={() => onChange(j === "and" ? { and: children } : { or: children })}>
              {t(`cond.${j}`)}
            </button>
          ))}
        </div>
        <span className="muted small">{joiner === "and" ? t("cond.allHint") : t("cond.anyHint")}</span>
        <span className="spacer" />
        <button className="link" onClick={() => onChange(invert(value))} title={t("cond.invertHint")}>
          {t("cond.invert")}
        </button>
        {children.length === 1 && (
          <button className="link" onClick={() => onChange(children[0])}>
            {t("cond.unwrap")}
          </button>
        )}
        {onRemove && (
          <IconButton title={t("insp.remove")} onClick={onRemove} className="danger">
            ×
          </IconButton>
        )}
      </div>
      {children.length < 2 && <div className="notice notice-warning">{t("cond.groupNeedsTwo")}</div>}
      <div className="cond-children">
        {children.map((child, i) => (
          <ConditionNode
            key={i}
            value={child}
            keys={keys}
            depth={depth + 1}
            onChange={(c) => setChildren(children.map((x, k) => (k === i ? c : x)))}
            onRemove={() => setChildren(children.filter((_, k) => k !== i))}
          />
        ))}
      </div>
      <div className="row">
        <button className="btn btn-small" onClick={() => setChildren([...children, blank(keys)])}>
          + {t("cond.addComparison")}
        </button>
        <button className="btn btn-small" onClick={() => setChildren([...children, { [joiner === "and" ? "or" : "and"]: [blank(keys), blank(keys)] } as Condition])}>
          + {t("cond.addGroup")}
        </button>
      </div>
    </div>
  );
}

function ComparisonRow({ value, onChange, onRemove, onWrap, keys }: { value: Cmp; onChange: (c: Condition) => void; onRemove?: () => void; onWrap: () => void; keys: KeyInfo[] }) {
  const info = keys.find((k) => k.key === value.key);
  const ops = info ? operatorsFor(info.scale) : (["eq", "ne", "gt", "gte", "lt", "lte", "contains", "not-contains"] as Operator[]);
  const allOps = ops.includes(value.operator) ? ops : [...ops, value.operator];
  const warnings: string[] = [];
  if (info?.ai && isNumeric(info.scale) && (value.operator === "eq" || value.operator === "ne")) warnings.push(t("cond.warnEqAi"));
  if (info?.scale === "level" && typeof value.value === "number" && value.value > (info.levels ?? 1) - 1)
    warnings.push(t("cond.warnLevel", { max: (info.levels ?? 1) - 1, node: info.node }));
  if (info?.scale === "unit" && typeof value.value === "number" && value.value > 1) warnings.push(t("cond.warnUnit"));
  if (info?.scale === "percent" && typeof value.value === "number" && value.value > 100) warnings.push(t("cond.warnPercent"));
  if (info && isNumeric(info.scale) && typeof value.value !== "number") warnings.push(t("cond.warnNotNumber"));
  if (info?.scale === "bool" && typeof value.value !== "boolean") warnings.push(t("cond.warnBool"));
  if (!info && value.key) warnings.push(t("cond.warnUnknownKey"));

  return (
    <div className="cond-row">
      <div className="cond-fields">
        <select
          className="input cond-key"
          value={value.key}
          onChange={(e) => {
            const k = keys.find((x) => x.key === e.target.value);
            const nextOps = k ? operatorsFor(k.scale) : ops;
            onChange({ key: e.target.value, operator: nextOps.includes(value.operator) ? value.operator : nextOps[0], value: defaultValue(k) });
          }}
        >
          {!info && <option value={value.key}>{value.key || t("cond.pickKey")}</option>}
          {keys.map((k) => (
            <option key={k.key} value={k.key}>
              {k.key} · {scaleLabel(k)}
            </option>
          ))}
        </select>
        <select className="input cond-op" value={value.operator} onChange={(e) => onChange({ ...value, operator: e.target.value as Operator })} title={enumDescription("comparison", "operator", value.operator)}>
          {allOps.map((op) => (
            <option key={op} value={op} title={enumDescription("comparison", "operator", op)}>
              {OPERATOR_SYMBOL[op]} {op}
            </option>
          ))}
        </select>
        <ValueInput info={info} value={value.value} onChange={(v) => onChange({ ...value, value: v })} />
        <button className="link" onClick={() => onChange({ ...value, operator: OPPOSITE[value.operator] })} title={t("cond.invertHint")}>
          ¬
        </button>
        <button className="link" onClick={onWrap} title={t("cond.wrapHint")}>
          {t("cond.wrap")}
        </button>
        {onRemove && (
          <IconButton title={t("insp.remove")} onClick={onRemove} className="danger">
            ×
          </IconButton>
        )}
      </div>
      {info && (
        <div className="cond-scale muted small">
          {t(`scale.${info.scale}`)}: {scaleLabel(info)}
          {info.ai ? ` · ${t("cond.fromAi")}` : ""}
        </div>
      )}
      {warnings.map((w) => (
        <div key={w} className="notice notice-warning">
          {w}
        </div>
      ))}
    </div>
  );
}

function ValueInput({ info, value, onChange }: { info?: KeyInfo; value: string | number | boolean; onChange: (v: string | number | boolean) => void }) {
  if (info?.scale === "bool")
    return (
      <select className="input cond-value" value={String(value)} onChange={(e) => onChange(e.target.value === "true")}>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  if ((info?.scale === "option" || info?.scale === "list") && info.options?.length)
    return (
      <select className="input cond-value" value={String(value)} onChange={(e) => onChange(e.target.value)}>
        {!info.options.includes(String(value)) && <option value={String(value)}>{String(value)}</option>}
        {info.options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    );
  if (info && isNumeric(info.scale))
    return (
      <input
        className="input cond-value"
        type="number"
        step="any"
        value={typeof value === "number" ? value : ""}
        min={0}
        max={info.scale === "percent" ? 100 : info.scale === "unit" ? 1 : info.scale === "level" ? Math.max(0, (info.levels ?? 1) - 1) : undefined}
        onChange={(e) => e.target.value !== "" && onChange(Number(e.target.value))}
      />
    );
  return <input className="input cond-value" value={String(value)} onChange={(e) => onChange(e.target.value)} />;
}
