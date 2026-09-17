import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import {
  BOOKING_ITEM_LABELS,
  BOOKING_STATUS_LABELS,
  DOC_TYPE_LABELS,
  type BookingItemKind,
  type CrmBooking,
  type CrmBookingDocument,
  type CrmBookingItem,
  type CrmBookingTraveler,
  type CrmTravelDocument,
} from "@/lib/crm/types";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import { ConciergeBanner, StatusChip, bookingStatusTone } from "@/components/crm/ui";
import {
  personDocumentsForTraveler,
  primaryIdentityDoc,
  travelerDisplayName,
} from "@/lib/crm/trip-documents";

type Props = { params: Promise<{ reference: string }> };

export default async function ReservationDetailPage({ params }: Props) {
  const { reference } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");

  const { data: booking } = await supabase
    .from("crm_bookings")
    .select("*")
    .eq("customer_id", customer.id)
    .eq("reference", reference)
    .maybeSingle();
  if (!booking) notFound();
  const b = booking as CrmBooking;

  const [{ data: items }, { data: travelers }, { data: docs }, { data: identityDocs }] = await Promise.all([
    supabase
      .from("crm_booking_items")
      .select("*")
      .eq("booking_id", b.id)
      .order("sort_order"),
    supabase.from("crm_booking_travelers").select("*").eq("booking_id", b.id),
    supabase
      .from("crm_booking_documents")
      .select("*")
      .eq("booking_id", b.id)
      .eq("visible_to_client", true),
    supabase.from("crm_travel_documents").select("*").eq("customer_id", customer.id),
  ]);
  const allIdentity = (identityDocs || []) as CrmTravelDocument[];

  return (
    <div className="space-y-5">
      <Link
        href="/mon-compte/reservations"
        className="inline-flex text-sm font-semibold text-[var(--aura-blue)]"
      >
        ← Mes réservations
      </Link>

      <article className="relative min-h-[220px] overflow-hidden rounded-[1.5rem] bg-[var(--admin-navy)] text-white shadow-[0_16px_36px_rgba(11,31,58,0.25)]">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-50"
          style={{
            backgroundImage:
              "url(https://images.unsplash.com/photo-1506929562872-bb421503ef21?auto=format&fit=crop&w=1200&q=80)",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--admin-navy)] via-[var(--admin-navy)]/70 to-transparent" />
        <div className="relative space-y-3 p-5 pb-6 pt-10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <StatusChip tone={bookingStatusTone(b.status)}>
              {BOOKING_STATUS_LABELS[b.status]}
            </StatusChip>
            <span className="rounded-full bg-black/35 px-3 py-1 text-[11px] font-bold backdrop-blur">
              {b.reference}
            </span>
          </div>
          <h1 className="font-display text-[1.7rem] font-extrabold leading-tight">
            {b.destination || b.title}
          </h1>
          <p className="text-sm text-white/75">{b.title}</p>
          <p className="text-sm text-white/75">
            {formatDateFr(b.start_date)} — {formatDateFr(b.end_date)}
          </p>
          <p className="font-display text-2xl font-extrabold">
            {formatMoney(Number(b.total_amount), b.currency)}
          </p>
        </div>
      </article>

      {b.notes_client ? (
        <p className="aura-card rounded-[1.25rem] bg-white p-4 text-sm leading-relaxed text-[var(--admin-navy)]">
          {b.notes_client}
        </p>
      ) : null}

      <section className="aura-card space-y-3 rounded-[1.35rem] border-t-[3px] border-t-[var(--admin-gold)] bg-white p-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
            Voyageurs
          </p>
          <h2 className="mt-1 font-display text-base font-bold text-[var(--admin-navy)]">
            Pièces d’identité
          </h2>
          <p className="mt-1 text-sm text-muted">
            Les passeports se joignent une fois, sur le profil de chaque personne.
          </p>
        </div>
        <ul className="space-y-2">
          {((travelers || []) as CrmBookingTraveler[]).map((traveler) => {
            const doc = primaryIdentityDoc(
              personDocumentsForTraveler(allIdentity, traveler)
            );
            return (
              <li
                key={traveler.id}
                className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3.5 py-3"
              >
                <span className="text-sm font-semibold text-[var(--admin-navy)]">
                  {travelerDisplayName(traveler)}
                </span>
                <span className={`text-xs font-semibold ${doc ? "text-[var(--admin-navy)]" : "text-accent"}`}>
                  {doc
                    ? `${DOC_TYPE_LABELS[doc.doc_type]} ${doc.number || ""}`.trim()
                    : "À joindre"}
                </span>
              </li>
            );
          })}
        </ul>
        <Link
          href="/mon-compte/profil/documents"
          className="inline-flex rounded-full bg-[var(--admin-navy)] px-4 py-2 text-xs font-semibold text-white"
        >
          Gérer les pièces
        </Link>
      </section>

      <section className="aura-card space-y-3 rounded-[1.35rem] bg-white p-4">
        <h2 className="font-display text-base font-bold text-[var(--admin-navy)]">
          Prestations
        </h2>
        <ul className="space-y-2">
          {((items || []) as CrmBookingItem[]).map((item) => (
            <li
              key={item.id}
              className="flex items-start justify-between gap-3 rounded-2xl bg-slate-50 px-3.5 py-3"
            >
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--aura-blue)]">
                  {BOOKING_ITEM_LABELS[item.kind as BookingItemKind] || item.kind}
                </p>
                <p className="truncate text-sm font-semibold text-[var(--admin-navy)]">
                  {item.title}
                </p>
                <p className="truncate text-xs text-muted">
                  {[item.supplier, item.confirmation_ref].filter(Boolean).join(" · ") ||
                    "Confirmé TBA"}
                </p>
              </div>
              <p className="shrink-0 text-sm font-bold text-[var(--admin-navy)]">
                {item.amount != null ? formatMoney(Number(item.amount), b.currency) : "—"}
              </p>
            </li>
          ))}
          {!items?.length ? (
            <li className="rounded-2xl bg-slate-50 px-3.5 py-4 text-sm text-muted">
              Détail des prestations en préparation par votre conciergerie.
            </li>
          ) : null}
        </ul>
      </section>

      <section className="aura-card space-y-3 rounded-[1.35rem] bg-white p-4">
        <h2 className="font-display text-base font-bold text-[var(--admin-navy)]">
          Billets et vouchers
        </h2>
        <ul className="space-y-2">
          {((docs || []) as CrmBookingDocument[]).map((d) => (
            <li key={d.id}>
              <a
                className="inline-flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-semibold text-[var(--admin-navy)]"
                href={`/api/files?path=${encodeURIComponent(d.storage_path)}`}
              >
                <span>{d.file_name || d.kind}</span>
                <span className="text-[var(--aura-blue)]">PDF</span>
              </a>
            </li>
          ))}
          {!docs?.length ? (
            <li className="text-sm text-muted">
              Aucun document publié pour l&apos;instant.
            </li>
          ) : null}
        </ul>
      </section>

      <ConciergeBanner />
    </div>
  );
}
