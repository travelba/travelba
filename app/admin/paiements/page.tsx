import Link from "next/link";
import { requireStaffPage } from "@/lib/crm/auth";
import { OperationsManager } from "@/components/admin/OperationsManager";

export default async function AdminPaymentsPage() {
  const { supabase } = await requireStaffPage("finance");
  const [{ data: schedules }, { data: invoices }, { data: customers }, { data: bookings }] = await Promise.all([
    supabase.from("crm_payment_schedules").select("*").order("due_on"),
    supabase.from("crm_invoices").select("*").order("issued_on", { ascending: false }),
    supabase.from("crm_customers").select("id,first_name,last_name").order("last_name"),
    supabase.from("crm_bookings").select("id,reference,title").order("created_at", { ascending: false }),
  ]);
  const customerOptions = [{ value: "", label: "Sélectionner" }, ...(customers || []).map((customer) => ({ value: customer.id, label: `${customer.first_name} ${customer.last_name}` }))];
  const bookingOptions = [{ value: "", label: "Aucun dossier" }, ...(bookings || []).map((booking) => ({ value: booking.id, label: `${booking.reference} · ${booking.title}` }))];
  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-extrabold text-[var(--admin-navy)]">Paiements et facturation</h1>
        <p className="text-sm text-muted">Échéanciers Stripe, encaissements, impayés et pièces comptables.</p>
        <div className="mt-3 flex gap-3 text-sm font-semibold"><Link href="/admin/transactions">Grand livre</Link><Link href="/admin/revolut">Rapprochement Revolut</Link></div>
      </header>
      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold">Échéances</h2>
        <OperationsManager resource="schedules" initialItems={(schedules || []) as never[]} fields={[
          { name: "label", label: "Libellé", required: true },
          { name: "customer_id", label: "Client", type: "select", required: true, options: customerOptions },
          { name: "booking_id", label: "Dossier", type: "select", options: bookingOptions },
          { name: "amount", label: "Montant", type: "number", required: true },
          { name: "currency", label: "Devise", type: "select", options: [{ value: "EUR", label: "EUR" }, { value: "USD", label: "USD" }, { value: "GBP", label: "GBP" }] },
          { name: "due_on", label: "Échéance", type: "date", required: true },
        ]} />
      </section>
      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold">Factures et reçus</h2>
        <OperationsManager resource="invoices" initialItems={(invoices || []) as never[]} fields={[
          { name: "number", label: "Numéro", required: true },
          { name: "customer_id", label: "Client", type: "select", required: true, options: customerOptions },
          { name: "booking_id", label: "Dossier", type: "select", options: bookingOptions },
          { name: "kind", label: "Type", type: "select", options: [{ value: "invoice", label: "Facture" }, { value: "receipt", label: "Reçu" }, { value: "credit_note", label: "Avoir" }, { value: "statement", label: "Relevé" }] },
          { name: "amount", label: "Montant", type: "number", required: true },
          { name: "currency", label: "Devise", type: "select", options: [{ value: "EUR", label: "EUR" }, { value: "USD", label: "USD" }] },
          { name: "issued_on", label: "Émise le", type: "date", required: true },
          { name: "due_on", label: "Échéance", type: "date" },
          { name: "status", label: "Statut", type: "select", options: [{ value: "draft", label: "Brouillon" }, { value: "issued", label: "Émise" }, { value: "paid", label: "Payée" }, { value: "void", label: "Annulée" }] },
        ]} />
      </section>
    </div>
  );
}
