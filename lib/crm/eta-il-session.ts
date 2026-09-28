import {
  ETA_IL_HOST,
  ETA_IL_MODEL,
  ETA_IL_PORTAL,
  type EtaIlDraft,
  type EtaIlPhase,
} from "./eta-il-draft";
import { eventForPortalAction, portalEvent, type PortalLogEvent } from "./eta-il-log";

const SUBMIT = /submit|envoyer|envoi|pay|paiement|payment|checkout|carte bancaire|card number|אשר|שלם/i;

export type PortalStep =
  | { action: "open"; url: string }
  | { action: "click"; target: string }
  | { action: "type"; target: string; text: string }
  | { action: "scroll" }
  | { action: "hold"; summary: string };

export type PortalPage = {
  url(): string;
  open(url: string): Promise<void>;
  click(target: string): Promise<void>;
  type(target: string, text: string): Promise<void>;
  scroll(): Promise<void>;
  describe(): Promise<string>;
};

export function portalUrlAllowed(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === ETA_IL_HOST;
  } catch {
    return false;
  }
}

export function redactPassportNumbers(text: string, numbers: string[]) {
  let out = text;
  for (const number of numbers) {
    const clean = number.replace(/\s+/g, "");
    if (clean.length < 4) continue;
    out = out.split(number).join("•••").split(clean).join("•••");
  }
  return out;
}

/** Message si le compte n’a pas gpt-6-astra. Pas de repli vers un autre modèle. */
export function astraRefusalMessage(status: number, body: string) {
  const denied =
    status === 401 ||
    status === 403 ||
    status === 404 ||
    /model_not_found|does not have access|not available|insufficient/i.test(body);
  if (denied) return "GPT-6 Astra n’est pas disponible sur ce compte API.";
  return "Le remplissage n’a pas abouti.";
}

export function stepDecision(step: PortalStep): "run" | "hold" | "stop" {
  if (step.action === "hold") return "hold";
  if (step.action === "open" && !portalUrlAllowed(step.url)) return "stop";
  if (step.action === "click" && SUBMIT.test(step.target)) return "hold";
  if (step.action === "type" && SUBMIT.test(step.target)) return "hold";
  if (step.action === "type" && /^\d{13,19}$/.test(step.text.replace(/\s+/g, ""))) return "stop";
  return "run";
}

const PORTAL_INSTRUCTIONS = [
  `Ouvre uniquement ${ETA_IL_PORTAL} et remplis une demande ETA-IL par passeport français.`,
  "N’envoie pas le formulaire. Ne paie pas. Ne saisis aucune carte.",
  "Chaque tour appelle portal_step. Pas de texte libre.",
  "Quand les champs sont remplis, appelle portal_step avec action hold.",
  "Le résumé hold nomme les voyageurs et les dates, sans numéro de passeport.",
  "Si un captcha ou un écran inattendu bloque, hold tout de suite.",
].join(" ");

export const portalToolChoice = { type: "function" as const, name: "portal_step" };

function portalTools() {
  return [
    {
      type: "function" as const,
      name: "portal_step",
      description: "Une action sur le portail ETA-IL. Pas d’envoi, pas de paiement, pas d’autre site.",
      strict: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          action: { type: "string", enum: ["open", "click", "type", "scroll", "hold"] },
          url: { type: "string" },
          target: { type: "string" },
          text: { type: "string" },
          summary: { type: "string" },
        },
        required: ["action", "url", "target", "text", "summary"],
      },
    },
  ];
}

/** Outils, consigne et choix imposés. La suite les renvoie : sans eux Astra répond en texte. */
export function astraTurn() {
  return {
    model: ETA_IL_MODEL,
    reasoning: { effort: "medium" as const },
    tools: portalTools(),
    tool_choice: portalToolChoice,
    instructions: PORTAL_INSTRUCTIONS,
  };
}

export function buildEtaIlRequest(draft: EtaIlDraft) {
  return {
    ...astraTurn(),
    input: [
      {
        role: "user",
        content: JSON.stringify({
          portal: ETA_IL_PORTAL,
          startDate: draft.startDate,
          endDate: draft.endDate,
          applicants: draft.applicants,
        }),
      },
    ],
  };
}

type ResponseOutput = {
  id?: string;
  status?: string;
  error?: { message?: string } | null;
  output?: Array<{
    type?: string;
    name?: string;
    call_id?: string;
    arguments?: string;
  }>;
};

const PENDING_STATUS = new Set(["queued", "in_progress"]);

/** Statut et types de sortie seulement. Le texte peut contenir un numéro de passeport. */
export function responseTrace(data: ResponseOutput) {
  const types = (data.output || []).map((item) => item.type || "inconnu");
  return `${data.status || "sans statut"} ${types.join(",") || "vide"}`;
}

export function readPortalStep(data: ResponseOutput): { callId: string; step: PortalStep } | null {
  const call = (data.output || []).find((item) => item.type === "function_call" && item.name === "portal_step");
  if (!call?.call_id || !call.arguments) return null;
  let raw: Record<string, string>;
  try {
    raw = JSON.parse(call.arguments) as Record<string, string>;
  } catch {
    return null;
  }
  const action = raw.action;
  if (action === "open") return { callId: call.call_id, step: { action, url: raw.url || "" } };
  if (action === "click") return { callId: call.call_id, step: { action, target: raw.target || "" } };
  if (action === "type") {
    return { callId: call.call_id, step: { action, target: raw.target || "", text: raw.text || "" } };
  }
  if (action === "scroll") return { callId: call.call_id, step: { action: "scroll" } };
  if (action === "hold") return { callId: call.call_id, step: { action: "hold", summary: raw.summary || "" } };
  return null;
}

