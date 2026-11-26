import { CONCIERGE_EDGES, CONCIERGE_NEARBY, CONCIERGE_SCENARIOS } from "@/lib/crm/concierge-scenarios.fixture";
import { SCENARIO_NOW } from "@/lib/crm/concierge-scenarios.fixture";
import { runScenario, type ConciergeScenario } from "@/lib/crm/concierge-sim";
import { schemaMissesRelation, scoreRowsForStore, turnsForStore } from "@/lib/crm/concierge-quality-desk";

type QueryError = { message?: string; code?: string } | null;

type WriteResult<T> = { data: T; error: QueryError };

/** Le client staff, déjà limité par la RLS. Aucun service role. */
export type QualityWriter = {
  from(table: string): {
    upsert(row: Record<string, unknown> | Record<string, unknown>[], options?: { onConflict?: string }): {
      select(columns: string): Promise<WriteResult<unknown>>;
    };
    insert(row: Record<string, unknown> | Record<string, unknown>[]): {
      select(columns: string): Promise<WriteResult<unknown>>;
    };
  };
};

export function qualityScenarios(): ConciergeScenario[] {
  const seen = new Set<string>();
  const rows: ConciergeScenario[] = [];
  for (const scenario of [...CONCIERGE_SCENARIOS, ...CONCIERGE_EDGES, ...CONCIERGE_NEARBY]) {
    if (seen.has(scenario.slug)) continue;
    seen.add(scenario.slug);
    rows.push(scenario);
  }
  return rows;
}

function missingColumn(error: QueryError) {
  if (!error) return false;
  return error.code === "42703" || error.code === "PGRST204" || /column|schema cache/i.test(error.message || "");
}

/** Lance le routeur sur les dossiers fictifs et écrit le lot. Aucun envoi. */
export async function recordQualityBatch(writer: QualityWriter, now = new Date()) {
  const scenarios = qualityScenarios();
  const played = [];
  for (const scenario of scenarios) {
    played.push({ scenario, run: await runScenario(scenario, { mode: "router", now: SCENARIO_NOW }) });
  }
  const batchId = crypto.randomUUID();
  const startedAt = now.toISOString();
  const finishedAt = new Date().toISOString();

  const scenarioRows = scenarios.map((scenario) => ({
    slug: scenario.slug,
    phase: scenario.phase,
    title: scenario.title,
    locale: scenario.locale,
    published: scenario.published,
    fixture: scenario.fixture,
  }));
  const saved = await writer.from("crm_concierge_scenarios").upsert(scenarioRows, { onConflict: "slug" }).select("id, slug");
  if (saved.error) {
    if (schemaMissesRelation(saved.error)) return { pending: true as const, batchId: null, total: 0, passed: 0 };
    return { pending: false as const, error: "Les scénarios n’ont pas été enregistrés.", batchId: null, total: 0, passed: 0 };
  }
  const ids = new Map(
    ((saved.data || []) as { id: string; slug: string }[]).map((row) => [row.slug, row.id])
  );

  const turnRows = scenarios.flatMap((scenario) => {
    const scenarioId = ids.get(scenario.slug);
    if (!scenarioId) return [];
    return scenario.turns.map((turn) => ({
      scenario_id: scenarioId,
      position: turn.position,
      client_text: turn.clientText.slice(0, 500),
      expect: turn.expect,
    }));
  });
  if (turnRows.length) {
    const turns = await writer.from("crm_concierge_scenario_turns").upsert(turnRows, { onConflict: "scenario_id,position" }).select("id");
    if (turns.error && !schemaMissesRelation(turns.error)) {
      return { pending: false as const, error: "Les tours n’ont pas été enregistrés.", batchId: null, total: 0, passed: 0 };
    }
  }

  const runPayload = played.flatMap(({ scenario, run }) => {
    const scenarioId = ids.get(scenario.slug);
    if (!scenarioId) return [];
    return [
      {
        scenarioId,
        row: {
          scenario_id: scenarioId,
          mode: "router",
          started_at: startedAt,
          finished_at: finishedAt,
          ok: run.ok,
          summary: run.summary.slice(0, 180),
          batch_id: batchId,
          turns: turnsForStore(scenario, run),
        },
        run,
      },
    ];
  });

  let inserted = await writer.from("crm_concierge_scenario_runs").insert(runPayload.map((item) => item.row)).select("id, scenario_id");
  if (inserted.error && missingColumn(inserted.error)) {
    inserted = await writer
      .from("crm_concierge_scenario_runs")
      .insert(
        runPayload.map((item) => ({
          scenario_id: item.row.scenario_id,
          mode: item.row.mode,
          started_at: item.row.started_at,
          finished_at: item.row.finished_at,
          ok: item.row.ok,
          summary: item.row.summary,
        }))
      )
      .select("id, scenario_id");
  }
  if (inserted.error) {
    if (schemaMissesRelation(inserted.error)) return { pending: true as const, batchId: null, total: 0, passed: 0 };
    return { pending: false as const, error: "Le passage n’a pas été enregistré.", batchId: null, total: 0, passed: 0 };
  }
  const runIds = new Map(
    ((inserted.data || []) as { id: string; scenario_id: string }[]).map((row) => [row.scenario_id, row.id])
  );
  const scores = runPayload.flatMap((item) => {
    const runId = runIds.get(item.scenarioId);
    if (!runId) return [];
    return scoreRowsForStore(runId, item.run);
  });
  if (scores.length) {
    const scored = await writer.from("crm_concierge_scenario_scores").insert(scores).select("id");
    if (scored.error && !schemaMissesRelation(scored.error)) {
      return { pending: false as const, error: "Les notes n’ont pas été enregistrées.", batchId, total: played.length, passed: played.filter((row) => row.run.ok).length };
    }
  }
  return {
    pending: false as const,
    error: null,
    batchId,
    total: played.length,
    passed: played.filter((row) => row.run.ok).length,
  };
}
