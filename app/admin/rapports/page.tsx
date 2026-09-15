import { requireStaffPage } from "@/lib/crm/auth";

export default async function ReportsPage() {
  const { supabase } = await requireStaffPage();
  const [{ data: transactions }, { count: customers }, { count: activeBookings }, { count: openRequests }] = await Promise.all([
    supabase.from("crm_transactions").select("direction,amount,currency,status").eq("status", "posted"),
    supabase.from("crm_customers").select("id", { count: "exact", head: true }),
    supabase.from("crm_bookings").select("id", { count: "exact", head: true }).in("status", ["confirmed", "travelling"]),
    supabase.from("crm_service_requests").select("id", { count: "exact", head: true }).in("status", ["open", "in_progress", "waiting_customer"]),
  ]);
  const eur = (transactions || []).filter((row) => row.currency === "EUR");
  const credits = eur.filter((row) => row.direction === "credit").reduce((sum, row) => sum + Number(row.amount), 0);
  const debits = eur.filter((row) => row.direction === "debit").reduce((sum, row) => sum + Number(row.amount), 0);
  const cards = [
    ["Clients", customers || 0],
    ["Voyages actifs", activeBookings || 0],
    ["Demandes ouvertes", openRequests || 0],
    ["Encaissements EUR", credits.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })],
    ["Ventes engagées EUR", debits.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })],
  ];
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="font-display text-3xl font-extrabold text-[var(--admin-navy)]">Rapports</h1><p className="text-sm text-muted">Indicateurs opérationnels calculés sur les écritures comptabilisées.</p></div><form action="/api/admin/reports/export" method="get"><button className="admin-af-btn rounded-full px-4 py-2.5 text-sm">Exporter le grand livre CSV</button></form></header>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{cards.map(([label, value]) => <div key={String(label)} className="admin-af-card p-5"><p className="text-sm text-muted">{label}</p><p className="mt-1 font-display text-3xl font-extrabold text-[var(--admin-navy)]">{value}</p></div>)}</section>
      <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Les montants sont ventilés par devise : aucun taux de change implicite n’est appliqué.</p>
    </div>
  );
}
