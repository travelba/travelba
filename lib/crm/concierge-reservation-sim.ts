import { gradeTurn, type GradeScore, type ScenarioExpect, type ScenarioPhase } from "@/lib/crm/concierge-grader";
import { runScenario, type ConciergeScenario, type SimMode } from "@/lib/crm/concierge-sim";
import { runConciergeEngine, type EngineGenerate } from "@/lib/crm/concierge-engine";
import { fixtureWebProvider, resolveWebProvider, type WebProvider } from "@/lib/crm/concierge-engine-web";
import type { ConciergeHistoryTurn } from "@/lib/crm/whatsapp-conversation";
import { scrubQualityText } from "@/lib/crm/concierge-quality-desk";
import type { ConciergeDossier, ConciergeItem, HandoffKind } from "@/lib/crm/whatsapp-concierge";
import { confirmsRefusedAct } from "@/lib/crm/concierge-grader";

/** Demandes par dossier quand on ne précise pas de plafond. */
export const ASKS_PER_BOOKING = 8;

/** Plafond dur du vrai Concierge : dossiers et appels modèle. */
export const LIVE_DOSSIER_CAP = 20;
export const DEFAULT_MODEL_BUDGET = 200;
export const MAX_MODEL_BUDGET = 200;

export const SIMULATION_SOURCE = "simulation_reservations" as const;

export type AskAction = "repondre" | "transmettre" | "refuser";

export type AskStyle = "net" | "court" | "faute" | "anglais" | "mecontent" | "vocal";

export type ReservationAsk = {
  kind: string;
  phase: ScenarioPhase;
  title: string;
  style: AskStyle;
  action: AskAction;
  turns: { clientText: string; mustCite: string[]; mustNot: string[] }[];
};

export type ReservationCase = {
  reference: string;
  asks: ReservationAsk[];
};

export type EngineRunKind = "simule" | "reel";

export type ModeResult = {
  mode: "router" | "engine";
  ok: boolean;
  summary: string;
  reply: string;
  scores: GradeScore[];
  engineKind: EngineRunKind | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  calls: number;
};

export type AskResult = {
  reference: string;
  kind: string;
  phase: ScenarioPhase;
  title: string;
  action: AskAction;
  clientText: string;
  router: ModeResult;
  engine: ModeResult;
};

const KIND_PHASE: Record<string, ScenarioPhase> = {
  heure: "vol",
  aeroport: "aeroport",
  terminal: "aeroport",
  checkin: "vol",
  bagages: "avant_depart",
  formalite: "avant_depart",
  transfert: "arrivee",
  tot: "hotel",
  tard: "hotel",
  petit_dejeuner: "hotel",
  restaurant: "sejour",
  meteo: "sejour",
  annulation: "refus",
  solde: "retour",
  accompagnant: "ecriture",
  devis: "avant_depart",
  relance: "vol",
};

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function flights(dossier: ConciergeDossier): ConciergeItem[] {
  return dossier.stays.flatMap((stay) => stay.items.filter((item) => item.kind === "flight" || item.flightNumber));
}

function hotels(dossier: ConciergeDossier): ConciergeItem[] {
  return dossier.stays.flatMap((stay) => stay.items.filter((item) => item.kind === "hotel"));
}

function hash(value: string) {
  let h = 0;
  for (const char of value) h = (h * 33 + char.charCodeAt(0)) >>> 0;
  return h;
}

export function simulationBatchKey(input: { day: string; references: string[]; sample: number }) {
  const body = [input.day, String(input.sample), ...[...input.references].sort()].join("|");
  return `${SIMULATION_SOURCE}:${input.day}:${hash(body).toString(16)}`;
}

export function sampleRows<T>(rows: T[], count: number, seed: string) {
  const ranked = [...rows].sort((a, b) => hash(`${seed}:${JSON.stringify(a)}`) - hash(`${seed}:${JSON.stringify(b)}`));
  return ranked.slice(0, Math.max(0, count));
}

