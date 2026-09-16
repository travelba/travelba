import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";

export default async function DocumentsVaultPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion?next=/mon-compte/documents");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion?error=account");

  const [{ data: identity }, { data: bookingDocs }, { data: invoices }] = await Promise.all([
    supabase.from("crm_travel_documents").select("id,doc_type,file_name,expires_on,storage_path").eq("customer_id", customer.id),
    supabase.from("crm_booking_documents").select("id,kind,file_name,storage_path,crm_bookings!inner(reference,title,customer_id,status)").eq("crm_bookings.customer_id", customer.id).neq("crm_bookings.status", "draft").eq("visible_to_client", true),
    supabase.from("crm_invoices").select("id,number,kind,issued_on,amount,currency,storage_path").eq("customer_id", customer.id).neq("status", "draft").order("issued_on", { ascending: false }),
  ]);

  const sections = [
    { title: "Identité", kind: "identity", rows: (identity || []).map((item) => ({ id: item.id, title: item.file_name || item.doc_type, detail: item.expires_on ? `Expire le ${new Date(item.expires_on).toLocaleDateString("fr-FR")}` : "Sans date d’expiration", downloadable: Boolean(item.storage_path) })) },
    { title: "Billets, vouchers et contrats", kind: "booking", rows: (bookingDocs || []).map((item) => { const booking = Array.isArray(item.crm_bookings) ? item.crm_bookings[0] : item.crm_bookings; return { id: item.id, title: item.file_name || item.kind, detail: booking ? `${booking.reference} · ${booking.title}` : item.kind, downloadable: Boolean(item.storage_path) }; }) },
    { title: "Factures, reçus et relevés", kind: "invoice", rows: (invoices || []).map((item) => ({ id: item.id, title: `${item.number} · ${item.kind}`, detail: `${new Date(item.issued_on).toLocaleDateString("fr-FR")} · ${Number(item.amount).toLocaleString("fr-FR", { style: "currency", currency: item.currency })}`, downloadable: true })) },
  ];

  return (
    <div className="space-y-6">
      <header><p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--aura-blue)]">Coffre privé</p><h1 className="font-display text-3xl font-extrabold text-[var(--admin-navy)]">Mes documents</h1></header>
      {sections.map((section) => (
        <section key={section.title} className="account-card overflow-hidden">
          <h2 className="border-b border-border p-5 font-display text-lg font-bold">{section.title}</h2>
          <div className="divide-y divide-border">
            {section.rows.length ? section.rows.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 p-4">
                <div><p className="font-semibold">{row.title}</p><p className="text-xs text-muted">{row.detail}</p></div>
                {row.downloadable ? <a href={`/api/client/files/${section.kind}/${row.id}`} className="rounded-full border border-border px-3 py-1.5 text-xs font-bold">Télécharger</a> : <span className="text-xs text-muted">Fichier non joint</span>}
              </div>
            )) : <p className="p-5 text-sm text-muted">Aucun document.</p>}
          </div>
        </section>
      ))}
    </div>
  );
}
