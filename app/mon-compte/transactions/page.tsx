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
  formatEncours,
  formatMoney,
  postedLedgerTotals,
} from "@/lib/crm/money";
import { filterClientLedgerRows, isCompanyMember } from "@/lib/crm/company-role";
import {
  ledgerMovementTitle,
  reservationContextLabel,
  visibleLedgerRows,
} from "@/lib/crm/ledger-display";
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
  const bookingById = new Map<string, { title: string | null; reference: string }>();
  if (contextIds.length) {
    const { data: linked } = await supabase
      .from("crm_bookings")
      .select("id, title, reference")
      .in("id", contextIds);
    for (const booking of linked || []) {
      bookingById.set(booking.id, { title: booking.title, reference: booking.reference });
    }
  }

  const { credits, debits, settledPct } = postedLedgerTotals(shown);
  const remaining = Math.max(0, -balanceValue);
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
            <div className="mt-3 flex items-baseline justify-between gap-3">
              <span className="text-[13px] text-muted">Encours</span>
              <span className="font-display text-2xl font-bold tracking-tight text-[var(--admin-navy)]">
                {formatEncours(balanceValue, currency)}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted">Positif = avoir · négatif = reste à régler</p>

            {settledPct != null ? (
              <>
                <div className="my-2 h-2.5 overflow-hidden rounded-full bg-[#e9e8e5]">
                  <div
                    className="h-full rounded-full bg-[var(--admin-navy)]"
                    style={{ width: `${settledPct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-[var(--admin-navy)]">
                    Déjà honoré :{" "}
                    <strong>{formatMoney(credits, currency)}</strong>
                  </span>
                  <span className="text-[10px] font-bold text-[#9c7c4e]">{settledPct}% réglé</span>
                </div>
              </>
            ) : null}

            <div className="mt-3 flex flex-col gap-1 rounded-lg border border-[var(--admin-gold)]/20 bg-[#f4f3f0] p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9c7c4e]">
                    {remaining > 0 ? "Solde restant dû" : "Crédit disponible"}
                  </p>
                  <p className="font-display text-[1.625rem] font-bold tracking-tight text-[var(--admin-navy)]">
                    {formatMoney(remaining > 0 ? remaining : Math.max(0, balanceValue), currency)}
                  </p>
                  {remaining <= 0 && balanceValue > 0 ? (
                    <p className="text-[11px] text-muted">Frais d’agence 10 % déjà déduits</p>
                  ) : null}
                </div>
                {debits > 0 ? (
                  <div className="text-right">
                    <p className="text-[10px] text-muted">Total débité</p>
                    <p className="text-sm font-semibold text-[var(--admin-navy)]">
                      {formatMoney(debits, currency)}
                    </p>
                  </div>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Link
                  href="/mon-compte/profil/facturation"
                  className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full border border-[var(--admin-gold)]/30 bg-[var(--admin-gold)]/15 text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--admin-navy)]"
                >
                  <Icon name="account_balance" className="h-[18px] w-[18px] text-[#9c7c4e]" />
                  Facturation
                </Link>
                <a
                  href={`mailto:${siteConfig.contactEmail}?subject=${encodeURIComponent("Demande de relevé")}`}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--admin-navy)] text-[12px] font-semibold uppercase tracking-[0.06em] text-white"
                >
                  Demander un relevé
                </a>
              </div>
            </div>
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

      {shown.length ? (
        <ul className="space-y-2">
          {shown.map((t) => {
            const credit = t.direction === "credit";
            const context = reservationContextLabel(
              t.booking_id ? bookingById.get(t.booking_id) : null
            );
            return (
              <li
                key={t.id}
                className="flex flex-col gap-1 rounded-xl border border-[#e9e8e5]/60 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                        credit
                          ? "bg-[var(--admin-gold)]/15 text-[var(--admin-navy)]"
                          : "bg-[#efeeeb] text-[var(--admin-navy)]"
                      }`}
                    >
                      <Icon
                        name={credit ? "south_west" : "receipt_long"}
                        className="h-[22px] w-[22px]"
                      />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[16px] font-semibold text-[var(--admin-navy)]">
                        {ledgerMovementTitle(t, TX_KIND_LABELS[t.kind] || t.kind)}
                      </p>
                      <p className="text-[13px] text-muted">
                        {credit ? "Reçu le" : "Le"} {formatDateFr(t.occurred_on)}
                      </p>
                      {context ? (
                        <p className="pt-0.5 text-[13px] text-muted">{context}</p>
                      ) : (
                        <p className="pt-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">
                          {TX_KIND_LABELS[t.kind]}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end">
                    <p className="whitespace-nowrap text-[16px] font-bold tracking-tight text-[var(--admin-navy)]">
                      {credit ? "+" : "−"}
                      {formatMoney(Number(t.amount), t.currency)}
                    </p>
                    <span
                      className={`mt-1 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${
                        credit
                          ? "border-[var(--admin-gold)]/30 bg-[var(--admin-gold)]/15 text-[var(--admin-navy)]"
                          : "border-[#e5e3dc] bg-[#efeeeb] text-[#44474c]"
                      }`}
                    >
                      {credit ? "Encaissé" : "Posté"}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
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
