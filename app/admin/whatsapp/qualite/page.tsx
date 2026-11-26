import Link from "next/link";
import { requireStaffPage } from "@/lib/crm/auth";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { ConciergeQualityRecord } from "@/components/admin/ConciergeQualityRecord";
import { ConciergeQualityTabs } from "@/components/admin/ConciergeQualityTabs";
import {
  groupQualityRuns,
  parisStamp,
  schemaMissesRelation,
  scrubQualityText,
  type QualityRunRow,
} from "@/lib/crm/concierge-quality-desk";

export const metadata = { title: "Qualité du concierge" };

const MIGRATION =
  "Appliquer d’abord supabase/migrations/20261126004500_concierge_scenarios.sql, puis supabase/migrations/20261126070000_concierge_scenario_run_detail.sql. Rien n’est appliqué depuis cet écran.";

type RunJoin = {
  id: string;
  scenario_id: string;
  mode: string;
  started_at: string;
  finished_at: string | null;
  ok: boolean;
  summary: string;
  batch_id?: string | null;
  crm_concierge_scenarios?: { slug: string; title: string; phase: string } | { slug: string; title: string; phase: string }[] | null;
};

function scenarioOf(row: RunJoin) {
  const joined = row.crm_concierge_scenarios;
  return Array.isArray(joined) ? joined[0] : joined;
}

export default async function ConciergeQualityPage() {
  const { supabase } = await requireStaffPage();
  const full = await supabase
    .from("crm_concierge_scenario_runs")
    .select("id, scenario_id, mode, started_at, finished_at, ok, summary, batch_id, crm_concierge_scenarios(slug, title, phase)")
    .order("started_at", { ascending: false })
    .limit(200);
  const pending = schemaMissesRelation(full.error);
  const narrow =
    !pending && full.error
      ? await supabase
          .from("crm_concierge_scenario_runs")
          .select("id, scenario_id, mode, started_at, finished_at, ok, summary, crm_concierge_scenarios(slug, title, phase)")
          .order("started_at", { ascending: false })
          .limit(200)
      : null;
  const chosen = !full.error ? full : narrow && !narrow.error ? narrow : null;
  const rows = ((chosen?.data || []) as RunJoin[]).map((row) => {
    const scenario = scenarioOf(row);
    return {
      id: row.id,
      scenarioId: row.scenario_id,
      slug: scenario?.slug || row.scenario_id,
      title: scenario?.title || "Scénario",
      phase: scenario?.phase || "",
      mode: row.mode,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      ok: row.ok,
      summary: row.summary,
      batchId: row.batch_id || null,
    } satisfies QualityRunRow;
  });
  const batches = groupQualityRuns(rows);
  const marked = await supabase
    .from("crm_whatsapp_messages")
    .select("id, customer_id, booking_id, phone, body, created_at")
    .eq("concierge_mark", "bad")
    .eq("direction", "outbound")
    .order("created_at", { ascending: false })
    .limit(40);
  const bad = (marked.error ? [] : marked.data || []) as {
    id: string;
    customer_id: string | null;
    booking_id: string | null;
    phone: string | null;
    body: string;
    created_at: string;
  }[];
  const bookingIds = [...new Set(bad.map((row) => row.booking_id).filter(Boolean))] as string[];
  const bookings = bookingIds.length
    ? await supabase.from("crm_bookings").select("id, reference").in("id", bookingIds)
    : { data: [] };
  const references = new Map(
    ((bookings.data || []) as { id: string; reference: string }[]).map((row) => [row.id, row.reference])
  );

  return (
    <div className="space-y-6">
      <div>
        <PageEyebrow>Espace agence</PageEyebrow>
        <PageTitle title="Qualité du concierge" subtitle="Passages du routeur sur des dossiers fictifs, et réponses marquées À revoir." />
      </div>
      <ConciergeQualityTabs current="qualite" />
      {pending ? (
        <p className="admin-af-card rounded-3xl px-5 py-4 text-sm">
          Les scénarios ne sont pas encore en base. {MIGRATION}
        </p>
      ) : (
        <>
          <ConciergeQualityRecord />
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Passages</h2>
            {batches.length ? (
              <ul className="space-y-2">
                {batches.map((batch) => (
                  <li key={batch.id}>
                    <Link href={`/admin/whatsapp/qualite/${batch.id}`} className="admin-af-card block rounded-3xl px-5 py-4 text-sm">
                      <span className="font-semibold">{parisStamp(batch.startedAt)}</span>
                      <span className="text-muted"> · {batch.rate} % · {batch.passed}/{batch.total}</span>
                      {batch.failed.length ? (
                        <p className="mt-1 text-muted">En échec : {batch.failed.map((row) => row.title).join(", ")}</p>
                      ) : (
                        <p className="mt-1 text-muted">Tous les scénarios sont au vert.</p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Aucun passage enregistré.</p>
            )}
          </section>
        </>
      )}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">À revoir</h2>
        {bad.length ? (
          <ul className="space-y-2">
            {bad.map((row) => {
              const reference = row.booking_id ? references.get(row.booking_id) : null;
              const fil = row.phone || row.customer_id || "";
              return (
                <li key={row.id} className="admin-af-card rounded-3xl px-5 py-4 text-sm">
                  <p className="text-muted">{parisStamp(row.created_at)}{reference ? ` · ${reference}` : ""}</p>
                  <p className="mt-1 whitespace-pre-wrap">{scrubQualityText(row.body) || "Réponse retirée."}</p>
                  <p className="mt-2 flex flex-wrap gap-3">
                    {fil ? (
                      <Link className="font-semibold underline-offset-2 hover:underline" href={`/admin/boite?onglet=whatsapp&fil=${encodeURIComponent(fil)}`}>
                        Ouvrir la conversation
                      </Link>
                    ) : null}
                    {row.booking_id ? (
                      <Link className="font-semibold underline-offset-2 hover:underline" href={`/admin/reservations/${row.booking_id}`}>
                        Ouvrir le dossier
                      </Link>
                    ) : null}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">Aucune réponse marquée À revoir.</p>
        )}
      </section>
    </div>
  );
}
