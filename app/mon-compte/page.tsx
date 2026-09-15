import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import {
  BOOKING_STATUS_LABELS,
  TX_KIND_LABELS,
  customerFullName,
  type CrmBalance,
  type CrmBooking,
  type CrmBookingItem,
  type CrmTransaction,
} from "@/lib/crm/types";
import { formatDateFr, formatMoney, isUpcomingBooking } from "@/lib/crm/money";
import { StatusChip } from "@/components/crm/ui";
import { siteConfig } from "@/lib/site";

function daysUntil(date: string | null) {
  if (!date) return null;
  const start = new Date(`${date}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.ceil((start.getTime() - today.getTime()) / 86_400_000);
}

function tripDays(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const a = new Date(`${start}T12:00:00`).getTime();
  const b = new Date(`${end}T12:00:00`).getTime();
  return Math.max(1, Math.round((b - a) / 86_400_000));
}

export default async function AccountHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");

  const [{ data: bookings }, { data: balances }, { data: txs }] =
    await Promise.all([
      supabase
        .from("crm_bookings")
        .select("*")
        .eq("customer_id", customer.id)
        .neq("status", "cancelled")
        .order("start_date", { ascending: true, nullsFirst: false }),
      supabase
        .from("crm_customer_balances")
        .select("*")
        .eq("customer_id", customer.id),
      supabase
        .from("crm_transactions")
        .select("*")
        .eq("customer_id", customer.id)
        .eq("status", "posted")
        .order("occurred_on", { ascending: false })
        .limit(5),
    ]);

  const nextTrip = ((bookings || []) as CrmBooking[]).find((b) =>
    isUpcomingBooking(b.end_date)
  );

  let items: CrmBookingItem[] = [];
  if (nextTrip) {
    const { data: itemRows } = await supabase
      .from("crm_booking_items")
      .select("*")
      .eq("booking_id", nextTrip.id)
      .order("sort_order", { ascending: true });
    items = (itemRows || []) as CrmBookingItem[];
  }

  const flight = items.find((i) => i.kind === "flight");
  const hotel = items.find((i) => i.kind === "hotel");

  const primaryBalance = ((balances || []) as CrmBalance[])[0];
  const balanceValue = primaryBalance ? Number(primaryBalance.balance) : 0;
  const currency = primaryBalance?.currency || nextTrip?.currency || "EUR";
  const firstName =
    customer.first_name || customerFullName(customer).split(" ")[0];
  const recentTxs = (txs || []) as CrmTransaction[];
  const jMinus = daysUntil(nextTrip?.start_date ?? null);
  const tripTotal = nextTrip ? Number(nextTrip.total_amount) : 0;
  const remainingDue = Math.max(0, -balanceValue);
  const availableCredit = Math.max(0, balanceValue);
  const financedPct =
    tripTotal > 0
      ? Math.min(
          100,
          Math.round(((tripTotal - remainingDue) / tripTotal) * 1000) / 10
        )
      : balanceValue >= 0
        ? 100
        : 0;
  const nights = tripDays(
    nextTrip?.start_date ?? null,
    nextTrip?.end_date ?? null
  );
  const whatsappHref = `https://wa.me/${siteConfig.whatsappNumber}`;

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Ravi de vous revoir ✨</p>
          <h1 className="mt-1 font-display text-[1.85rem] font-extrabold tracking-tight text-[var(--admin-navy)]">
            Bonjour {firstName}
          </h1>
        </div>
        <Link
          href="/mon-compte/reservations"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--aura-blue-soft)] px-3.5 py-2 text-[11px] font-bold uppercase tracking-wide text-[var(--aura-blue)]"
        >
          <span aria-hidden>◆</span>
          Explorer Club
        </Link>
      </header>

      {nextTrip ? (
        <article className="relative min-h-[340px] overflow-hidden rounded-[1.5rem] bg-[var(--admin-navy)] text-white shadow-[0_18px_40px_rgba(11,31,58,0.28)]">
          <div
            className="absolute inset-0 bg-cover bg-center opacity-55"
            style={{
              backgroundImage:
                "url(https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1200&q=80)",
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--admin-navy)] via-[var(--admin-navy)]/70 to-transparent" />
          <div className="relative flex min-h-[340px] flex-col justify-end space-y-3.5 p-5 pb-6 pt-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1 text-[11px] font-semibold text-[var(--admin-navy)]">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Départ imminent
              </span>
              {jMinus != null && jMinus >= 0 ? (
                <span className="rounded-full bg-black/40 px-3 py-1 text-[11px] font-bold backdrop-blur">
                  J-{jMinus}
                </span>
              ) : null}
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--aura-blue-soft)]">
                {nextTrip.title || "Prochaine escapade"}
              </p>
              <h2 className="mt-1 font-display text-[1.7rem] font-extrabold leading-tight">
                {nextTrip.destination || nextTrip.title}
              </h2>
              <p className="mt-1.5 text-sm text-white/75">
                {formatDateFr(nextTrip.start_date)} —{" "}
                {formatDateFr(nextTrip.end_date)}
                {nights ? ` (${nights} j)` : null}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-black/25 p-3 backdrop-blur-md">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-white/55">
                  Vol
                </p>
                <p className="mt-0.5 truncate text-sm font-semibold">
                  {flight?.title ||
                    flight?.confirmation_ref ||
                    nextTrip.reference}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-white/55">
                  Séjour
                </p>
                <p className="mt-0.5 truncate text-sm font-semibold">
                  {hotel?.title || BOOKING_STATUS_LABELS[nextTrip.status]}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Link
                href={`/mon-compte/reservations/${nextTrip.reference}`}
                className="flex h-12 flex-1 items-center justify-center rounded-full bg-white text-sm font-bold text-[var(--admin-navy)]"
              >
                Voir l&apos;itinéraire →
              </Link>
              <a
                href={whatsappHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-black/35 text-lg backdrop-blur"
                aria-label="Contacter le concierge"
              >
                ✦
              </a>
            </div>
          </div>
        </article>
      ) : (
        <article className="rounded-[1.5rem] bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            Prochaine destination
          </p>
          <h2 className="mt-2 font-display text-xl font-bold text-[var(--admin-navy)]">
            Aucun voyage planifié
          </h2>
          <p className="mt-1 text-sm text-muted">
            Votre conciergerie {siteConfig.shortName} peut préparer votre prochain
            dossier.
          </p>
          <a
            href={`mailto:${siteConfig.contactEmail}`}
            className="mt-4 inline-flex rounded-full bg-[var(--admin-navy)] px-5 py-2.5 text-sm font-semibold text-white"
          >
            Contacter la conciergerie
          </a>
        </article>
      )}

      <div className="grid grid-cols-3 gap-2.5">
        <Link
          href="/mon-compte/reservations"
          className="flex flex-col items-center rounded-2xl bg-white px-2 py-3.5 text-center shadow-[0_6px_18px_rgba(15,23,42,0.04)]"
        >
          <span className="mb-2 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--aura-blue-soft)] text-base">
            🎫
          </span>
          <span className="text-[11px] font-bold leading-tight text-[var(--admin-navy)]">
            Billets & Vouchers
          </span>
        </Link>
        <Link
          href="/mon-compte/transactions"
          className="flex flex-col items-center rounded-2xl bg-white px-2 py-3.5 text-center shadow-[0_6px_18px_rgba(15,23,42,0.04)]"
        >
          <span className="mb-2 inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-base font-bold text-[var(--admin-navy)]">
            +
          </span>
          <span className="text-[11px] font-bold leading-tight text-[var(--admin-navy)]">
            Paiements & solde
          </span>
        </Link>
        <a
          href={whatsappHref}
          target="_blank"
          rel="noreferrer"
          className="flex flex-col items-center rounded-2xl bg-white px-2 py-3.5 text-center shadow-[0_6px_18px_rgba(15,23,42,0.04)]"
        >
          <span className="mb-2 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--aura-blue-soft)] text-base">
            🛎️
          </span>
          <span className="text-[11px] font-bold leading-tight text-[var(--admin-navy)]">
            Concierge Privé
          </span>
        </a>
      </div>

      <section className="rounded-[1.5rem] bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--aura-blue-soft)] text-sm">
              💳
            </span>
            <h3 className="font-display text-base font-bold text-[var(--admin-navy)]">
              Votre encours voyage
            </h3>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
            Mis à jour
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[11px] text-muted">Solde disponible</p>
            <p className="mt-0.5 font-display text-2xl font-extrabold tracking-tight text-[var(--admin-navy)]">
              {formatMoney(availableCredit, currency)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-muted">
              {remainingDue > 0 ? "Reste à payer" : "Budget validé"}
            </p>
            <p className="mt-0.5 font-display text-lg font-bold text-muted">
              {formatMoney(
                remainingDue > 0 ? remainingDue : tripTotal || availableCredit,
                currency
              )}
            </p>
          </div>
        </div>
        {tripTotal > 0 ? (
          <div className="mt-4 space-y-1.5">
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[var(--aura-blue)]"
                style={{ width: `${financedPct}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-muted">
              <span>{financedPct}% financé</span>
              <span>Reste {formatMoney(remainingDue, currency)}</span>
            </div>
          </div>
        ) : null}
        <div className="mt-4 flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3.5 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Solde à régulariser
            </p>
            <p className="mt-0.5 text-sm font-semibold text-[var(--admin-navy)]">
              {remainingDue > 0 ? formatMoney(remainingDue, currency) : "Aucune"}
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">
            Selon votre dossier
          </span>
        </div>
        <Link
          href="/mon-compte/transactions"
          className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-[var(--admin-navy)] px-3 py-2.5 text-sm font-semibold text-white"
        >
          Voir l&apos;historique
        </Link>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-bold text-[var(--admin-navy)]">
            Dernières activités
          </h3>
          <Link
            href="/mon-compte/transactions"
            className="text-sm font-semibold text-[var(--aura-blue)]"
          >
            Voir l&apos;historique
          </Link>
        </div>
        {recentTxs.length === 0 ? (
          <p className="rounded-2xl bg-white px-4 py-6 text-center text-sm text-muted shadow-sm">
            Aucune transaction récente.
          </p>
        ) : (
          <ul className="space-y-2">
            {recentTxs.map((tx) => {
              const credit = tx.direction === "credit";
              return (
                <li
                  key={tx.id}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-white p-3.5 shadow-[0_6px_18px_rgba(15,23,42,0.04)]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                        credit
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-[var(--aura-blue-soft)] text-[var(--aura-blue)]"
                      }`}
                    >
                      {credit ? "↓" : "↑"}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--admin-navy)]">
                        {tx.label || TX_KIND_LABELS[tx.kind] || tx.kind}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {formatDateFr(tx.occurred_on)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-sm font-bold ${
                        credit ? "text-emerald-600" : "text-[var(--admin-navy)]"
                      }`}
                    >
                      {credit ? "+" : "−"}
                      {formatMoney(Number(tx.amount), tx.currency)}
                    </p>
                    <StatusChip tone={credit ? "green" : "sky"}>
                      {credit ? "Reçu" : "Confirmé"}
                    </StatusChip>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
