/**
 * Simulation du concierge sur des réservations.
 * Coupée par défaut. Ne bloque pas la CI.
 * Aucun WhatsApp, aucune demande client, aucune écriture de dossier.
 *
 *   CONCIERGE_SIM_RESERVATIONS=1 CONCIERGE_SIM_SAMPLE=8 node scripts/concierge-reservation-sim.mjs
 *
 * CONCIERGE_SIM_LIVE=1 appelle le vrai moteur (un appel par demande).
 * CONCIERGE_SIM_LLM=1 n’est pas branché ici : la diversification reste aux gabarits.
 * Défaut : moteur simulé, zéro appel payant.
 */
const sample = Math.min(Math.max(Number(process.env.CONCIERGE_SIM_SAMPLE || "8"), 1), 40);
const live = process.env.CONCIERGE_SIM_LIVE === "1";
const llm = process.env.CONCIERGE_SIM_LLM === "1";

if (process.env.CONCIERGE_SIM_RESERVATIONS !== "1") {
  console.log(
    JSON.stringify(
      {
        lance: false,
        message: "Simulation coupée. Poser CONCIERGE_SIM_RESERVATIONS=1. Rien n’est lu ni envoyé.",
        echantillon: sample,
        appelsSiLive: sample * 8,
        appelsParDefaut: 0,
        formule: "appels = dossiers × 8 si CONCIERGE_SIM_LIVE=1, plus dossiers × 8 si une diversification LLM est ouverte. Sinon 0.",
      },
      null,
      2
    )
  );
  process.exit(0);
}

const { createServiceClient } = await import("../lib/supabase/admin.ts");
const { readReservationCases } = await import("../lib/crm/concierge-reservation-load.ts");
const { runReservationSimulation, simulationBatchKey, simulationCallEstimate } = await import(
  "../lib/crm/concierge-reservation-sim.ts"
);
const { storeReservationSimulation } = await import("../lib/crm/concierge-reservation-store.ts");

const admin = createServiceClient();
const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
const loaded = await readReservationCases(admin, { limit: sample, seed: day });
if (loaded.error) {
  console.log(JSON.stringify({ lance: false, message: "Lecture impossible.", envoye: false }));
  process.exit(0);
}
const estimate = simulationCallEstimate(loaded.cases.length, { liveEngine: live, llm });
if (live || llm) {
  console.log(
    JSON.stringify({
      lance: false,
      message: "Le script de cette version joue le moteur simulé. Retirer CONCIERGE_SIM_LIVE et CONCIERGE_SIM_LLM.",
      estimation: estimate,
      envoye: false,
    })
  );
  process.exit(0);
}
const results = await runReservationSimulation({ cases: loaded.cases, maxAsks: 8, budget: sample * 8 });
const batchId = crypto.randomUUID();
const stored = await storeReservationSimulation(admin, {
  batchId,
  batchKey: simulationBatchKey({
    day,
    references: loaded.cases.map((row) => row.reference),
    sample,
  }),
  rows: results,
});
console.log(
  JSON.stringify(
    {
      lance: true,
      source: "simulation_reservations",
      dossiers: loaded.cases.length,
      demandes: results.length,
      enregistres: stored.stored,
      enAttenteDeMigration: stored.pending,
      appels: 0,
      estimationSiToutLeParc: "dossiers × 8 appels moteur si CONCIERGE_SIM_LIVE=1, sinon 0",
      envoye: false,
    },
    null,
    2
  )
);
process.exit(0);