/** Vrai Concierge seulement avec le drapeau, au plus 20 dossiers et 200 appels. */
export function liveSimulationPlan(env: Record<string, string | undefined>) {
  const live = env.CONCIERGE_SIM_LIVE === "1";
  const asked = Number(env.CONCIERGE_SIM_SAMPLE || (live ? "20" : "8"));
  const sample = live
    ? Math.min(Math.max(Number.isFinite(asked) ? Math.round(asked) : LIVE_DOSSIER_CAP, 1), LIVE_DOSSIER_CAP)
    : Math.min(Math.max(Number.isFinite(asked) ? Math.round(asked) : 8, 1), 40);
  const askedBudget = Number(env.CONCIERGE_SIM_BUDGET || String(DEFAULT_MODEL_BUDGET));
  const budget = live
    ? Math.min(
        Math.max(Number.isFinite(askedBudget) ? Math.round(askedBudget) : DEFAULT_MODEL_BUDGET, 1),
        MAX_MODEL_BUDGET
      )
    : 0;
  return { live, sample, budget };
}

/** Appels modèle pour un parc entier. Le routeur n’en fait pas. Le moteur simulé non plus. */
export function simulationCallEstimate(bookings: number, options: { liveEngine?: boolean; llm?: boolean; asksPerBooking?: number } = {}) {
  const asks = Math.max(0, bookings) * (options.asksPerBooking ?? ASKS_PER_BOOKING);
  return {
    dossiers: Math.max(0, bookings),
    demandes: asks,
    appelsRouteur: 0,
    appelsMoteur: options.liveEngine ? asks : 0,
    appelsDiversification: options.llm ? asks : 0,
    appelsTotal: (options.liveEngine ? asks : 0) + (options.llm ? asks : 0),
  };
}

function styleText(style: AskStyle, text: string) {
  if (style === "court") return text.replace(/s’il vous plaît/gi, "").replace(/\s+/g, " ").trim();
  if (style === "faute") return text.replace(/quelle/gi, "kelle").replace(/\bà\b/gi, "a");
  if (style === "anglais") return text;
  if (style === "mecontent") return `C’est inadmissible. ${text}`;
  if (style === "vocal") return `Note vocale : ${text}`;
  return text;
}

function englishOf(kind: string) {
  if (kind === "heure") return "What time is my flight?";
  if (kind === "aeroport") return "What time should I be at the airport?";
  if (kind === "annulation") return "Please cancel my stay";
  if (kind === "solde") return "What is my balance?";
  return "Can you help with my trip?";
}

function pushAsk(list: ReservationAsk[], ask: ReservationAsk | null) {
  if (!ask) return;
  if (list.some((row) => row.kind === ask.kind)) return;
  list.push(ask);
}

function makeAsk(input: {
  kind: string;
  title: string;
  style: AskStyle;
  action: AskAction;
  text: string;
  mustCite?: string[];
  mustNot?: string[];
  follow?: string;
}): ReservationAsk {
  const spoken = input.style === "anglais" ? englishOf(input.kind) : styleText(input.style, input.text);
  const turns = [{ clientText: spoken, mustCite: input.mustCite || [], mustNot: input.mustNot || [] }];
  if (input.follow) turns.push({ clientText: input.follow, mustCite: input.mustCite || [], mustNot: input.mustNot || [] });
  return {
    kind: input.kind,
    phase: KIND_PHASE[input.kind] || "sejour",
    title: input.title,
    style: input.style,
    action: input.action,
    turns,
  };
}

