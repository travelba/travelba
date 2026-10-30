import { notFound } from "next/navigation";
import { AgencyLimitsForm } from "@/components/admin/AgencyLimitsForm";
import { JournalDesk } from "@/components/admin/JournalDesk";
import { RightsMatrix } from "@/components/admin/RightsMatrix";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { rightsGrid } from "@/lib/crm/agency-access";
import { exampleSessionEnabled } from "@/lib/crm/example-session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Aperçu droits", robots: { index: false, follow: false } };

const ROWS = [
  {
    seq: 2,
    occurred_at: "2026-10-24T18:04:00.000Z",
    actor: "Camille Comptable",
    action: "update" as const,
    entity_type: "finance" as const,
    entity_id: null,
    summary: "Modification · Finance",
  },
  {
    seq: 1,
    occurred_at: "2026-10-24T09:12:00.000Z",
    actor: "Alex Agent",
    action: "create" as const,
    entity_type: "dossier" as const,
    entity_id: null,
    summary: "Création · Dossier",
  },
];

export default async function AgencyPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ partie?: string }>;
}) {
  if (!exampleSessionEnabled()) notFound();
  const partie = (await searchParams).partie;
  const droits = partie !== "journal";
  const journal = partie !== "droits";
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      {droits ? (
        <>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle title="Équipe" subtitle="Droits et alertes. L’administrateur garde tout, hors de la grille." />
      <RightsMatrix grid={rightsGrid(null)} preview />
      <AgencyLimitsForm paymentEuros={5000} failedLogins={5} preview />
        </>
      ) : null}
      {journal ? (
      <div className={droits ? "mt-10" : ""}>
        <PageEyebrow>Espace agence</PageEyebrow>
        <PageTitle title="Journal" subtitle="Filtres, alertes et export." />
        <JournalDesk
          rows={ROWS}
          alerts={[{ id: "alerte-1", created_at: "2026-10-24T18:05:00.000Z", summary: "Export du journal.", kind: "export" }]}
          agents={[
            { id: "agent-1", name: "Alex Agent" },
            { id: "comptable-1", name: "Camille Comptable" },
          ]}
          filters={{ agent: "", from: "", to: "", entity: "", action: "" }}
          canExport
          chainIntact
        />
      </div>
      ) : null}
    </main>
  );
}
