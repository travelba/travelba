import type { EngineGenerate } from "@/lib/crm/concierge-engine";
import type { WebProvider } from "@/lib/crm/concierge-engine-web";
import type { ConciergeDossier } from "@/lib/crm/whatsapp-concierge";
import {
  ASKS_PER_BOOKING,
  generateReservationAsks,
  MAX_MODEL_BUDGET,
  runReservationSimulation,
  type AskResult,
  type AskStyle,
} from "@/lib/crm/concierge-reservation-sim";

/** Un lot live : 2 dossiers, ou 3 si on le demande. Jamais davantage. */
export const LIVE_BATCH_MIN = 2;
export const LIVE_BATCH_MAX = 3;

/**
 * Marge sous les 300 s de Vercel.
 * À ~22 s par appel, on n’entame pas une nouvelle demande après 240 s.
 * Le dernier appel déjà commencé tient encore dans les 300 s.
 */
export const BATCH_SOFT_DEADLINE_MS = 240_000;

export type StoredSimulationRow = {
  batch_id?: string | null;
  booking_reference: string;
  kind: string;
  mode: string;
  calls?: number | null;
};

export type SimulationBatchSelection = {
  batch: string[];
  restants: string[];
};

/** 2, ou 3 dès qu’on demande 3 ou plus. Une valeur absente ou plus petite reste 2. */
export function clampLiveBatchSize(value: number | undefined) {
  if (value == null || !Number.isFinite(value)) return LIVE_BATCH_MIN;
  return Math.round(value) >= LIVE_BATCH_MAX ? LIVE_BATCH_MAX : LIVE_BATCH_MIN;
}

/** Appels encore autorisés pour ce batch_key. Le plafond 200 compte ceux déjà enregistrés. */
export function remainingSimulationBudget(budget: number, spent: number) {
  const cap = Math.min(MAX_MODEL_BUDGET, Math.max(0, Math.round(Number.isFinite(budget) ? budget : 0)));
  const used = Math.max(0, Math.round(Number.isFinite(spent) ? spent : 0));
  return Math.max(0, cap - used);
}

/** Demandes dont les deux lignes (routeur et moteur) sont déjà là, et appels moteur déjà comptés. */
export function storedSimulationProgress(rows: StoredSimulationRow[]) {
  const modes = new Map<string, Set<string>>();
  let calls = 0;
  for (const row of rows) {
    if (row.mode !== "router" && row.mode !== "engine") continue;
    const key = `${row.booking_reference}:${row.kind}`;
    const seen = modes.get(key) || new Set<string>();
    seen.add(row.mode);
    modes.set(key, seen);
    if (row.mode === "engine") calls += Math.max(0, row.calls || 0);
  }
  const keys = new Set<string>();
  for (const [key, seen] of modes) {
    if (seen.has("router") && seen.has("engine")) keys.add(key);
  }
  return { keys, calls };
}

/**
 * Prochain lot. Les dossiers complets sont sautés.
 * `dossiers` limite la liste, sinon on part de `offset`.
 * Un offset déjà dépassé reprend les dossiers encore ouverts.
 */
export function selectSimulationBatch(input: {
  references: string[];
  complets: Iterable<string>;
  offset?: number;
  dossiers?: string[];
  taille: number;
}): SimulationBatchSelection {
  const done = new Set(input.complets);
  const taille = Math.max(0, input.taille);
  const pending = input.references.filter((ref) => !done.has(ref));
  let pool: string[];
  if (input.dossiers && input.dossiers.length) {
    const wanted = new Set(input.dossiers);
    pool = pending.filter((ref) => wanted.has(ref));
  } else {
    const offset = Math.max(0, Math.round(input.offset || 0));
    const fromOffset = input.references.slice(offset).filter((ref) => !done.has(ref));
    pool = fromOffset.length ? fromOffset : pending;
  }
  const batch = pool.slice(0, taille);
  const taken = new Set(batch);
  return { batch, restants: pending.filter((ref) => !taken.has(ref)) };
}

export type SimulationBatchOutcome = {
  demandes: number;
  demandesCumulees: number;
  enregistres: number;
  appels: number;
  appelsCumules: number;
  dossiersFaits: number;
  dossiersTotal: number;
  joues: number;
  suite: boolean;
  offset: number;
  budgetEpuise: boolean;
  pending: boolean;
  error?: "insert" | "moteur";
};

class BatchStop extends Error {
  constructor(readonly reason: "pending" | "insert") {
    super(reason);
  }
}

type SimulationCase = { reference: string; dossier: ConciergeDossier };

function askKinds(row: SimulationCase, options: { now?: Date; maxAsks?: number; style?: AskStyle }) {
  return generateReservationAsks(row.dossier, {
    reference: row.reference,
    now: options.now,
    maxAsks: options.maxAsks,
    style: options.style,
  }).map((ask) => ask.kind);
}

