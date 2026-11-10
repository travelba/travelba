import { redirect } from "next/navigation";
import { ExpensePresetSettingsForm } from "@/components/admin/ExpensePresetSettingsForm";
import { requireStaffPage } from "@/lib/crm/auth";
import { DEFAULT_EXPENSE_PRESETS } from "@/lib/crm/expense-presets";
import { loadExpensePresets } from "@/lib/crm/expense-presets-db";
import { createServiceClient } from "@/lib/supabase/admin";

export const metadata = { title: "Dépenses types" };

export default async function DepensesReglagesPage() {
  const { staff } = await requireStaffPage();
  if (staff.role !== "admin") redirect("/admin/reglages/whatsapp");

  let presets = [...DEFAULT_EXPENSE_PRESETS];
  let ready = false;
  try {
    const admin = createServiceClient();
    const loaded = await loadExpensePresets(admin);
    presets = loaded.presets;
    ready = loaded.source === "table";
  } catch {
    ready = false;
  }

  return (
    <div>
      <h2 className="mt-6 font-display text-lg font-bold text-[var(--admin-navy)]">Dépenses types</h2>
      <p className="mt-1 max-w-xl text-sm text-muted">
        Un clic sur le dossier ajoute la dépense, quantité 1, comme le formulaire. Le libellé et le montant se modifient
        ensuite sur la ligne. Les frais de billeterie automatiques (25 € par voyageur dès qu’il y a un vol) restent à
        part. Un raccourci coché « déjà couvert » ne s’ajoute pas tant que cette ligne automatique est sur le dossier.
      </p>
      {ready ? (
        <ExpensePresetSettingsForm presets={presets} />
      ) : (
        <p className="mt-4 max-w-xl text-sm text-[var(--admin-navy)]">
          Le réglage n’est pas encore en place. Les dossiers proposent en attendant Frais billetterie 25 €, Frais
          billetterie train 10 € et Frais transfert 10 €.
        </p>
      )}
    </div>
  );
}