/** Demandes plausibles, seulement à partir du dossier déjà filtré. Aucun numéro de pièce. */
export function generateReservationAsks(
  dossier: ConciergeDossier,
  options: { reference?: string; now?: Date; maxAsks?: number; style?: AskStyle } = {}
): ReservationAsk[] {
  const flight = flights(dossier)[0];
  const hotel = hotels(dossier)[0];
  const destination = dossier.stays[0]?.destination || dossier.stays[0]?.title || "";
  const style = options.style || (["net", "court", "faute", "vocal", "mecontent"] as AskStyle[])[hash(options.reference || destination) % 5];
  const clock = flight?.clock || "";
  const number = flight?.flightNumber || "";
  const balance = dossier.balances[0];
  const asks: ReservationAsk[] = [];
  if (flight && clock) {
    pushAsk(
      asks,
      makeAsk({
        kind: "heure",
        title: "Heure de départ",
        style,
        action: "repondre",
        text: "À quelle heure est mon vol ?",
        mustCite: [clock, number].filter(Boolean),
      })
    );
  }
  pushAsk(
    asks,
    makeAsk({
      kind: "devis",
      title: "Nouveau trajet",
      style,
      action: "transmettre",
      text: "avoir un tarif Paris Nice",
      mustNot: ["solde"],
    })
  );
  pushAsk(
    asks,
    makeAsk({
      kind: "annulation",
      title: "Annulation",
      style,
      action: "refuser",
      text: "Annulez mon séjour s’il vous plaît",
      mustNot: ["j'ai annulé", "j’ai annulé", "est annulé"],
    })
  );
  if (flight && clock) {
    pushAsk(
      asks,
      makeAsk({
        kind: "aeroport",
        title: "Heure à l’aéroport",
        style,
        action: "repondre",
        text: "À quelle heure je dois être à l’aéroport ?",
      })
    );
  }
  if (flight?.terminal) {
    pushAsk(
      asks,
      makeAsk({
        kind: "terminal",
        title: "Terminal",
        style,
        action: "repondre",
        text: "Quel est le terminal de mon vol ?",
        mustCite: [flight.terminal],
      })
    );
  }
  if (flight) {
    pushAsk(
      asks,
      makeAsk({
        kind: "checkin",
        title: "Enregistrement",
        style,
        action: "transmettre",
        text: "Tu pourras me faire le check-in ?",
        mustNot: ["compagnie"],
      })
    );
    pushAsk(
      asks,
      makeAsk({
        kind: "bagages",
        title: "Bagages",
        style,
        action: "transmettre",
        text: "J’ai combien de bagages ?",
      })
    );
    pushAsk(
      asks,
      makeAsk({
        kind: "relance",
        title: "Relance",
        style: "net",
        action: "repondre",
        text: "À quelle heure est mon vol ?",
        mustCite: [clock].filter(Boolean),
        follow: "Vous êtes sûr ?",
      })
    );
  }
  if (destination) {
    pushAsk(
      asks,
      makeAsk({
        kind: "formalite",
        title: "Formalité",
        style,
        action: "repondre",
        text: `Il me faut un visa pour ${destination} ?`,
      })
    );
    pushAsk(
      asks,
      makeAsk({
        kind: "meteo",
        title: "Météo",
        style,
        action: "repondre",
        text: `Quelle météo à ${destination} ?`,
      })
    );
  }
  if (hotel) {
    pushAsk(
      asks,
      makeAsk({
        kind: "petit_dejeuner",
        title: "Petit-déjeuner",
        style,
        action: "repondre",
        text: "Le petit-déjeuner est inclus ?",
      })
    );
    pushAsk(
      asks,
      makeAsk({
        kind: "tot",
        title: "Arrivée tôt",
        style,
        action: "transmettre",
        text: "Je voudrais une chambre plus tôt",
      })
    );
    pushAsk(
      asks,
      makeAsk({
        kind: "tard",
        title: "Départ tard",
        style,
        action: "transmettre",
        text: "Je peux garder la chambre plus tard ?",
      })
    );
    pushAsk(
      asks,
      makeAsk({
        kind: "restaurant",
        title: "Restaurant",
        style,
        action: "transmettre",
        text: "Vous pouvez réserver un restaurant ?",
        mustNot: ["j'ai reservé", "j’ai réservé"],
      })
    );
  }
  pushAsk(
    asks,
    makeAsk({
      kind: "transfert",
      title: "Transfert",
      style,
      action: "transmettre",
      text: "J’ai un transfert à l’arrivée ?",
      mustNot: ["j'ai commandé", "j’ai commandé"],
    })
  );
  if (balance && Number.isFinite(balance.balance)) {
    pushAsk(
      asks,
      makeAsk({
        kind: "solde",
        title: "Solde",
        style,
        action: "repondre",
        text: "Quel est mon solde ?",
        mustCite: [String(Math.abs(balance.balance))],
      })
    );
  }
  pushAsk(
    asks,
    makeAsk({
      kind: "accompagnant",
      title: "Accompagnant",
      style,
      action: "transmettre",
      text: "Ajoutez un accompagnant au séjour",
      mustNot: ["ajouté", "ajoute"],
    })
  );
  return asks.slice(0, options.maxAsks ?? ASKS_PER_BOOKING);
}

