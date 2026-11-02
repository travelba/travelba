import { ApiKeysDesk } from "@/components/admin/ApiKeysDesk";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireAdminPage } from "@/lib/crm/auth";
import { listMcpApiKeys } from "@/lib/crm/mcp-api-key-store";
import { listColleagues } from "@/lib/crm/staff-directory";
import { isAgencyRole } from "@/lib/crm/agency-access";

export const metadata = { title: "Clés API" };

export default async function AdminApiKeysPage() {
  const { staff } = await requireAdminPage();
  if (staff.role !== "admin") {
    return (
      <div>
        <PageEyebrow>Espace agence</PageEyebrow>
        <PageTitle title="Clés API" subtitle="Réservé aux administrateurs." />
      </div>
    );
  }

  let keys = null as Awaited<ReturnType<typeof listMcpApiKeys>> | null;
  let members: Awaited<ReturnType<typeof listColleagues>> = [];
  try {
    [keys, members] = await Promise.all([listMcpApiKeys(), listColleagues()]);
  } catch {
    console.error("[admin/cles] lecture");
  }

  const selectable = members.filter((member) => member.active && isAgencyRole(member.role));

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle
        title="Clés API"
        subtitle="Une clé par personne, pour brancher son assistant. Le jeton partagé reste accepté."
      />
      {keys ? (
        <ApiKeysDesk
          keys={keys.map((key) => ({
            id: key.id,
            label: key.label,
            prefix: key.prefix,
            staffName: key.staffName,
            staffRole: key.staffRole,
            createdAt: key.createdAt,
            lastUsedAt: key.lastUsedAt,
            revokedAt: key.revokedAt,
            expiresAt: key.expiresAt,
          }))}
          members={selectable.map((member) => ({
            id: member.id,
            fullName: member.fullName,
            email: member.email,
            role: member.role,
          }))}
        />
      ) : (
        <p className="mt-6 rounded-2xl bg-[var(--admin-peach)] px-4 py-3 text-sm font-semibold text-[var(--admin-navy)]">
          Impossible de charger les clés. Réessayez.
        </p>
      )}
    </div>
  );
}
