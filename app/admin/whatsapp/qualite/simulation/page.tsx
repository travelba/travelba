import { requireStaffPage } from "@/lib/crm/auth";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { ConciergeQualityTabs } from "@/components/admin/ConciergeQualityTabs";
import { ConciergeSimulationLaunch } from "@/components/admin/ConciergeSimulationLaunch";
import { schemaMissesRelation } from "@/lib/crm/concierge-quality-desk";
import { pairStoredSimulations, summarizeReservationResults } from "@/lib/crm/concierge-reservation-sim";

export const metadata = { title: "Simulation sur les réservations" };

const MIGRATION =
  "Appliquer supabase/migrations/20261126120000_concierge_reservation_sim.sql à la main. Rien n’est appliqué depuis cet écran.";

type Stored = {
  booking_reference: string;
  phase: string;
  kind: string;
  mode: string;
  client_text: string;
  reply: string;
  ok: boolean;
  summary: string;
};

export default async function ReservationSimulationPage({
  searchParams,
}: {
  searchParams: Promise<{ dossier?: string }>;
}) {
  const { dossier: focus } = await searchParams;
  const { supabase } = await requireStaffPage();
  const loaded = await supabase
    .from("crm_concierge_reservation_sims")
    .select("booking_reference, phase, kind, mode, client_text, reply, ok, summary")
    .eq("source", "simulation_reservations")
    .order("created_at", { ascending: false })
    .limit(500);
  const pending = schemaMissesRelation(loaded.error);
  const rows = ((loaded.data || []) as Stored[]).map((row) => ({
    reference: row.booking_reference,
    phase: row.phase,
    kind: row.kind,
    mode: row.mode,
    clientText: row.client_text,
    reply: row.reply,
    ok: row.ok,
    summary: row.summary,
  }));
  const paired = pairStoredSimulations(focus ? rows.filter((row) => row.reference === focus) : rows);
  const summary = summarizeReservationResults(paired);

  return (
    <div className="space-y-6">
      <div>
        <PageEyebrow>Espace agence</PageEyebrow>
        <PageTitle
          title="Simulation sur les réservations"
          subtitle="Le routeur et le moteur ombre, sur des demandes inventées à partir des dossiers. Aucun message n’est envoyé."
        />
      </div>
      <ConciergeQualityTabs current="simulation" />
      {pending ? (
        <p className="admin-af-card rounded-3xl px-5 py-4 text-sm">{MIGRATION}</p>
      ) : (
        <>
          <ConciergeSimulationLaunch />
          <section className="admin-af-card rounded-3xl px-5 py-4 text-sm">
            <p>
              Routeur {summary.routerRate} % · Moteur {summary.engineRate} % · {summary.total} demandes
            </p>
          </section>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Par étape</h2>
            <ul className="space-y-2">
              {summary.byPhase.map((row) => (
                <li key={row.phase} className="admin-af-card rounded-3xl px-5 py-3 text-sm">
                  {row.phase} · routeur {row.router}/{row.total} · moteur {row.engine}/{row.total}
                </li>
              ))}
            </ul>
          </section>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Par type</h2>
            <ul className="space-y-2">
              {summary.byKind.map((row) => (
                <li key={row.kind} className="admin-af-card rounded-3xl px-5 py-3 text-sm">
                  {row.kind} · routeur {row.router}/{row.total} · moteur {row.engine}/{row.total}
                </li>
              ))}
            </ul>
          </section>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Réponses à revoir</h2>
            <ul className="space-y-2">
              {summary.worst.map((row) => (
                <li key={`${row.reference}-${row.kind}-${row.clientText}`} className="admin-af-card rounded-3xl px-5 py-4 text-sm">
                  <p className="font-semibold">
                    {row.reference} · {row.kind}
                  </p>
                  <p className="mt-1">{row.clientText}</p>
                  <p className="mt-2 text-muted">Routeur : {row.router.reply || "—"}</p>
                  <p className="text-muted">Moteur : {row.engine.reply || "—"}</p>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
