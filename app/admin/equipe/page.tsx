import { TeamDesk } from "@/components/admin/TeamDesk";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireAdminPage } from "@/lib/crm/auth";
import { listColleagues } from "@/lib/crm/staff-directory";

export default async function AdminTeamPage() {
  const { staff } = await requireAdminPage();
  let colleagues = null;
  try {
    colleagues = await listColleagues();
  } catch {
    console.error("[admin/equipe] lecture");
  }

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle
        title="Équipe"
        subtitle="Ajoutez un collègue, limitez son rôle entre agent et administrateur, ou retirez un agent. Les administrateurs en place ne sont pas retirés."
      />
      {colleagues ? (
        <TeamDesk colleagues={colleagues} currentId={staff.id} />
      ) : (
        <p className="mt-6 rounded-2xl bg-[var(--admin-peach)] px-4 py-3 text-sm font-semibold text-[var(--admin-navy)]">
          Impossible de charger l’équipe. Réessayez.
        </p>
      )}
    </div>
  );
}
