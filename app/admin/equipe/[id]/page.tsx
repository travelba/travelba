import Link from "next/link";
import { notFound } from "next/navigation";
import { AgencyHistoryPanel } from "@/components/admin/AgencyHistoryPanel";
import { StaffSessions } from "@/components/admin/StaffSessions";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireAdminPage } from "@/lib/crm/auth";
import { isUuid } from "@/lib/crm/ids";
import { staffRoleLabel, type StaffRole } from "@/lib/crm/staff-team";
import { createServiceClient } from "@/lib/supabase/admin";

export const metadata = { title: "Collègue" };

export default async function ColleaguePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const admin = createServiceClient({ allowPreview: true });
  const { data } = await admin.from("crm_staff").select("id, full_name, role, active, email").eq("id", id).maybeSingle();
  if (!data) notFound();
  const colleague = data as {
    id: string;
    full_name: string | null;
    role: StaffRole;
    active?: boolean;
    email: string | null;
  };
  return (
    <div>
      <PageEyebrow>Équipe</PageEyebrow>
      <PageTitle
        title={colleague.full_name || "Collègue"}
        subtitle={`${staffRoleLabel(colleague.role)}${colleague.active === false ? " · désactivé" : ""}`}
      />
      <p className="mt-2 text-sm text-muted">{colleague.email || ""}</p>
      <p className="mt-4">
        <Link href="/admin/equipe" className="text-sm font-semibold text-[var(--admin-navy)] underline">
          Retour à l’équipe
        </Link>
      </p>
      <StaffSessions staffId={colleague.id} />
      <div className="mt-6">
        <AgencyHistoryPanel entity="user" entityId={colleague.id} title="Activité" />
      </div>
    </div>
  );
}
