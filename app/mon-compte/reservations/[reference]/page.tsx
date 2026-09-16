import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import {
  BOOKING_ITEM_LABELS,
  BOOKING_STATUS_LABELS,
  type BookingItemKind,
  type CrmBooking,
  type CrmBookingDocument,
  type CrmBookingItem,
  type CrmBookingTraveler,
} from "@/lib/crm/types";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import { ConciergeBanner, StatusChip, bookingStatusTone } from "@/components/crm/ui";

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

  const [{ data: items }, { data: travelers }, { data: docs }] = await Promise.all([
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
  ]);

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

      <Link
        href={`/mon-compte/reservations/${b.reference}/itineraire`}
        className="inline-flex w-full items-center justify-center rounded-full bg-[var(--aura-blue)] px-5 py-3 text-sm font-bold text-white"
      >
        Ouvrir l&apos;itinéraire détaillé →
      </Link>

      {b.notes_client ? (
        <p className="aura-card rounded-[1.25rem] bg-white p-4 text-sm leading-relaxed text-[var(--admin-navy)]">
          {b.notes_client}
        </p>
      ) : null}

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
          Voyageurs
        </h2>
        <ul className="space-y-2">
          {((travelers || []) as CrmBookingTraveler[]).map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between rounded-2xl bg-slate-50 px-3.5 py-3 text-sm"
            >
              <span className="font-semibold text-[var(--admin-navy)]">
                {[t.first_name, t.last_name].filter(Boolean).join(" ") || "Voyageur"}
              </span>
              {t.is_account_holder ? (
                <span className="rounded-full bg-[var(--aura-blue-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--aura-blue)]">
                  Titulaire
                </span>
              ) : null}
            </li>
          ))}
          {!travelers?.length ? (
            <li className="text-sm text-muted">Voyageurs à confirmer</li>
          ) : null}
        </ul>
      </section>

      <section className="aura-card space-y-3 rounded-[1.35rem] bg-white p-4">
        <h2 className="font-display text-base font-bold text-[var(--admin-navy)]">
          Documents
        </h2>
        <ul className="space-y-2">
          {((docs || []) as CrmBookingDocument[]).map((d) => (
            <li key={d.id}>
              <a
                className="inline-flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-semibold text-[var(--admin-navy)]"
                href={`/api/client/files/booking/${d.id}`}
              >
                <span>{d.file_name || d.kind}</span>
                <span className="text-[var(--aura-blue)]">Télécharger</span>
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
