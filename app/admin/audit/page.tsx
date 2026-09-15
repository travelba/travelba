import { requireStaffPage } from "@/lib/crm/auth";

export default async function AuditPage() {
  const { supabase } = await requireStaffPage("admin");
  const { data } = await supabase
    .from("crm_audit_events")
    .select("id,entity_type,entity_id,action,metadata,created_at,crm_staff(full_name)")
    .order("created_at", { ascending: false })
    .limit(250);
  return (
    <div className="space-y-6">
      <header><h1 className="font-display text-3xl font-extrabold text-[var(--admin-navy)]">Journal d’audit</h1><p className="text-sm text-muted">Actions sensibles, append-only, classées de la plus récente à la plus ancienne.</p></header>
      <div className="admin-af-card overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted"><tr><th className="p-3">Date</th><th className="p-3">Agent</th><th className="p-3">Action</th><th className="p-3">Objet</th><th className="p-3">Détails</th></tr></thead>
          <tbody className="divide-y divide-border">{(data || []).map((event) => { const actor = Array.isArray(event.crm_staff) ? event.crm_staff[0] : event.crm_staff; return <tr key={event.id}><td className="p-3">{new Date(event.created_at).toLocaleString("fr-FR")}</td><td className="p-3">{actor?.full_name || "Système/client"}</td><td className="p-3 font-semibold">{event.action}</td><td className="p-3">{event.entity_type} {event.entity_id || ""}</td><td className="max-w-64 truncate p-3 text-xs text-muted">{JSON.stringify(event.metadata)}</td></tr>; })}</tbody>
        </table>
      </div>
    </div>
  );
}
