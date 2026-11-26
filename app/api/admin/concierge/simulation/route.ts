import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { readReservationCases, type ReservationReader } from "@/lib/crm/concierge-reservation-load";
import {
  runReservationSimulation,
  simulationBatchKey,
  simulationCallEstimate,
} from "@/lib/crm/concierge-reservation-sim";
import { storeReservationSimulation, type SimulationWriter } from "@/lib/crm/concierge-reservation-store";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Échantillon en lecture seule. Le moteur simulé, sans appel payant, sauf modele true. */
export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  let sample = 8;
  let modele = false;
  try {
    const body = (await request.json()) as { echantillon?: number; modele?: boolean };
    if (typeof body.echantillon === "number" && Number.isFinite(body.echantillon)) sample = body.echantillon;
    modele = body.modele === true;
  } catch {
    sample = 8;
  }
  sample = Math.min(Math.max(Math.round(sample), 1), 20);
  if (modele) return jsonError("Le modèle payant se lance avec le script, pas depuis cet écran.", 409);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
  const loaded = await readReservationCases(auth.supabase as unknown as ReservationReader, { limit: sample, seed: day });
  if (loaded.error) return jsonError("Les dossiers n’ont pas pu être lus.", 500);
  const results = await runReservationSimulation({ cases: loaded.cases, maxAsks: 8, budget: sample * 8 });
  const batchId = crypto.randomUUID();
  const stored = await storeReservationSimulation(auth.supabase as unknown as SimulationWriter, {
    batchId,
    batchKey: simulationBatchKey({
      day,
      references: loaded.cases.map((row) => row.reference),
      sample,
    }),
    rows: results,
  });
  if (stored.pending) return jsonError("La simulation s’enregistre après la migration. Rien n’a été écrit.", 409);
  if (stored.error) return jsonError("Le résultat n’a pas pu être enregistré.", 500);
  const estimate = simulationCallEstimate(loaded.cases.length, { liveEngine: false, llm: false });
  return NextResponse.json({
    lot: batchId,
    dossiers: loaded.cases.length,
    demandes: results.length,
    enregistres: stored.stored,
    appels: estimate.appelsTotal,
    source: "simulation_reservations",
  });
}
