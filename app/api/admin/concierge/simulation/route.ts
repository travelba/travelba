import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { readReservationCases, type ReservationReader } from "@/lib/crm/concierge-reservation-load";
import { resolveWebProvider } from "@/lib/crm/concierge-engine-web";
import {
  liveSimulationPlan,
  runReservationSimulation,
  simulationBatchKey,
} from "@/lib/crm/concierge-reservation-sim";
import { storeReservationSimulation, type SimulationWriter } from "@/lib/crm/concierge-reservation-store";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Échantillon en lecture seule. modele true joue le vrai Concierge, plafonné. */
export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  let sample = 8;
  let modele = false;
  let budgetAsked: number | undefined;
  try {
    const body = (await request.json()) as { echantillon?: number; modele?: boolean; budget?: number };
    if (typeof body.echantillon === "number" && Number.isFinite(body.echantillon)) sample = body.echantillon;
    if (typeof body.budget === "number" && Number.isFinite(body.budget)) budgetAsked = body.budget;
    modele = body.modele === true;
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
  const results = await runReservationSimulation({
    cases: loaded.cases.slice(0, plan.sample),
    maxAsks: 8,
    budget: modele ? plan.budget : plan.sample * 8,
    live: modele,
    web: modele ? resolveWebProvider() : undefined,
  });
  const appels = results.reduce((sum, row) => sum + row.engine.calls, 0);
  const batchId = crypto.randomUUID();
  const stored = await storeReservationSimulation(auth.supabase as unknown as SimulationWriter, {
    batchId,
    batchKey: simulationBatchKey({
      day,
      references: loaded.cases.map((row) => row.reference),
      sample: plan.sample,
    }),
    rows: results,
  });
  if (stored.pending) return jsonError("La simulation s’enregistre après la migration. Rien n’a été écrit.", 409);
  if (stored.error) return jsonError("Le résultat n’a pas pu être enregistré.", 500);
  return NextResponse.json({
    lot: batchId,
    dossiers: Math.min(loaded.cases.length, plan.sample),
    demandes: results.length,
    enregistres: stored.stored,
    moteur: modele ? "reel" : "simule",
    budget: modele ? plan.budget : 0,
    appels,
    source: "simulation_reservations",
  });
}
