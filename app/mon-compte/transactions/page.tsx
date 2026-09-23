import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import {
  TX_KIND_LABELS,
  type CrmBalance,
  type CrmTransaction,
} from "@/lib/crm/types";
import {
  formatDateFr,
  formatDateRangeShort,
  formatMoney,
  postedLedgerTotals,
} from "@/lib/crm/money";
import { filterClientLedgerRows, isCompanyMember } from "@/lib/crm/company-role";
import {
  ledgerMovementTitle,
  ledgerPlace,
  ledgerSubjectTitle,
  ledgerWhenWhere,
  visibleLedgerRows,
} from "@/lib/crm/ledger-display";
import { LedgerMovements } from "@/components/account/LedgerMovements";
import { EmptyState } from "@/components/crm/ui";
import { Icon } from "@/components/crm/icons";
import { siteConfig } from "@/lib/site";

export default async function TransactionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");

  const member = isCompanyMember(customer);
  const { data: myBookings } = await supabase
    .from("crm_bookings")
    .select("id")
    .eq("customer_id", customer.id);
  const bookingIds = ((myBookings || []) as { id: string }[]).map((b) => b.id);

  let rows: CrmTransaction[] = [];
  let balanceValue = 0;
  let currency = "EUR";

  if (member) {
    if (bookingIds.length) {
      const { data: txs } = await supabase
        .from("crm_transactions")
        .select("*")
        .eq("status", "posted")
        .eq("direction", "debit")
        .in("booking_id", bookingIds)
        .order("occurred_on", { ascending: false });
      rows = filterClientLedgerRows((txs || []) as CrmTransaction[], {
        companyRole: "member",
        travelerBookingIds: bookingIds,
      });
    }
    const { debits } = postedLedgerTotals(rows);
    balanceValue = -debits;
    currency = rows[0]?.currency || "EUR";
  } else {
    const [{ data: txs }, { data: balances }] = await Promise.all([
      supabase
        .from("crm_transactions")
        .select("*")
        .eq("customer_id", customer.id)
        .eq("status", "posted")
        .order("occurred_on", { ascending: false }),
      supabase.from("crm_customer_balances").select("*").eq("customer_id", customer.id),
    ]);
    rows = (txs || []) as CrmTransaction[];
    const bal = ((balances || []) as CrmBalance[])[0];
    balanceValue = bal ? Number(bal.balance) : 0;
    currency = bal?.currency || "EUR";
  }

  const shown = visibleLedgerRows(rows);
  const contextIds = [...new Set(shown.map((row) => row.booking_id).filter(Boolean))] as string[];
  const bookingById = new Map<
    string,
    {
      title: string | null;
      destination: string | null;
      reference: string;
      start_date: string | null;
      end_date: string | null;
      visible_to_client: boolean;
    }
  >();
  if (contextIds.length) {
    const { data: linked } = await supabase
      .from("crm_bookings")
      .select("id, title, destination, reference, start_date, end_date, visible_to_client")
      .in("id", contextIds);
    for (const booking of linked || []) {
      bookingById.set(booking.id, {
        title: booking.title,
        destination: booking.destination,
        reference: booking.reference,
        start_date: booking.start_date,
        end_date: booking.end_date,
        visible_to_client: booking.visible_to_client,
      });
    }
  }

  const movements = shown.map((t) => {
    const credit = t.direction === "credit";
    const booking = t.booking_id ? bookingById.get(t.booking_id) : null;
    const tripDates =
      booking && (booking.start_date || booking.end_date)
        ? formatDateRangeShort(booking.start_date, booking.end_date)
        : null;
    const place = ledgerPlace(booking);
    const reference = booking?.reference || null;
    const rawTitle = ledgerMovementTitle(t, TX_KIND_LABELS[t.kind] || t.kind);
    return {
      id: t.id,
      credit,
      title: ledgerSubjectTitle(rawTitle, reference),
      amountLabel: `${credit ? "+" : "−"}${formatMoney(Number(t.amount), t.currency)}`,
      occurredLabel: formatDateFr(t.occurred_on),
      kindLabel: TX_KIND_LABELS[t.kind] || t.kind,
      whenWhere: ledgerWhenWhere(tripDates, place),
      reference,
      carnetHref:
        booking?.visible_to_client && booking.reference
          ? `/mon-compte/reservations/${booking.reference}`
          : null,
    };
  });

  const { debits, settledPct } = postedLedgerTotals(shown);
  const remaining = Math.max(0, -balanceValue);
  const remainingPct = settledPct == null ? null : Math.max(0, 100 - settledPct);
  const creditCount = shown.filter((t) => t.direction === "credit").length;

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-[#e9e8e5]/60 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--admin-gold)]/15 text-[#9c7c4e]">
              <Icon name="verified_user" className="h-4 w-4" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#9c7c4e]">
              {member ? "Frais de vos voyages" : "Grand livre"}
            </span>
          </div>
        </div>

        {member ? (
          <>
            <div className="mt-3 flex items-baseline justify-between gap-3">
              <span className="text-[13px] text-muted">Total de vos dossiers</span>
              <span className="font-display text-2xl font-bold tracking-tight text-[var(--admin-navy)]">
                {formatMoney(debits, currency)}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted">
              Votre société règle ces voyages. Les versements et le crédit disponible société ne sont
              pas visibles ici.
            </p>
          </>
        ) : (
          <>
            <div className="mt-3 rounded-lg border border-[var(--admin-gold)]/20 bg-[#f4f3f0] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9c7c4e]">
                Solde restant dû
              </p>
              <p className="font-display text-[1.625rem] font-bold tracking-tight text-[var(--admin-navy)]">
                {formatMoney(remaining, currency)}
              </p>
            </div>
            {remainingPct != null && remaining > 0 ? (
              <div className="mt-3">
                <div className="h-2.5 overflow-hidden rounded-full bg-[#e9e8e5]">
                  <div
                    className="h-full rounded-full bg-[var(--admin-navy)]"
                    style={{ width: `${remainingPct}%` }}
                  />
                </div>
                <p className="mt-1.5 text-right text-[10px] font-bold text-[#9c7c4e]">
                  {remainingPct}% restant à régler
                </p>
              </div>
            ) : null}
            <Link
              href="/mon-compte/profil/facturation"
              className="mt-3 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-full border border-[var(--admin-gold)]/30 bg-[var(--admin-gold)]/15 text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--admin-navy)]"
            >
              <Icon name="account_balance" className="h-[18px] w-[18px] text-[#9c7c4e]" />
              Facturation
            </Link>
          </>
        )}

        {member ? (
          <div className="mt-3 grid grid-cols-1 gap-2">
            <a
              href={`mailto:${siteConfig.contactEmail}?subject=${encodeURIComponent("Question sur mes frais de voyage")}`}
              className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--admin-navy)] text-[12px] font-semibold uppercase tracking-[0.06em] text-white"
            >
              Contacter l’agence
            </a>
          </div>
        ) : null}
      </section>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon name="account_balance_wallet" className="h-5 w-5 text-[var(--admin-navy)]" />
          <h2 className="font-display text-xl font-semibold text-[var(--admin-navy)]">
            {member ? "Frais de voyage" : "Mouvements"}
          </h2>
        </div>
        {!member && creditCount ? (
          <span className="rounded-full bg-[var(--admin-gold)]/20 px-2.5 py-0.5 text-[12px] font-semibold text-[var(--admin-navy)]">
            {creditCount} règlement{creditCount > 1 ? "s" : ""}
          </span>
        ) : null}
      </div>

      {movements.length ? (
        <LedgerMovements rows={movements} />
      ) : (
        <EmptyState
          title={member ? "Aucun frais de voyage" : "Aucun mouvement"}
          description={
            member
              ? "Les débits de vos dossiers confirmés apparaîtront ici."
              : "Les dépenses des séjours et les virements reçus apparaîtront ici."
          }
        />
      )}
    </div>
  );
}
