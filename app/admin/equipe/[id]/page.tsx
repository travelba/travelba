import Link from "next/link";
import { notFound } from "next/navigation";
import { AgencyHistoryPanel } from "@/components/admin/AgencyHistoryPanel";
import { StaffDeparture } from "@/components/admin/StaffDeparture";
import { StaffSessions } from "@/components/admin/StaffSessions";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireAdminPage } from "@/lib/crm/auth";
import { isUuid } from "@/lib/crm/ids";
import { staffRoleLabel, type StaffRole } from "@/lib/crm/staff-team";
import { createServiceClient } from "@/lib/supabase/admin";

export const metadata = { title: "Collègue" };

export default async function ColleaguePage({ params }: { params: Promise<{ id: string }> }) {
  const { staff } = await requireAdminPage();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const admin = createServiceClient({ allowPreview: true });
  const first = await admin.from("crm_staff").select("id, full_name, role, active, email").eq("id", id).maybeSingle();
  const data = first.error
    ? (await admin.from("crm_staff").select("id, full_name, role").eq("id", id).maybeSingle()).data
    : first.data;
  if (!data) notFound();
  const colleague = data as {
    id: string;
    full_name: string | null;
    role: StaffRole;
    active?: boolean;
    email?: string | null;
  };
  const name = colleague.full_name || "Collègue";
  const self = colleague.id === staff.id;
  return (
    <div>
      <PageEyebrow>Équipe</PageEyebrow>
      <PageTitle
        title={name}
        subtitle={`${staffRoleLabel(colleague.role)}${colleague.active === false ? " · accès coupé" : ""}${self ? " · vous" : ""}`}
      />
      <p className="mt-2 text-sm text-muted">{colleague.email || ""}</p>
      <p className="mt-4">
        <Link href="/admin/equipe" className="text-sm font-semibold text-[var(--admin-navy)] underline">
          Retour à l’équipe
        </Link>
      </p>
      <div className="mt-6">
        <AgencyHistoryPanel entity="acteur" entityId={colleague.id} title={`Ce que ${name} a fait`} />
      </div>
      <StaffSessions staffId={colleague.id} />
      {colleague.role !== "partner" && !self ? (
        <StaffDeparture staffId={colleague.id} name={name} active={colleague.active !== false} />
      ) : null}
      <div className="mt-6">
        <AgencyHistoryPanel entity="user" entityId={colleague.id} title={`Ce qui a été fait sur l’accès de ${name}`} />
      </div>
    </div>
  );
}
