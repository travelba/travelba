import { requireStaffPage } from "@/lib/crm/auth";
import { OperationsManager } from "@/components/admin/OperationsManager";
import { RefreshTasksButton } from "@/components/admin/RefreshTasksButton";

export default async function TasksPage() {
  const { supabase } = await requireStaffPage();
  const { data } = await supabase.from("crm_tasks").select("*").order("due_at", { ascending: true, nullsFirst: false });
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="font-display text-3xl font-extrabold text-[var(--admin-navy)]">Tâches et relances</h1><p className="text-sm text-muted">Paiements, documents manquants et suivi des départs.</p></div><RefreshTasksButton /></header>
      <OperationsManager resource="tasks" initialItems={(data || []) as never[]} fields={[
        { name: "title", label: "Tâche", required: true },
        { name: "description", label: "Détails", type: "textarea" },
        { name: "category", label: "Catégorie", type: "select", options: [{ value: "payment", label: "Paiement" }, { value: "document", label: "Document" }, { value: "departure", label: "Départ" }, { value: "other", label: "Autre" }] },
        { name: "priority", label: "Priorité", type: "select", options: [{ value: "normal", label: "Normale" }, { value: "high", label: "Haute" }, { value: "urgent", label: "Urgente" }, { value: "low", label: "Basse" }] },
        { name: "status", label: "Statut", type: "select", options: [{ value: "todo", label: "À faire" }, { value: "in_progress", label: "En cours" }, { value: "done", label: "Terminée" }, { value: "cancelled", label: "Annulée" }] },
        { name: "due_at", label: "Échéance", type: "datetime-local" },
      ]} />
    </div>
  );
}