async function callResponses(
  apiKey: string,
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch
) {
  const res = await fetchImpl(url, {
    ...init,
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

async function settleResponse(opts: {
  apiKey: string;
  body: unknown;
  fetchImpl: typeof fetch;
  pollMs: number;
}): Promise<{ ok: true; data: ResponseOutput } | { ok: false; status: number; text: string }> {
  let res = await callResponses(
    opts.apiKey,
    "https://api.openai.com/v1/responses",
    { method: "POST", body: JSON.stringify(opts.body) },
    opts.fetchImpl
  );
  if (!res.ok) return { ok: false, status: res.status, text: res.text };
  for (let attempt = 0; attempt < 8; attempt += 1) {
    let data: ResponseOutput;
    try {
      data = JSON.parse(res.text) as ResponseOutput;
    } catch {
      return { ok: false, status: res.status, text: "" };
    }
    if (!data.id || !data.status || !PENDING_STATUS.has(data.status)) return { ok: true, data };
    if (opts.pollMs > 0) await new Promise((resolve) => setTimeout(resolve, opts.pollMs));
    res = await callResponses(
      opts.apiKey,
      `https://api.openai.com/v1/responses/${data.id}`,
      { method: "GET" },
      opts.fetchImpl
    );
    if (!res.ok) return { ok: false, status: res.status, text: res.text };
  }
  try {
    return { ok: true, data: JSON.parse(res.text) as ResponseOutput };
  } catch {
    return { ok: false, status: res.status, text: "" };
  }
}

export async function runEtaIlSession(opts: {
  apiKey: string;
  draft: EtaIlDraft;
  page: PortalPage;
  fetchImpl?: typeof fetch;
  maxSteps?: number;
  pollMs?: number;
  onEvent?: (event: PortalLogEvent) => Promise<void> | void;
}): Promise<{ phase: EtaIlPhase; summary: string | null; message: string | null; filled: boolean }> {
  const fetchImpl = opts.fetchImpl || fetch;
  const pollMs = opts.pollMs ?? 750;
  const numbers = opts.draft.applicants.map((row) => row.number);
  const maxSteps = opts.maxSteps ?? 24;
  let misses = 0;
  let previous: string | undefined;
  let input: unknown = buildEtaIlRequest(opts.draft).input;

  for (let turn = 0; turn < maxSteps; turn += 1) {
    const request = previous
      ? { ...astraTurn(), previous_response_id: previous, input }
      : buildEtaIlRequest(opts.draft);
    const settled = await settleResponse({ apiKey: opts.apiKey, body: request, fetchImpl, pollMs });
    if (!settled.ok) {
      return {
        phase: "bloqué",
        summary: null,
        message: settled.text
          ? astraRefusalMessage(settled.status, settled.text)
          : "Le remplissage n’a pas abouti.",
        filled: false,
      };
    }
    const data = settled.data;
    previous = data.id;
    const parsed = readPortalStep(data);
    if (!parsed) {
      console.error("[eta-il] étape absente", responseTrace(data));
      return {
        phase: "bloqué",
        summary: null,
        message: "Le portail n’a pas été rempli. Reprenez la main sur le site officiel.",
        filled: false,
      };
    }
    const decision = stepDecision(parsed.step);
    if (decision !== "stop") await emitPortalEvent(opts.onEvent, parsed.step, numbers);
    if (decision === "hold") {
      const summary =
        parsed.step.action === "hold"
          ? redactPassportNumbers(parsed.step.summary, numbers)
          : "Formulaire rempli. Envoi et paiement en attente de confirmation.";
      return { phase: "à confirmer", summary, message: null, filled: true };
    }
    if (decision === "stop") {
      return {
        phase: "bloqué",
        summary: null,
        message: "Action refusée : le bot reste sur le portail ETA-IL, sans paiement.",
        filled: false,
      };
    }
    let note: string;
    try {
      await applyStep(opts.page, parsed.step);
      misses = 0;
      note = redactPassportNumbers(await opts.page.describe(), numbers);
    } catch {
      misses += 1;
      const seen = redactPassportNumbers(await opts.page.describe().catch(() => ""), numbers);
      if (misses >= 3) {
        return {
          phase: "bloqué",
          summary: null,
          message: "Le portail a changé ou un captcha bloque. Reprenez la main.",
          filled: false,
        };
      }
      note = `Contrôle introuvable. Choisis un libellé listé, ou hold si un captcha bloque. ${seen}`;
    }
    input = [
      {
        type: "function_call_output",
        call_id: parsed.callId,
        output: note,
      },
    ];
  }
  return {
    phase: "à confirmer",
    summary: "Limite d’étapes atteinte. Vérifiez le formulaire avant l’envoi.",
    message: null,
    filled: false,
  };
}

async function emitPortalEvent(
  onEvent: ((event: PortalLogEvent) => Promise<void> | void) | undefined,
  step: PortalStep,
  numbers: string[]
) {
  const traced = eventForPortalAction(step);
  if (!traced || !onEvent) return;
  try {
    await onEvent(portalEvent(traced.kind, redactPassportNumbers(traced.text, numbers)));
  } catch (err) {
    console.error("[eta-il] journal", err instanceof Error ? err.message : "échec");
  }
}

async function applyStep(page: PortalPage, step: PortalStep) {
  if (step.action === "open") {
    if (!portalUrlAllowed(step.url)) throw new Error("hôte");
    await page.open(step.url);
    return;
  }
  if (page.url() && !portalUrlAllowed(page.url())) throw new Error("hôte");
  if (step.action === "click") await page.click(step.target);
  if (step.action === "type") await page.type(step.target, step.text);
  if (step.action === "scroll") await page.scroll();
}

