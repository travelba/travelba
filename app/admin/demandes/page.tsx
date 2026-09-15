import { requireStaffPage } from "@/lib/crm/auth";
import { OperationsManager } from "@/components/admin/OperationsManager";

export default async function AdminRequestsPage() {
  const { supabase } = await requireStaffPage("operations");
  const [{ data }, { data: staff }] = await Promise.all([
    supabase.from("crm_service_requests").select("*").order("created_at", { ascending: false }),
    supabase.from("crm_staff").select("id,full_name").eq("active", true).order("full_name"),
  ]);
  return (
    <div className="space-y-6">
      <header><h1 className="font-display text-3xl font-extrabold text-[var(--admin-navy)]">Demandes clients</h1><p className="text-sm text-muted">Qualification, assignation et réponse depuis une seule file.</p></header>
      <OperationsManager resource="requests" allowCreate={false} initialItems={(data || []) as never[]} fields={[
        { name: "subject", label: "Demande" },
        { name: "category", label: "Catégorie" },
        { name: "message", label: "Message", type: "textarea" },
        { name: "priority", label: "Priorité", type: "select", options: [{ value: "normal", label: "Normale" }, { value: "high", label: "Haute" }, { value: "urgent", label: "Urgente" }, { value: "low", label: "Basse" }] },
        { name: "assigned_to", label: "Assignée à", type: "select", options: [{ value: "", label: "Non assignée" }, ...(staff || []).map((member) => ({ value: member.id, label: member.full_name }))] },
        { name: "status", label: "Statut", type: "select", options: [{ value: "open", label: "Ouverte" }, { value: "in_progress", label: "En cours" }, { value: "waiting_customer", label: "Attente client" }, { value: "resolved", label: "Résolue" }, { value: "closed", label: "Fermée" }] },
        { name: "staff_response", label: "Réponse au client", type: "textarea" },
      ]} />
    </div>
  );
}
