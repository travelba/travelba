import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/crm/auth";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { ConciergeQualityTabs } from "@/components/admin/ConciergeQualityTabs";
import { parisStamp, schemaMissesRelation, scrubQualityText, type StoredTurn } from "@/lib/crm/concierge-quality-desk";

export const metadata = { title: "Passage du concierge" };

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RunRow = {
  id: string;
  scenario_id: string;
  mode: string;
  started_at: string;
  ok: boolean;
  summary: string;
  turns?: StoredTurn[] | null;
  crm_concierge_scenarios?: { slug: string; title: string; phase: string } | { slug: string; title: string; phase: string }[] | null;
};

function scenarioOf(row: RunRow) {
  const joined = row.crm_concierge_scenarios;
  return Array.isArray(joined) ? joined[0] : joined;
}

export default async function ConciergeQualityRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID.test(id)) notFound();
  const { supabase } = await requireStaffPage();
  const select =
    "id, scenario_id, mode, started_at, ok, summary, turns, crm_concierge_scenarios(slug, title, phase)";
  const byBatch = await supabase.from("crm_concierge_scenario_runs").select(select).eq("batch_id", id).order("started_at", { ascending: true });
  const pending = schemaMissesRelation(byBatch.error);
  const fallback =
    !pending && (byBatch.error || !(byBatch.data || []).length)
      ? await supabase.from("crm_concierge_scenario_runs").select(select.replace(", turns", "")).eq("id", id)
      : null;
  const rows = ((byBatch.error ? fallback?.data : byBatch.data) || []) as RunRow[];
  if (pending) {
    return (
      <div className="space-y-6">
        <PageEyebrow>Espace agence</PageEyebrow>
        <PageTitle title="Passage" subtitle="Les scénarios ne sont pas encore en base." />
        <ConciergeQualityTabs current="qualite" />
        <p className="text-sm text-muted">
          Appliquer supabase/migrations/20261126004500_concierge_scenarios.sql puis 20261126070000_concierge_scenario_run_detail.sql.
        </p>
      </div>
    );
  }
  if (!rows.length) notFound();
  const runIds = rows.map((row) => row.id);
  const scored = await supabase
    .from("crm_concierge_scenario_scores")
    .select("run_id, position, criterion, ok, detail")
    .in("run_id", runIds);
  const scores = (scored.error ? [] : scored.data || []) as {
    run_id: string;
    position: number;
    criterion: string;
    ok: boolean;
    detail: string;
  }[];
  const started = rows.map((row) => row.started_at).sort()[0] || "";

  return (
    <div className="space-y-6">
      <div>
        <PageEyebrow>Espace agence</PageEyebrow>
        <PageTitle title="Passage du routeur" subtitle={parisStamp(started)} />
      </div>
      <ConciergeQualityTabs current="qualite" />
      <Link href="/admin/whatsapp/qualite" className="text-sm font-semibold underline-offset-2 hover:underline">
        Tous les passages
      </Link>
      <ul className="space-y-3">
        {rows.map((row) => {
          const scenario = scenarioOf(row);
          const turns = Array.isArray(row.turns) ? row.turns : [];
          const own = scores.filter((score) => score.run_id === row.id);
          return (
            <li key={row.id} className="admin-af-card space-y-3 rounded-3xl px-5 py-4 text-sm">
              <p className="font-semibold">
                {scenario?.title || "Scénario"}
                <span className="font-normal text-muted"> · {row.ok ? "Au vert" : "En échec"} · {row.mode}</span>
              </p>
              {turns.length ? (
                <ol className="space-y-3">
                  {turns.map((turn) => {
                    const notes = own.filter((score) => score.position === turn.position && !score.ok);
                    return (
                      <li key={turn.position}>
                        <p className="text-muted">Client · {turn.status === "skipped" ? "tour sauté" : `tour ${turn.position}`}</p>
                        <p className="whitespace-pre-wrap">{scrubQualityText(turn.client)}</p>
                        <p className="mt-1 text-muted">Concierge</p>
                        <p className="whitespace-pre-wrap">{scrubQualityText(turn.reply) || "Pas de réponse notée."}</p>
                        {notes.length ? (
                          <p className="mt-1 text-muted">Critères ratés : {notes.map((note) => note.criterion).join(", ")}</p>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="text-muted">{row.ok ? "Scénario au vert." : scrubQualityText(row.summary) || "Scénario en échec."}</p>
              )}
              {!turns.length && own.some((score) => !score.ok) ? (
                <p className="text-muted">Critères ratés : {[...new Set(own.filter((score) => !score.ok).map((score) => score.criterion))].join(", ")}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