function completeReferences(cases: SimulationCase[], keys: Set<string>, options: { now?: Date; maxAsks?: number; style?: AskStyle }) {
  const done = new Set<string>();
  for (const row of cases) {
    const kinds = askKinds(row, options);
    if (kinds.length === 0 || kinds.every((kind) => keys.has(`${row.reference}:${kind}`))) done.add(row.reference);
  }
  return done;
}

/**
 * Joue un lot et écrit chaque demande avant la suivante.
 * Le budget live est celui qui reste après les appels déjà enregistrés pour la clé.
 * Aucun envoi.
 */
export async function runSimulationBatch(input: {
  cases: SimulationCase[];
  stored: StoredSimulationRow[];
  live: boolean;
  modelBudget: number;
  askBudget: number;
  maxAsks?: number;
  offset?: number;
  dossiers?: string[];
  taille?: number;
  now?: Date;
  style?: AskStyle;
  clock?: () => number;
  deadlineMs?: number;
  engineGenerate?: EngineGenerate;
  web?: WebProvider;
  onAsk: (row: AskResult) => Promise<{ ok: boolean; pending?: boolean; stored: number }>;
}): Promise<SimulationBatchOutcome> {
  const askOptions = { now: input.now, maxAsks: input.maxAsks ?? ASKS_PER_BOOKING, style: input.style };
  const progress = storedSimulationProgress(input.stored);
  const keys = new Set(progress.keys);
  const references = input.cases.map((row) => row.reference);
  const complets = completeReferences(input.cases, keys, askOptions);
  const taille = input.live
    ? clampLiveBatchSize(input.taille)
    : input.taille == null
      ? input.cases.length
      : Math.min(Math.max(Math.round(input.taille), 1), Math.max(input.cases.length, 1));
  const selected = selectSimulationBatch({
    references,
    complets,
    offset: input.offset,
    dossiers: input.dossiers,
    taille,
  });
  const modelLeft = input.live ? remainingSimulationBudget(input.modelBudget, progress.calls) : input.askBudget;
  const byRef = new Map(input.cases.map((row) => [row.reference, row]));
  const slice = selected.batch.map((ref) => byRef.get(ref)).filter((row): row is SimulationCase => Boolean(row));

  const outcome = (extra: { demandes?: number; enregistres?: number; appels?: number; pending?: boolean; error?: SimulationBatchOutcome["error"] }): SimulationBatchOutcome => {
    const faits = completeReferences(input.cases, keys, askOptions);
    const open = references.filter((ref) => !faits.has(ref));
    const next = open[0];
    const appels = extra.appels || 0;
    const cumulative = progress.calls + appels;
    const left = input.live ? remainingSimulationBudget(input.modelBudget, cumulative) : 0;
    const pending = extra.pending === true;
    const error = extra.error;
    const budgetEpuise = input.live && left <= 0 && open.length > 0;
    return {
      demandes: extra.demandes || 0,
      demandesCumulees: keys.size,
      enregistres: extra.enregistres || 0,
      appels,
      appelsCumules: cumulative,
      dossiersFaits: faits.size,
      dossiersTotal: input.cases.length,
      joues: slice.length,
      suite: open.length > 0 && !budgetEpuise && !pending && !error,
      offset: next ? references.indexOf(next) : references.length,
      budgetEpuise,
      pending,
      error: pending ? undefined : error,
    };
  };

  if (!slice.length || (input.live && modelLeft <= 0)) return outcome({});

  const clock = input.clock ?? Date.now;
  const deadlineAt = input.deadlineMs != null ? clock() + input.deadlineMs : undefined;
  let enregistres = 0;
  let appels = 0;
  let pending = false;
  let error: SimulationBatchOutcome["error"];
  let demandes = 0;

  try {
    await runReservationSimulation({
      cases: slice,
      now: input.now,
      maxAsks: askOptions.maxAsks,
      style: input.style,
      budget: input.live ? modelLeft : input.askBudget,
      live: input.live,
      engineGenerate: input.engineGenerate,
      web: input.web,
      clock,
      deadlineAt,
      skipKind: (reference, kind) => keys.has(`${reference}:${kind}`),
      onResult: async (row) => {
        const saved = await input.onAsk(row);
        if (saved.pending) throw new BatchStop("pending");
        if (!saved.ok) throw new BatchStop("insert");
        keys.add(`${row.reference}:${row.kind}`);
        enregistres += saved.stored;
        appels += row.engine.calls;
        demandes += 1;
      },
    });
  } catch (caught) {
    if (caught instanceof BatchStop) {
      if (caught.reason === "pending") pending = true;
      else error = "insert";
    } else {
      error = "moteur";
    }
  }

  return outcome({ demandes, enregistres, appels, pending, error });
}
