import Link from "next/link";
import { RewardNoteForm } from "@/components/admin/RewardNoteForm";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { roleAllows } from "@/lib/crm/agency-access";
import { loadPermissionMatrix } from "@/lib/crm/agency-guard";
import { requireStaffPage } from "@/lib/crm/auth";
import { listReferralBoard } from "@/lib/crm/signup-run";

export const metadata = { title: "Parrainages" };

export default async function ParrainagesPage() {
  const { staff } = await requireStaffPage();
  const matrix = await loadPermissionMatrix();
  if (!roleAllows(staff.role, "review_signups", matrix)) {
    return <PageTitle title="Parrainages" subtitle="Réservé aux administrateurs." />;
  }
  const board = await listReferralBoard();
  return (
    <div className="space-y-6">
      <div>
        <PageEyebrow>Clients</PageEyebrow>
        <PageTitle
          title="Parrainages"
          subtitle="Compteurs par parrain. La récompense est une note, sans mouvement d’argent."
          actions={
            <Link href="/admin/inscriptions" className="text-sm font-semibold underline">
              Demandes
            </Link>
          }
        />
      </div>
      {!board.ready ? (
        <p className="text-sm font-semibold">La migration n’est pas encore appliquée.</p>
      ) : board.groups.length === 0 ? (
        <p className="text-sm text-muted">Aucun parrainage.</p>
      ) : (
        board.groups.map((group) => (
          <section key={group.id} className="rounded-2xl border border-[var(--border)] bg-white p-4">
            <h2 className="font-semibold text-[var(--admin-navy)]">
              {group.name} · {group.code}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {group.valides} validé{group.valides > 1 ? "s" : ""} · {group.enAttente} en attente
            </p>
            <ul className="mt-3 space-y-3">
              {group.lignes.map((row) => (
                <li key={row.id} className="text-sm">
                  <span className="font-semibold">{row.status === "valide" ? "Validé" : "En attente"}</span>
                  {row.filleul ? ` · ${row.filleul}` : ""}
                  <RewardNoteForm id={row.id} note={row.rewardNote || ""} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
