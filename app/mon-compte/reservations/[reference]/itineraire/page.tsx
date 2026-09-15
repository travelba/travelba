import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import type { CrmBooking, CrmBookingItem } from "@/lib/crm/types";

type Props = { params: Promise<{ reference: string }> };

export default async function ItineraryPage({ params }: Props) {
  const { reference } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/connexion?next=/mon-compte/reservations/${encodeURIComponent(reference)}/itineraire`);
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion?error=account");
  const { data } = await supabase
    .from("crm_bookings")
    .select("*, crm_booking_items(*), crm_mtrip_publications(state,mobile_app_url,published_at)")
    .eq("reference", reference)
    .eq("customer_id", customer.id)
    .neq("status", "draft")
    .maybeSingle();
  if (!data) notFound();
  const booking = data as CrmBooking & {
    crm_booking_items: CrmBookingItem[];
    crm_mtrip_publications: { state: string; mobile_app_url: string | null; published_at: string | null }[];
  };
  const items = [...(booking.crm_booking_items || [])].sort((a, b) =>
    String(a.start_at || "").localeCompare(String(b.start_at || "")) || a.sort_order - b.sort_order
  );
  const publication = booking.crm_mtrip_publications?.[0];

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--aura-blue)]">{booking.reference}</p>
        <h1 className="font-display text-3xl font-extrabold text-[var(--admin-navy)]">Itinéraire · {booking.title}</h1>
      </header>
      {publication?.state === "published" && publication.mobile_app_url ? (
        <a href={publication.mobile_app_url} target="_blank" rel="noreferrer" className="block rounded-2xl bg-[var(--admin-navy)] p-4 text-center font-bold text-white">Ouvrir mon carnet de voyage mTrip</a>
      ) : (
        <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">Le carnet mTrip sera accessible après validation et publication par l’agence.</div>
      )}
      <section className="relative space-y-4 border-l-2 border-[var(--aura-blue-soft)] pl-5">
        {items.length ? items.map((item) => (
          <article key={item.id} className="account-card relative p-5">
            <span className="absolute -left-[30px] top-6 h-4 w-4 rounded-full border-4 border-white bg-[var(--aura-blue)]" />
            <p className="text-xs font-bold uppercase text-[var(--aura-blue)]">{item.kind}</p>
            <h2 className="font-display text-lg font-bold">{item.title}</h2>
            <p className="text-sm text-muted">{item.start_at ? new Date(item.start_at).toLocaleString("fr-FR") : "Horaire à confirmer"}{item.end_at ? ` → ${new Date(item.end_at).toLocaleString("fr-FR")}` : ""}</p>
            {item.supplier ? <p className="mt-2 text-sm">Fournisseur : {item.supplier}</p> : null}
            {item.confirmation_ref ? <p className="text-sm">Référence : {item.confirmation_ref}</p> : null}
          </article>
        )) : <p className="text-sm text-muted">L’itinéraire détaillé sera ajouté par votre conseiller.</p>}
      </section>
    </div>
  );
}
