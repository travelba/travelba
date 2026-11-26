/**
 * Rejoue les scénarios du nouveau moteur sur le vrai modèle.
 * Coupé par défaut. Ne bloque pas la CI. N’envoie aucun message.
 *
 *   CONCIERGE_ENGINE_EVAL=1 node scripts/concierge-engine-eval.mjs
 *
 * Recherche : AI Gateway si la passerelle est là, sinon TAVILY_API_KEY, sinon coupée.
 */
if (process.env.CONCIERGE_ENGINE_EVAL !== "1") {
  console.log("Évaluation du moteur ombre coupée. Poser CONCIERGE_ENGINE_EVAL=1. Rien n’est envoyé.");
  process.exit(0);
}

const { runScenario } = await import("../lib/crm/concierge-sim.ts");
const { CONCIERGE_ENGINE_SCENARIOS, SCENARIO_NOW } = await import("../lib/crm/concierge-engine-scenarios.ts");
const { resolveWebProvider, gatewaySearchConfigured } = await import("../lib/crm/concierge-engine-web.ts");
const { aiGatewayConfigured } = await import("../lib/crm/ingest-types.ts");

const web = resolveWebProvider();
const modelReady = aiGatewayConfigured();
let passed = 0;
const rows = [];
for (const scenario of CONCIERGE_ENGINE_SCENARIOS) {
  if (!modelReady) {
    rows.push({ slug: scenario.slug, ok: false, summary: "modèle indisponible" });
    continue;
  }
  const run = await runScenario(scenario, {
    mode: "engine",
    now: SCENARIO_NOW,
    liveEngine: true,
    web,
  });
  if (run.ok) passed += 1;
  rows.push({
    slug: run.slug,
    ok: run.ok,
    summary: run.summary,
    replies: run.turns.map((turn) => turn.reply),
  });
}

const score = CONCIERGE_ENGINE_SCENARIOS.length ? Math.round((passed / CONCIERGE_ENGINE_SCENARIOS.length) * 100) : 0;
console.log(
  JSON.stringify(
    {
      score,
      passed,
      total: CONCIERGE_ENGINE_SCENARIOS.length,
      model: modelReady ? "appelé" : "indisponible",
      web: web.name,
      gateway: gatewaySearchConfigured(),
      tavily: Boolean(process.env.TAVILY_API_KEY?.trim()),
      sent: false,
      rows,
    },
    null,
    2
  )
);
process.exit(0);
