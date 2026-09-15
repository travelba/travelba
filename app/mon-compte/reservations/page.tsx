import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { BOOKING_STATUS_LABELS, type CrmBooking } from "@/lib/crm/types";
import { formatDateFr, formatMoney, isUpcomingBooking } from "@/lib/crm/money";
import {
  ConciergeBanner,
  EmptyState,
  StatusChip,
  bookingStatusTone,
} from "@/components/crm/ui";
import { siteConfig } from "@/lib/site";

function daysUntil(date: string | null) {
  if (!date) return null;
  const start = new Date(`${date}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.ceil((start.getTime() - today.getTime()) / 86_400_000);
}

const HERO_IMAGES = [
  "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=1200&q=80",
];

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");

  const { data } = await supabase
    .from("crm_bookings")
    .select("*")
    .eq("customer_id", customer.id)
    .order("start_date", { ascending: false, nullsFirst: false });

  const all = (data || []) as CrmBooking[];
  const upcoming = all.filter(
    (b) => isUpcomingBooking(b.end_date) && b.status !== "cancelled"
  );
  const past = all.filter(
    (b) => !isUpcomingBooking(b.end_date) || b.status === "completed"
  );
  const showPast = tab === "passes";
  const list = showPast ? past : upcoming;
  const whatsappHref = `https://wa.me/${siteConfig.whatsappNumber}`;

  return (
    <div className="space-y-5">
      <aside className="flex items-center justify-between gap-3 rounded-[1.25rem] bg-[var(--aura-navy-card)] p-4 text-white shadow-lg">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--aura-blue)] text-sm font-bold">
            M
          </span>
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-bold">
              Majordome {siteConfig.shortName}
            </p>
            <p className="truncate text-[11px] text-white/65">
              Votre majordome voyage dédié (24/7)
            </p>
          </div>
        </div>
        <a
          href={whatsappHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center rounded-full bg-[var(--aura-blue)] px-3.5 py-2 text-xs font-bold text-white"
        >
          Contacter
        </a>
      </aside>

      <div className="flex rounded-full bg-slate-200/70 p-1">
        <Link
          href="/mon-compte/reservations"
          className={`flex-1 rounded-full px-3 py-2.5 text-center text-sm font-bold transition ${
            !showPast
              ? "bg-white text-[var(--admin-navy)] shadow-sm"
              : "text-slate-600"
          }`}
        >
          À venir ({upcoming.length})
        </Link>
        <Link
          href="/mon-compte/reservations?tab=passes"
          className={`flex-1 rounded-full px-3 py-2.5 text-center text-sm font-bold transition ${
            showPast
              ? "bg-white text-[var(--admin-navy)] shadow-sm"
              : "text-slate-600"
          }`}
        >
          Passées ({past.length})
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {["Tout afficher", "Vols", "Hôtels", "Expéditions"].map((label, i) => (
          <span
            key={label}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold ${
              i === 0
                ? "bg-[var(--admin-navy)] text-white"
                : "bg-white text-[var(--admin-navy)] ring-1 ring-slate-200"
            }`}
          >
            {label}
          </span>
        ))}
      </div>

      <ul className="space-y-4">
        {list.map((b, idx) => {
          const jMinus = daysUntil(b.start_date);
          const img = HERO_IMAGES[idx % HERO_IMAGES.length];
          return (
            <li key={b.id}>
              <article className="overflow-hidden rounded-[1.4rem] bg-white shadow-[0_10px_28px_rgba(15,23,42,0.06)]">
                <div className="relative h-40 overflow-hidden">
                  <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: `url(${img})` }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
                  <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                    <StatusChip tone={bookingStatusTone(b.status)}>
                      {BOOKING_STATUS_LABELS[b.status]}
                    </StatusChip>
                  </div>
                  {!showPast && jMinus != null && jMinus >= 0 ? (
                    <span className="absolute right-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-[var(--admin-navy)]">
                      Dans {jMinus} j
                    </span>
                  ) : null}
                  <div className="absolute bottom-3 left-3 right-3">
                    <p className="font-display text-lg font-extrabold text-white">
                      {b.destination || b.title}
                    </p>
                    <p className="text-xs text-white/80">
                      {formatDateFr(b.start_date)} — {formatDateFr(b.end_date)}
                    </p>
                  </div>
                </div>
                <div className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                        Réf. {b.reference}
                      </p>
                      <p className="mt-0.5 text-sm font-medium text-[var(--admin-navy)]">
                        {b.title}
                      </p>
                    </div>
                    <p className="font-display text-base font-extrabold text-[var(--admin-navy)]">
                      {formatMoney(Number(b.total_amount), b.currency)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/mon-compte/reservations/${b.reference}`}
                      className="inline-flex flex-1 items-center justify-center rounded-xl bg-[var(--admin-navy)] px-3 py-2.5 text-sm font-semibold text-white"
                    >
                      {showPast ? "Revoir le dossier" : "Détails & programme"}
                    </Link>
                    <a
                      href={`mailto:${siteConfig.contactEmail}?subject=${encodeURIComponent(`Vouchers ${b.reference}`)}`}
                      className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-[var(--admin-navy)]"
                    >
                      PDF
                    </a>
                  </div>
                </div>
              </article>
            </li>
          );
        })}
        {!list.length ? (
          <li>
            <EmptyState
              title={showPast ? "Aucun voyage passé" : "Aucun voyage à venir"}
              description="Votre majordome pourra créer votre prochain dossier dès que vous le souhaitez."
            />
          </li>
        ) : null}
      </ul>

      <ConciergeBanner />
    </div>
  );
}
