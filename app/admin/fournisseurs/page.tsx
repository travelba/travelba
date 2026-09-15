import { requireStaffPage } from "@/lib/crm/auth";
import { OperationsManager } from "@/components/admin/OperationsManager";

export default async function SuppliersPage() {
  const { supabase } = await requireStaffPage();
  const { data } = await supabase.from("crm_suppliers").select("*").order("name");
  return (
    <div className="space-y-6">
      <header><h1 className="font-display text-3xl font-extrabold text-[var(--admin-navy)]">Fournisseurs</h1><p className="text-sm text-muted">Contacts, références de compte et notes opérationnelles.</p></header>
      <OperationsManager resource="suppliers" initialItems={(data || []) as never[]} fields={[
        { name: "name", label: "Nom", required: true },
        { name: "kind", label: "Type", type: "select", options: [{ value: "hotel", label: "Hôtel" }, { value: "airline", label: "Compagnie" }, { value: "dmc", label: "DMC" }, { value: "insurance", label: "Assurance" }, { value: "other", label: "Autre" }] },
        { name: "contact_name", label: "Contact" },
        { name: "email", label: "E-mail" },
        { name: "phone", label: "Téléphone" },
        { name: "website", label: "Site web" },
        { name: "account_reference", label: "Référence fournisseur" },
        { name: "notes", label: "Notes", type: "textarea" },
        { name: "active", label: "Actif", type: "checkbox" },
      ]} />
    </div>
  );
}
