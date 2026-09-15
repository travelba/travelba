import { requireStaffPage } from "@/lib/crm/auth";
import { TeamManager } from "@/components/admin/TeamManager";

export default async function TeamPage() {
  const { supabase, staff } = await requireStaffPage("admin");
  const { data } = await supabase.from("crm_staff").select("id,full_name,role,active,permissions").order("full_name");
  return (
    <div className="space-y-6">
      <header><h1 className="font-display text-3xl font-extrabold text-[var(--admin-navy)]">Équipe et accès</h1><p className="text-sm text-muted">Invitations, rôles et activation des comptes agence.</p></header>
      <TeamManager initialStaff={(data || []) as never[]} canAdmin={staff.role === "admin"} />
    </div>
  );
}