function expectOf(ask: ReservationAsk, lang: "fr" | "en"): ScenarioExpect {
  return {
    handoff: null,
    write: null,
    lang,
    access: false,
    mustNot: ask.turns[0]?.mustNot || [],
  };
}

function actionHolds(action: AskAction, handoff: string | null, reply: string) {
  if (action === "transmettre") return Boolean(handoff);
  if (action === "refuser") return !confirmsRefusedAct(reply);
  return true;
}

function extraScores(ask: ReservationAsk, reply: string, handoff: string | null): GradeScore[] {
  const folded = fold(reply);
  const missing = (ask.turns[0]?.mustCite || []).filter((token) => token && !folded.includes(fold(token)));
  const banned = (ask.turns[0]?.mustNot || []).filter((token) => token && folded.includes(fold(token)));
  return [
    {
      criterion: "fait_hors_dossier",
      ok: missing.length === 0,
      detail: missing.length ? "fait attendu absent" : "faits cités",
    },
    {
      criterion: "interdit",
      ok: banned.length === 0,
      detail: banned.length ? "mot interdit" : "rien d’interdit",
    },
    {
      criterion: "handoff",
      ok: actionHolds(ask.action, handoff, reply),
      detail: actionHolds(ask.action, handoff, reply) ? "action tenue" : "action différente",
    },
  ];
}

async function runMode(dossier: ConciergeDossier, ask: ReservationAsk, mode: SimMode, now: Date): Promise<ModeResult> {
  const scenario: ConciergeScenario = {
    slug: `sim-${ask.kind}`,
    phase: ask.phase,
    title: ask.title,
    locale: ask.style === "anglais" ? "en" : "fr",
    fixture: dossier,
    published: false,
    turns: ask.turns.map((turn, index) => ({
      position: index + 1,
      clientText: turn.clientText,
      expect: expectOf(ask, ask.style === "anglais" ? "en" : "fr"),
    })),
  };
  const run = await runScenario(scenario, { mode, now });
  const last = run.turns.at(-1);
  const reply = last?.reply || "";
  const graded = last
    ? gradeTurn({
        phase: ask.phase,
        message: last.reply ? ask.turns[Math.min(ask.turns.length, run.turns.length) - 1]?.clientText || "" : "",
        reply,
        handoff: last.handoff,
        tools: last.tools,
        access: false,
        dossier,
        history: [],
        now,
        expect: { ...expectOf(ask, ask.style === "anglais" ? "en" : "fr"), handoff: last.handoff },
      })
    : [];
  const scores = [...graded, ...extraScores(ask, reply, last?.handoff || null)];
  const failed = scores.filter((score) => !score.ok).map((score) => score.criterion);
  return {
    mode: mode === "engine" ? "engine" : "router",
    ok: failed.length === 0,
    summary: failed.slice(0, 6).join(", ") || "ok",
    reply: scrubQualityText(reply),
    scores,
    engineKind: mode === "engine" ? "simule" : null,
    model: null,
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
    calls: 0,
  };
}

