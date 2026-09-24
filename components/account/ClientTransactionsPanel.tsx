import Link from "next/link";
import { LedgerMovements } from "@/components/account/LedgerMovements";
import { EmptyState } from "@/components/crm/ui";
import { Icon } from "@/components/crm/icons";
import type { ClientLedgerView } from "@/lib/crm/client-ledger";
import { formatMoney } from "@/lib/crm/money";
import { siteConfig } from "@/lib/site";

export function ClientTransactionsPanel({
  view,
  billingHref = null,
}: {
  view: ClientLedgerView;
  billingHref?: string | null;
}) {
  const { member, currency, remaining, remainingPct, debits, creditCount, movements } = view;

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
            <div className="mt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9c7c4e]">
                Encours
              </p>
              <p className="font-display text-[1.75rem] font-bold tracking-tight text-[var(--admin-navy)]">
                {formatMoney(view.balanceValue, currency)}
              </p>
            </div>
            {remainingPct != null ? (
              <div className="mt-3">
                <div className="h-2.5 overflow-hidden rounded-full bg-[#e9e8e5]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[var(--admin-navy)] to-[var(--admin-gold)]"
                    style={{ width: `${Math.min(100, 100 - remainingPct)}%` }}
                  />
                </div>
                <p className="mt-1.5 text-right text-[10px] font-bold text-[#9c7c4e]">
                  {remaining > 0 ? `${Math.max(0, 100 - remainingPct)}% réglé` : "Soldé"}
                </p>
              </div>
            ) : null}
            {remaining > 0 ? (
              <div className="mt-3 rounded-xl border border-[var(--admin-gold)]/40 bg-[#f8f3eb] px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9c7c4e]">
                  Reste à payer
                </p>
                <p className="font-display text-xl font-bold text-[var(--admin-navy)]">
                  {formatMoney(remaining, currency)}
                </p>
              </div>
            ) : null}
            {billingHref ? (
              <Link
                href={billingHref}
                className="mt-3 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-full border border-[var(--admin-gold)]/30 bg-[var(--admin-gold)]/15 text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--admin-navy)]"
              >
                <Icon name="account_balance" className="h-[18px] w-[18px] text-[#9c7c4e]" />
                Facturation
              </Link>
            ) : null}
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
