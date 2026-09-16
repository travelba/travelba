import { requireStaffPage } from "@/lib/crm/auth";
import { OperationsManager } from "@/components/admin/OperationsManager";

export default async function AdminNotificationsPage() {
  const { supabase } = await requireStaffPage("operations");
  const [{ data: notifications }, { data: customers }, { data: bookings }] = await Promise.all([
    supabase.from("crm_notifications").select("*").order("created_at", { ascending: false }).limit(250),
    supabase.from("crm_customers").select("id,first_name,last_name").order("last_name"),
    supabase.from("crm_bookings").select("id,reference,title").order("created_at", { ascending: false }),
  ]);
  return <div className="space-y-6"><header><h1 className="font-display text-3xl font-extrabold text-[var(--admin-navy)]">Notifications clients</h1><p className="text-sm text-muted">Alertes visibles dans le portail. L’envoi e-mail/WhatsApp reste conditionné aux préférences et intégrations configurées.</p></header><OperationsManager resource="notifications" initialItems={(notifications || []) as never[]} fields={[
    { name: "title", label: "Titre", required: true },
    { name: "customer_id", label: "Client", type: "select", required: true, options: [{ value: "", label: "Choisir…" }, ...(customers || []).map((row) => ({ value: row.id, label: `${row.first_name} ${row.last_name}` }))] },
    { name: "booking_id", label: "Dossier", type: "select", options: [{ value: "", label: "Aucun" }, ...(bookings || []).map((row) => ({ value: row.id, label: `${row.reference} · ${row.title}` }))] },
    { name: "kind", label: "Type", type: "select", options: [{ value: "agency", label: "Message agence" }, { value: "travel", label: "Voyage" }, { value: "payment", label: "Paiement" }, { value: "document", label: "Document" }] },
    { name: "message", label: "Message", type: "textarea", required: true },
    { name: "action_url", label: "Lien interne" },
  ]} /></div>;
}
