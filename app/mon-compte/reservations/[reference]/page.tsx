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
import {
  ConciergeBanner,
  PageEyebrow,
  StatusChip,
  bookingStatusTone,
} from "@/components/crm/ui";

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
    supabase.from("crm_booking_items").select("*").eq("booking_id", b.id).order("sort_order"),
    supabase.from("crm_booking_travelers").select("*").eq("booking_id", b.id),
    supabase
      .from("crm_booking_documents")
      .select("*")
      .eq("booking_id", b.id)
      .eq("visible_to_client", true),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/mon-compte/reservations"
          className="text-sm font-semibold text-muted hover:text-[var(--admin-navy)]"
        >
          ← Mes réservations
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <PageEyebrow>Dossier {b.reference}</PageEyebrow>
            <h1 className="mt-2 font-display text-3xl font-extrabold text-[var(--admin-navy)]">
              {b.destination || b.title}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {b.title} · {formatDateFr(b.start_date)} → {formatDateFr(b.end_date)}
            </p>
          </div>
          <div className="text-right">
            <StatusChip tone={bookingStatusTone(b.status)}>
              {BOOKING_STATUS_LABELS[b.status]}
            </StatusChip>
            <p className="mt-3 font-display text-2xl font-extrabold text-[var(--admin-navy)]">
              {formatMoney(Number(b.total_amount), b.currency)}
            </p>
          </div>
        </div>
      </div>

      {b.notes_client ? (
        <p className="admin-af-card rounded-2xl p-5 text-sm leading-relaxed">{b.notes_client}</p>
      ) : null}

      <section className="admin-af-card rounded-2xl p-5">
        <h2 className="font-display text-xl font-bold text-[var(--admin-navy)]">Prestations</h2>
        <ul className="mt-4 divide-y divide-border">
          {((items || []) as CrmBookingItem[]).map((item) => (
            <li key={item.id} className="flex justify-between gap-3 py-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">
                  {BOOKING_ITEM_LABELS[item.kind as BookingItemKind] || item.kind}
                </p>
                <p className="font-medium text-[var(--admin-navy)]">{item.title}</p>
                <p className="text-xs text-muted">
                  {[item.supplier, item.confirmation_ref].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              <p className="font-semibold text-[var(--admin-navy)]">
                {item.amount != null ? formatMoney(Number(item.amount), b.currency) : "—"}
              </p>
            </li>
          ))}
          {!items?.length ? (
            <li className="py-4 text-sm text-muted">
              Détail des prestations en préparation par votre conciergerie.
            </li>
          ) : null}
        </ul>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="admin-af-card rounded-2xl p-5">
          <h2 className="font-display text-xl font-bold text-[var(--admin-navy)]">Voyageurs</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {((travelers || []) as CrmBookingTraveler[]).map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between rounded-xl bg-[var(--admin-sky)]/40 px-3 py-2"
              >
                <span className="font-medium">
                  {[t.first_name, t.last_name].filter(Boolean).join(" ") || "Voyageur"}
                </span>
                {t.is_account_holder ? (
                  <span className="text-[11px] font-semibold uppercase text-muted">
                    Titulaire
                  </span>
                ) : null}
              </li>
            ))}
            {!travelers?.length ? (
              <li className="text-muted">Voyageurs à confirmer</li>
            ) : null}
          </ul>
        </section>

        <section className="admin-af-card rounded-2xl p-5">
          <h2 className="font-display text-xl font-bold text-[var(--admin-navy)]">Documents</h2>
          <ul className="mt-3 space-y-2">
            {((docs || []) as CrmBookingDocument[]).map((d) => (
              <li key={d.id}>
                <a
                  className="inline-flex rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--admin-navy)] hover:bg-[var(--admin-sky)]"
                  href={`/api/files?path=${encodeURIComponent(d.storage_path)}`}
                >
                  {d.file_name || d.kind}
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
      </div>

      <ConciergeBanner />
    </div>
  );
}
