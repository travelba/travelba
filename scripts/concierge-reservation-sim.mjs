/**
 * Simulation du concierge sur des réservations.
 * Coupée par défaut. Ne bloque pas la CI.
 * Aucun WhatsApp, aucune demande client, aucune écriture de dossier.
 *
 *   CONCIERGE_SIM_RESERVATIONS=1 CONCIERGE_SIM_SAMPLE=8 node scripts/concierge-reservation-sim.mjs
 *   CONCIERGE_SIM_RESERVATIONS=1 CONCIERGE_SIM_LIVE=1 CONCIERGE_SIM_SAMPLE=20 node scripts/concierge-reservation-sim.mjs
 *
 * CONCIERGE_SIM_LIVE=1 joue le vrai moteur (AI Gateway), au plus 20 dossiers.
 * CONCIERGE_SIM_BUDGET plafonne les appels (défaut 200, maximum 200).
 * CONCIERGE_SIM_LLM=1 n’est pas branché : la diversification reste aux gabarits.
 */
const llm = process.env.CONCIERGE_SIM_LLM === "1";

if (process.env.CONCIERGE_SIM_RESERVATIONS !== "1") {
  console.log(
    JSON.stringify(
      {
        lance: false,
        message: "Simulation coupée. Poser CONCIERGE_SIM_RESERVATIONS=1. Rien n’est lu ni envoyé.",
        echantillonMaxReel: 20,
        budgetDefaut: 200,
        appelsParDefaut: 0,
        formule: "Vrai Concierge : au plus 20 dossiers et 200 appels (CONCIERGE_SIM_BUDGET). Sinon 0.",
      },
      null,
      2
    )
  );
  process.exit(0);
}

const { liveSimulationPlan, runReservationSimulation, simulationBatchKey, simulationCallEstimate } = await import(
  "../lib/crm/concierge-reservation-sim.ts"
);
const plan = liveSimulationPlan(process.env);
const sample = plan.sample;
const live = plan.live;
const { createServiceClient } = await import("../lib/supabase/admin.ts");
const { readReservationCases } = await import("../lib/crm/concierge-reservation-load.ts");
const { resolveWebProvider } = await import("../lib/crm/concierge-engine-web.ts");
const { storeReservationSimulation } = await import("../lib/crm/concierge-reservation-store.ts");

const admin = createServiceClient();
const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
const loaded = await readReservationCases(admin, { limit: sample, seed: day });
if (loaded.error) {
  console.log(JSON.stringify({ lance: false, message: "Lecture impossible.", envoye: false }));
  process.exit(0);
}
const estimate = simulationCallEstimate(loaded.cases.length, { liveEngine: live, llm });
if (llm) {
  console.log(
    JSON.stringify({
      lance: false,
      message: "La diversification LLM n’est pas branchée sur ce script. Retirer CONCIERGE_SIM_LLM.",
      estimation: estimate,
      envoye: false,
    })
  );
  process.exit(0);
}
const capped = loaded.cases.slice(0, sample);
const batchId = crypto.randomUUID();
const batchKey = simulationBatchKey({
  day,
  references: capped.map((row) => row.reference),
  sample,
});
let enregistres = 0;
let pending = false;
let demandes = 0;
let appels = 0;
let interrompu = false;
try {
  await runReservationSimulation({
    cases: capped,
    maxAsks: 8,
    budget: live ? plan.budget : sample * 8,
    live,
    web: live ? resolveWebProvider() : undefined,
    onResult: async (row) => {
      const stored = await storeReservationSimulation(admin, { batchId, batchKey, rows: [row] });
      if (stored.pending) {
        pending = true;
        throw new Error("migration");
      }
      if (stored.error) throw new Error("insert");
      enregistres += stored.stored;
      demandes += 1;
      appels += row.engine.calls || 0;
    },
  });
} catch {
  interrompu = !pending;
}
console.log(
  JSON.stringify(
    {
      lance: true,
      source: "simulation_reservations",
      dossiers: capped.length,
      demandes,
      enregistres,
      enAttenteDeMigration: pending,
      interrompu,
      moteur: live ? "reel" : "simule",
      budget: plan.budget,
      appels,
      envoye: false,
    },
    null,
    2
  )
);
process.exit(0);
