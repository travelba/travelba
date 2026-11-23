import Link from "next/link";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { SignupInviteForm } from "@/components/admin/SignupInviteForm";
import { roleAllows } from "@/lib/crm/agency-access";
import { loadPermissionMatrix } from "@/lib/crm/agency-guard";
import { requireStaffPage } from "@/lib/crm/auth";
import { customerForInvitation, listSignupQueue } from "@/lib/crm/signup-run";

const LABELS: Record<string, string> = {
  brouillon: "Brouillon",
  en_attente: "En attente",
  a_completer: "À compléter",
  validee: "Validée",
  refusee: "Refusée",
  envoyee: "Envoyée",
  ouverte: "Ouverte",
  demande_deposee: "Demande déposée",
  expiree: "Expirée",
};

export const metadata = { title: "Inscriptions" };

export default async function InscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string; fiche?: string }>;
}) {
  const { staff } = await requireStaffPage();
  const matrix = await loadPermissionMatrix();
  if (!roleAllows(staff.role, "review_signups", matrix)) {
    return (
      <div>
        <PageEyebrow>Clients</PageEyebrow>
        <PageTitle title="Inscriptions" subtitle="Réservé aux administrateurs. Le droit peut être ouvert au rôle manager." />
      </div>
    );
  }
  const params = await searchParams;
  const queue = await listSignupQueue(params.statut || null);
  const fiche = params.fiche ? await customerForInvitation(params.fiche) : null;
  const filters = ["", "en_attente", "a_completer", "brouillon", "validee", "refusee"];

  return (
    <div className="space-y-8">
      <div>
        <PageEyebrow>Clients</PageEyebrow>
        <PageTitle
          title="Inscriptions"
          subtitle="Chaque demande reste en file jusqu’au clic. Rien n’est rattaché tout seul."
          actions={
            <Link href="/admin/inscriptions/parrainages" className="text-sm font-semibold underline">
              Parrainages
            </Link>
          }
        />
      </div>
      {!queue.ready ? (
        <p className="rounded-2xl bg-[var(--admin-peach)] px-4 py-3 text-sm font-semibold">
          La migration des inscriptions n’est pas encore appliquée.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {filters.map((status) => (
              <Link
                key={status || "toutes"}
                href={status ? `/admin/inscriptions?statut=${status}` : "/admin/inscriptions"}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                  (params.statut || "") === status ? "bg-[var(--admin-navy)] text-white" : "bg-white ring-1 ring-[var(--border)]"
                }`}
              >
                {status ? LABELS[status] : "Toutes"}
              </Link>
            ))}
          </div>
          <ul className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-white">
            {queue.rows.length === 0 ? <li className="px-4 py-6 text-sm text-muted">Aucune demande.</li> : null}
            {queue.rows.map((row) => (
              <li key={row.id}>
                <Link href={`/admin/inscriptions/${row.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--surface-2)]">
                  <span>
                    <span className="font-semibold text-[var(--admin-navy)]">
                      {row.first_name} {row.last_name}
                    </span>
                    <span className="mt-0.5 block text-sm text-muted">
                      {row.email}
                      {row.invited_by_staff ? " · Invitée par l’admin" : ""}
                      {row.referral_code ? ` · Parrain ${row.referral_code}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold">{LABELS[row.status] || row.status}</span>
                </Link>
              </li>
            ))}
          </ul>
          <SignupInviteForm
            admin={staff.role === "admin"}
            autoValidate={queue.autoValidate}
            preset={
              fiche
                ? {
                    id: fiche.id,
                    firstName: fiche.first_name,
                    lastName: fiche.last_name,
                    phone: fiche.phone || "",
                    email: fiche.email || "",
                  }
                : null
            }
          />
          <section>
            <h2 className="mb-3 font-semibold text-[var(--admin-navy)]">Invitations</h2>
            <ul className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-white">
              {queue.invitations.length === 0 ? <li className="px-4 py-4 text-sm text-muted">Aucune invitation.</li> : null}
              {queue.invitations.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span>
                    {row.first_name} {row.last_name}
                    <span className="block text-muted">{row.phone}</span>
                  </span>
                  <span className="font-semibold">{LABELS[row.shown] || row.shown}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
