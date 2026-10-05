import type { ReactNode } from "react";
import Link from "next/link";
import { LedgerMovements } from "@/components/account/LedgerMovements";
import { EmptyState } from "@/components/crm/ui";
import { Icon } from "@/components/crm/icons";
import type { ClientLedgerView, ClientLedgerWallet } from "@/lib/crm/client-ledger";
import { formatMoney } from "@/lib/crm/money";
import { siteConfig } from "@/lib/site";

/** Sujet du mail « Demander un relevé », avec le nom du client quand on l’a. */
export function statementMailto(name: string | null | undefined) {
  const subject = name?.trim() ? `Relevé de compte — ${name.trim()}` : "Relevé de compte";
  return `mailto:${siteConfig.contactEmail}?subject=${encodeURIComponent(subject)}`;
}

function WalletBlock({ wallet, label }: { wallet: ClientLedgerWallet; label: string }) {
  return (
    <div className="mt-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9c7c4e]">{label}</p>
      <p className="font-display text-[1.75rem] font-bold tracking-tight text-[var(--admin-navy)]">
        {formatMoney(wallet.balanceValue, wallet.currency)}
      </p>
      {wallet.remainingPct != null ? (
        <div className="mt-3">
          <div className="h-2.5 overflow-hidden rounded-full bg-[#e9e8e5]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[var(--admin-navy)] to-[var(--admin-gold)]"
              style={{ width: `${Math.min(100, 100 - wallet.remainingPct)}%` }}
            />
          </div>
          <p className="mt-1.5 text-right text-[10px] font-bold text-[#9c7c4e]">
            {wallet.remaining > 0 ? `${Math.max(0, 100 - wallet.remainingPct)}% réglé` : "Soldé"}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function ClientTransactionsPanel({
  view,
  billingHref = null,
  payments = null,
  statementName = null,
}: {
  view: ClientLedgerView;
  billingHref?: string | null;
  payments?: ReactNode | null;
  /** Nom du client pour le sujet du relevé demandé par e-mail. */
  statementName?: string | null;
}) {
  const { member, currency, remaining, remainingPct, debits, creditCount, movements } = view;
  const wallets: ClientLedgerWallet[] = view.wallets?.length
    ? view.wallets
    : [{ currency, balanceValue: view.balanceValue, debits, remaining, remainingPct, creditCount }];
  const several = wallets.length > 1;

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
            {wallets.map((wallet) => (
              <WalletBlock
                key={wallet.currency}
                wallet={wallet}
                label={several ? `Encours ${wallet.currency.toUpperCase()}` : "Encours"}
              />
            ))}
            {payments ? <div className="mt-3">{payments}</div> : null}
            {billingHref ? (
              <Link
                href={billingHref}
                className="mt-3 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-full border border-[var(--admin-gold)]/30 bg-[var(--admin-gold)]/15 text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--admin-navy)]"
              >
                <Icon name="account_balance" className="h-[18px] w-[18px] text-[#9c7c4e]" />
                Facturation
              </Link>
            ) : null}
            <a
              href={statementMailto(statementName)}
              className="mt-2 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-full border border-[#e5e3dc] bg-white text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--admin-navy)]"
            >
              <Icon name="mail" className="h-[18px] w-[18px] text-[#9c7c4e]" />
              Demander un relevé
            </a>
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
