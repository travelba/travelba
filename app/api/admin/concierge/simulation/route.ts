import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { schemaMissesRelation } from "@/lib/crm/concierge-quality-desk";
import { readReservationCases, type ReservationReader } from "@/lib/crm/concierge-reservation-load";
import { resolveWebProvider } from "@/lib/crm/concierge-engine-web";
import { liveSimulationPlan, SIMULATION_SOURCE, simulationBatchKey } from "@/lib/crm/concierge-reservation-sim";
import { storeReservationSimulation, type SimulationWriter } from "@/lib/crm/concierge-reservation-store";
import {
  BATCH_SOFT_DEADLINE_MS,
  runSimulationBatch,
  type StoredSimulationRow,
} from "@/lib/crm/concierge-reservation-batch";

export const runtime = "nodejs";
/** Plan Pro : 800 s. Chaque lot s’arrête vers 240 s pour rester sous 300. */
export const maxDuration = 800;

function cleanBatchKey(value: unknown) {
  if (typeof value !== "string") return undefined;
  const key = value.trim();
  if (!key || key.length > 120 || /[^\w:.-]/.test(key)) return undefined;
  return key;
}

function cleanReferences(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const refs = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => /^[A-Za-z0-9-]{1,40}$/.test(item));
  return refs.length ? refs.slice(0, 20) : undefined;
}

/** Échantillon en lecture seule. modele true joue le vrai Concierge, par lots, plafonné. */
export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  let sample = 8;
  let modele = false;
  let budgetAsked: number | undefined;
  let offset = 0;
  let taille: number | undefined;
  let dossiers: string[] | undefined;
  let batchKeyAsked: string | undefined;
  try {
    const body = (await request.json()) as {
      echantillon?: number;
      modele?: boolean;
      budget?: number;
      batch_key?: unknown;
      offset?: number;
      dossiers?: unknown;
      taille?: number;
    };
    if (typeof body.echantillon === "number" && Number.isFinite(body.echantillon)) sample = body.echantillon;
    if (typeof body.budget === "number" && Number.isFinite(body.budget)) budgetAsked = body.budget;
    if (typeof body.offset === "number" && Number.isFinite(body.offset)) offset = Math.max(0, Math.round(body.offset));
    if (typeof body.taille === "number" && Number.isFinite(body.taille)) taille = body.taille;
    modele = body.modele === true;
    batchKeyAsked = cleanBatchKey(body.batch_key);
    dossiers = cleanReferences(body.dossiers);
  } catch {
    sample = 8;
  }
  const plan = liveSimulationPlan({
    CONCIERGE_SIM_LIVE: modele ? "1" : "0",
    CONCIERGE_SIM_SAMPLE: String(sample),
    ...(budgetAsked != null ? { CONCIERGE_SIM_BUDGET: String(budgetAsked) } : {}),
  });
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
  const loaded = await readReservationCases(auth.supabase as unknown as ReservationReader, {
    limit: plan.sample,
    seed: day,
  });
  if (loaded.error) return jsonError("Les dossiers n’ont pas pu être lus.", 500);
  const cases = loaded.cases.slice(0, plan.sample);
  const batchKey =
    batchKeyAsked ||
    simulationBatchKey({
      day,
      references: cases.map((row) => row.reference),
      sample: plan.sample,
    });
  const existing = await auth.supabase
    .from("crm_concierge_reservation_sims")
    .select("batch_id, booking_reference, kind, mode, calls")
    .eq("batch_key", batchKey)
    .eq("source", SIMULATION_SOURCE)
    .limit(2000);
  if (
    schemaMissesRelation(existing.error) ||
    existing.error?.code === "42703" ||
    existing.error?.code === "PGRST204" ||
    /column|schema cache/i.test(existing.error?.message || "")
  ) {
    return jsonError("La simulation s’enregistre après la migration. Rien n’a été écrit.", 409);
  }
  if (existing.error) return jsonError("Les résultats déjà enregistrés n’ont pas pu être lus.", 500);
  const stored = (existing.data || []) as StoredSimulationRow[];
  const batchId = stored.find((row) => row.batch_id)?.batch_id || crypto.randomUUID();
  const writer = auth.supabase as unknown as SimulationWriter;
  const outcome = await runSimulationBatch({
    cases,
    stored,
    live: modele,
    modelBudget: plan.budget,
    askBudget: plan.sample * 8,
    maxAsks: 8,
    offset,
    dossiers,
    taille,
    deadlineMs: modele ? BATCH_SOFT_DEADLINE_MS : undefined,
    web: modele ? resolveWebProvider() : undefined,
    onAsk: async (row) => {
      const saved = await storeReservationSimulation(writer, { batchKey, batchId, rows: [row] });
      if (saved.pending) return { ok: false, pending: true, stored: 0 };
      if (saved.error) return { ok: false, stored: 0 };
      return { ok: true, stored: saved.stored };
    },
  });
  const payload = {
    lot: batchId,
    cle: batchKey,
    dossiers: outcome.joues,
    dossiers_faits: outcome.dossiersFaits,
    dossiers_total: outcome.dossiersTotal,
    demandes: outcome.demandes,
    demandes_cumulees: outcome.demandesCumulees,
    enregistres: outcome.enregistres,
    moteur: modele ? "reel" : "simule",
    budget: modele ? plan.budget : 0,
    appels: outcome.appels,
    appels_cumules: outcome.appelsCumules,
    suite: outcome.suite,
    offset: outcome.offset,
    budget_epuise: outcome.budgetEpuise,
    source: SIMULATION_SOURCE,
  };
  if (outcome.pending) {
    return NextResponse.json(
      { ...payload, error: "La simulation s’enregistre après la migration. Rien n’a été écrit." },
      { status: 409 }
    );
  }
  if (outcome.error) {
    return NextResponse.json(
      {
        ...payload,
        error: outcome.error === "moteur" ? "La simulation n’a pas abouti." : "Le résultat n’a pas pu être enregistré.",
      },
      { status: 500 }
    );
  }
  return NextResponse.json(payload);
}