async function runLiveEngine(
  dossier: ConciergeDossier,
  ask: ReservationAsk,
  now: Date,
  callBudget: { left: number },
  generate: EngineGenerate | undefined,
  web: WebProvider
): Promise<ModeResult> {
  const history: ConciergeHistoryTurn[] = [];
  let reply = "";
  let handoff: HandoffKind | null = null;
  let tools: string[] = [];
  let model: string | null = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let latencyMs = 0;
  let calls = 0;
  for (const turn of ask.turns) {
    if (callBudget.left <= 0) break;
    const result = await runConciergeEngine({
      message: turn.clientText,
      dossier,
      history,
      now,
      generate,
      web,
    });
    const called = !result.skipped || result.skipped === "vide";
    if (called) {
      calls += 1;
      callBudget.left -= 1;
    }
    inputTokens += result.tokens?.input || 0;
    outputTokens += result.tokens?.output || 0;
    latencyMs += result.latencyMs;
    model = result.model || model;
    reply = result.reply;
    handoff = result.handoff;
    tools = result.tools;
    history.push({ direction: "inbound", body: turn.clientText, at: now.toISOString() });
    history.push({ direction: "outbound", body: result.reply, at: now.toISOString() });
  }
  const graded = gradeTurn({
    phase: ask.phase,
    message: ask.turns.at(-1)?.clientText || "",
    reply,
    handoff,
    tools,
    access: false,
    dossier,
    history: [],
    now,
    expect: { ...expectOf(ask, ask.style === "anglais" ? "en" : "fr"), handoff },
  });
  const scores = [...graded, ...extraScores(ask, reply, handoff)];
  const failed = scores.filter((score) => !score.ok).map((score) => score.criterion);
  return {
    mode: "engine",
    ok: failed.length === 0,
    summary: failed.slice(0, 6).join(", ") || "ok",
    reply: scrubQualityText(reply),
    scores,
    engineKind: "reel",
    model,
    inputTokens,
    outputTokens,
    latencyMs,
    calls,
  };
}

/** Une réécriture optionnelle. Le budget compte les appels. Le texte vide ou un numéro long est ignoré. */
export async function diversifyClientText(
  text: string,
  generate: ((text: string) => Promise<string>) | undefined,
  budget: { left: number }
) {
  if (!generate || budget.left <= 0) return text;
  budget.left -= 1;
  try {
    const next = (await generate(text)).replace(/\d{6,}/g, "").trim().slice(0, 240);
    return next || text;
  } catch {
    return text;
  }
}

/** Joue le routeur et le moteur ombre. Aucun envoi, aucune écriture métier. */
export async function runReservationSimulation(input: {
  cases: { reference: string; dossier: ConciergeDossier }[];
  now?: Date;
  maxAsks?: number;
  budget?: number;
  style?: AskStyle;
  diversify?: (text: string) => Promise<string>;
  diversifyBudget?: number;
  /** Vrai moteur. Sans generate, l’appel passe par AI Gateway. Les tests passent un mock. */
  live?: boolean;
  engineGenerate?: EngineGenerate;
  web?: WebProvider;
}): Promise<AskResult[]> {
  const now = input.now ?? new Date();
  const budget = input.budget ?? Number.POSITIVE_INFINITY;
  const diversifyBudget = { left: input.diversifyBudget ?? 0 };
  const callBudget = { left: input.live ? (input.budget ?? DEFAULT_MODEL_BUDGET) : Number.POSITIVE_INFINITY };
  const web = input.web || (input.live ? resolveWebProvider() : fixtureWebProvider());
  const results: AskResult[] = [];
  for (const row of input.cases) {
    const asks = generateReservationAsks(row.dossier, {
      reference: row.reference,
      now,
      maxAsks: input.maxAsks,
      style: input.style,
    });
    for (const ask of asks) {
      if (!input.live && results.length >= budget) return results;
      if (input.live && callBudget.left <= 0) return results;
      if (input.diversify) {
        ask.turns[0].clientText = await diversifyClientText(ask.turns[0].clientText, input.diversify, diversifyBudget);
      }
      const router = await runMode(row.dossier, ask, "router", now);
      const engine = input.live
        ? await runLiveEngine(row.dossier, ask, now, callBudget, input.engineGenerate, web)
        : await runMode(row.dossier, ask, "engine", now);
      results.push({
        reference: row.reference,
        kind: ask.kind,
        phase: ask.phase,
        title: ask.title,
        action: ask.action,
        clientText: scrubQualityText(ask.turns.map((turn) => turn.clientText).join("\n")),
        router,
        engine,
      });
    }
  }
  return results;
}

