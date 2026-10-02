/**
 * How the preview's generation talks to a chat model: through the Rust side
 * (which adds the key), with every call landing in the call log.
 */
import { native, type HttpAnswer } from "../app/platform";
import { usePrefs } from "../store/prefs";
import { usePreview, type CallLog } from "../preview/session";
import { t } from "../i18n";
import { errorText } from "../i18n/errors";

export interface ChatResult {
  text: string;
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
  cost: number | null;
  ms: number;
  http: HttpAnswer;
}

export class AiError extends Error {
  constructor(
    message: string,
    public http?: HttpAnswer,
  ) {
    super(message);
  }
}

/** A chat call with a full body, as the preview builds it to match the server; logged in the session of `doc`, the tab asking. */
export async function chatBody(body: Record<string, unknown>, meta: { node: string; kind: CallLog["kind"] }, doc = usePreview.getState().doc): Promise<ChatResult> {
  const prefs = usePrefs.getState();
  let http: HttpAnswer;
  try {
    http = await native.aiPost(prefs.ai.url, body, prefs.ai.timeout);
  } catch (e) {
    const note = errorText(e);
    usePreview.getState().log({ ...meta, endpoint: "chat/completions", model: String(body.model), answered: "", tokensIn: null, tokensOut: null, cost: null, ms: 0, ok: false, note, request: body, response: "" }, doc);
    throw new AiError(note);
  }
  const json = (http.json ?? {}) as {
    model?: string;
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  };
  const text = String(json.choices?.[0]?.message?.content ?? "").trim();
  const result: ChatResult = {
    text,
    model: String(json.model ?? ""),
    tokensIn: json.usage?.prompt_tokens ?? null,
    tokensOut: json.usage?.completion_tokens ?? null,
    cost: typeof json.usage?.cost === "number" ? json.usage.cost : null,
    ms: http.ms,
    http,
  };
  const error = http.error !== null ? errorText(http.error) : text === "" ? t("ai.empty") : null;
  usePreview.getState().log({
    ...meta,
    endpoint: "chat/completions",
    model: String(body.model),
    answered: result.model,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    cost: result.cost,
    ms: http.ms,
    ok: error === null,
    note: error ?? "",
    request: body,
    response: http.raw,
  }, doc);
  if (error) throw new AiError(http.status === 0 ? t("ai.why.unreachable", { error }) : error, http);
  return result;
}

// ------------------------------------------------------------------ cost ----

interface Price {
  prompt: number;
  completion: number;
}

let prices: Map<string, Price> | null = null;
let loading: Promise<Map<string, Price>> | null = null;

export async function loadPrices(): Promise<Map<string, Price>> {
  if (prices) return prices;
  loading ??= native
    .aiModels()
    .then((list) => {
      const map = new Map<string, Price>();
      for (const m of (list?.data ?? []) as { id: string; pricing?: { prompt?: string; completion?: string } }[])
        map.set(m.id, { prompt: Number(m.pricing?.prompt ?? 0), completion: Number(m.pricing?.completion ?? 0) });
      prices = map;
      return map;
    })
    .catch(() => {
      loading = null;
      return new Map<string, Price>();
    });
  return loading;
}

export const modelIds = async () => [...(await loadPrices()).keys()].sort();

export const formatCost = (cost: number | null | undefined) =>
  cost === null || cost === undefined ? "—" : `$${cost >= 0.01 ? cost.toFixed(4) : cost.toFixed(6)}`.replace(/0+$/, "").replace(/\.$/, "");
