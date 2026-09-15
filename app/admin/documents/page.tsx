import { requireStaffPage } from "@/lib/crm/auth";
import { DocumentVisibilityButton } from "@/components/admin/DocumentVisibilityButton";

export default async function AdminDocumentsPage() {
  const { supabase } = await requireStaffPage("bookings");
  const [{ data: identity }, { data: bookingDocs }] = await Promise.all([
    supabase.from("crm_travel_documents").select("id,doc_type,file_name,expires_on,storage_path,crm_customers(first_name,last_name)").order("expires_on", { ascending: true, nullsFirst: false }),
    supabase.from("crm_booking_documents").select("id,booking_id,kind,file_name,visible_to_client,storage_path,crm_bookings(reference,title)").order("created_at", { ascending: false }),
  ]);
  return (
    <div className="space-y-8">
      <header><h1 className="font-display text-3xl font-extrabold text-[var(--admin-navy)]">Documents</h1><p className="text-sm text-muted">Coffre global, visibilité client et suivi des expirations.</p></header>
      <section className="admin-af-card overflow-hidden">
        <h2 className="border-b border-border p-5 font-display text-xl font-bold">Documents d’identité</h2>
        <div className="divide-y divide-border">
          {(identity || []).map((document) => { const customer = Array.isArray(document.crm_customers) ? document.crm_customers[0] : document.crm_customers; return <div key={document.id} className="flex items-center justify-between gap-4 p-4"><div><p className="font-semibold">{document.file_name || document.doc_type}</p><p className="text-xs text-muted">{customer?.first_name} {customer?.last_name}{document.expires_on ? ` · expire le ${document.expires_on}` : ""}</p></div>{document.storage_path ? <a href={`/api/admin/files/identity/${document.id}`} className="rounded-full border border-border px-3 py-1.5 text-xs font-bold">Prévisualiser</a> : <span className="text-xs text-muted">Sans fichier</span>}</div>; })}
          {!identity?.length ? <p className="p-5 text-sm text-muted">Aucun document.</p> : null}
        </div>
      </section>
      <section className="admin-af-card overflow-hidden">
        <h2 className="border-b border-border p-5 font-display text-xl font-bold">Billets, vouchers et contrats</h2>
        <div className="divide-y divide-border">
          {(bookingDocs || []).map((document) => { const booking = Array.isArray(document.crm_bookings) ? document.crm_bookings[0] : document.crm_bookings; return <div key={document.id} className="flex flex-wrap items-center justify-between gap-4 p-4"><div><p className="font-semibold">{document.file_name || document.kind}</p><p className="text-xs text-muted">{booking?.reference} · {booking?.title} · {document.visible_to_client ? "publié au client" : "interne"}</p></div><div className="flex gap-2"><a href={`/api/admin/files/booking/${document.id}`} className="rounded-full border border-border px-3 py-1.5 text-xs font-bold">Prévisualiser</a><DocumentVisibilityButton bookingId={document.booking_id} documentId={document.id} initialVisible={document.visible_to_client} /></div></div>; })}
          {!bookingDocs?.length ? <p className="p-5 text-sm text-muted">Aucun document.</p> : null}
        </div>
      </section>
    </div>
  );
}