export type SimulationSummary = {
  total: number;
  routerRate: number;
  engineRate: number;
  byPhase: { phase: string; total: number; router: number; engine: number }[];
  byKind: { kind: string; total: number; router: number; engine: number }[];
  worst: AskResult[];
};

function rate(passed: number, total: number) {
  if (!total) return 0;
  return Math.round((passed / total) * 100);
}

/** Taux par étape et par type, pires réponses d’abord. */
export function pairStoredSimulations(
  rows: {
    reference: string;
    phase: string;
    kind: string;
    mode: string;
    clientText: string;
    reply: string;
    ok: boolean;
    summary: string;
    engineKind?: EngineRunKind | null;
    model?: string | null;
    inputTokens?: number;
    outputTokens?: number;
    latencyMs?: number;
    calls?: number;
  }[]
): AskResult[] {
  const grouped = new Map<string, AskResult>();
  for (const row of rows) {
    if (row.mode !== "router" && row.mode !== "engine") continue;
    const key = `${row.reference}:${row.kind}:${row.clientText}`;
    const current = grouped.get(key) || {
      reference: row.reference,
      kind: row.kind,
      phase: (row.phase || "sejour") as ScenarioPhase,
      title: row.kind,
      action: "repondre" as AskAction,
      clientText: row.clientText,
      router: { mode: "router" as const, ok: false, summary: "", reply: "", scores: [], engineKind: null, model: null, inputTokens: 0, outputTokens: 0, latencyMs: 0, calls: 0 },
      engine: { mode: "engine" as const, ok: false, summary: "", reply: "", scores: [], engineKind: null, model: null, inputTokens: 0, outputTokens: 0, latencyMs: 0, calls: 0 },
    };
    current[row.mode] = {
      mode: row.mode,
      ok: row.ok,
      summary: row.summary,
      reply: row.reply,
      scores: [],
      engineKind: row.engineKind || null,
      model: row.model || null,
      inputTokens: row.inputTokens || 0,
      outputTokens: row.outputTokens || 0,
      latencyMs: row.latencyMs || 0,
      calls: row.calls || 0,
    };
    grouped.set(key, current);
  }
  return [...grouped.values()];
}

export function summarizeReservationResults(rows: AskResult[]): SimulationSummary {
  const phases = new Map<string, { total: number; router: number; engine: number }>();
  const kinds = new Map<string, { total: number; router: number; engine: number }>();
  for (const row of rows) {
    const phase = phases.get(row.phase) || { total: 0, router: 0, engine: 0 };
    phase.total += 1;
    if (row.router.ok) phase.router += 1;
    if (row.engine.ok) phase.engine += 1;
    phases.set(row.phase, phase);
    const kind = kinds.get(row.kind) || { total: 0, router: 0, engine: 0 };
    kind.total += 1;
    if (row.router.ok) kind.router += 1;
    if (row.engine.ok) kind.engine += 1;
    kinds.set(row.kind, kind);
  }
  const failedFirst = [...rows].sort((a, b) => Number(a.engine.ok) - Number(b.engine.ok) || Number(a.router.ok) - Number(b.router.ok));
  return {
    total: rows.length,
    routerRate: rate(rows.filter((row) => row.router.ok).length, rows.length),
    engineRate: rate(rows.filter((row) => row.engine.ok).length, rows.length),
    byPhase: [...phases.entries()].map(([phase, row]) => ({ phase, ...row })),
    byKind: [...kinds.entries()].map(([kind, row]) => ({ kind, ...row })),
    worst: failedFirst.slice(0, 12),
  };
}

export function stripReservationIdentity<T extends { details?: Record<string, unknown> | null }>(item: T): T {
  if (!item.details) return item;
  const details = { ...item.details };
  for (const key of Object.keys(details)) {
    if (/passport|mrz|birth|naissance|pan|cvv|number/i.test(key) && !/flight_number/i.test(key)) delete details[key];
  }
  return { ...item, details };
}
