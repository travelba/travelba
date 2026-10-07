import type { ReactNode } from "react";
import Link from "next/link";
import { LedgerMovements } from "@/components/account/LedgerMovements";
import { SpendingBookings } from "@/components/account/SpendingBookings";
import { EmptyState } from "@/components/crm/ui";
import { Icon } from "@/components/crm/icons";
import { StatementRequest } from "@/components/account/StatementRequest";
import type { ClientLedgerView, ClientLedgerWallet } from "@/lib/crm/client-ledger";
import { formatMoney } from "@/lib/crm/money";
import { spendingUsedPct, type SpendingAccount, type SpendingDesk } from "@/lib/crm/spending-desk";
import { siteConfig } from "@/lib/site";

function AllowanceBar({ account, currency }: { account: SpendingAccount; currency: string }) {
  const used = spendingUsedPct(account.allowance, account.spent);
  return (
    <div className="mt-3">
      <p className="font-display text-[1.75rem] font-bold tracking-tight text-[var(--admin-navy)]">
        {formatMoney(account.remaining, currency)}
      </p>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#e9e8e5]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[var(--admin-navy)] to-[var(--admin-gold)]"
          style={{ width: `${used}%` }}
        />
      </div>
      <div className="mt-4 border-t border-[#e9e8e5] pt-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9c7c4e]">Droit de dépense</p>
        <p className="mt-1 text-[13px] text-muted">{formatMoney(account.allowance, currency)}</p>
      </div>
    </div>
  );
}

function SpendingRights({ spending }: { spending: SpendingDesk | null }) {
  if (!spending?.accounts.length) return null;
  return (
    <div className="mt-4 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9c7c4e]">Droits de dépense</p>
      <ul className="m-0 list-none space-y-2 p-0">
        {spending.accounts.map((account) => (
          <li key={account.id} className="rounded-lg bg-[#faf9f6] px-3 py-3">
            <span className="block truncate text-[13px] font-semibold text-[var(--admin-navy)]">{account.name}</span>
            <span className="mt-1 block font-display text-lg font-bold tracking-tight text-[var(--admin-navy)]">
              {formatMoney(account.remaining, spending.currency)}
            </span>
            <span className="mt-2 block border-t border-[#e9e8e5] pt-2 text-[10px] font-semibold uppercase tracking-wider text-[#9c7c4e]">
              Droit de dépense
            </span>
            <span className="mt-0.5 block text-[13px] text-muted">{formatMoney(account.allowance, spending.currency)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WalletBlock({
  wallet,
  label,
  caption,
}: {
  wallet: ClientLedgerWallet;
  label: string;
  caption?: string | null;
}) {
  return (
    <div className="mt-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9c7c4e]">{label}</p>
      <p className="font-display text-[1.75rem] font-bold tracking-tight text-[var(--admin-navy)]">
        {formatMoney(wallet.balanceValue, wallet.currency)}
      </p>
      {caption ? <p className="mt-1.5 text-[12px] text-muted">{caption}</p> : null}
      {!caption && wallet.remainingPct != null ? (
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
  statementEndpoint = null,
  statementAudience = "client",
}: {
  view: ClientLedgerView;
  billingHref?: string | null;
  payments?: ReactNode | null;
  /** GET télécharge le PDF, POST l’envoie sur WhatsApp. */
  statementEndpoint?: string | null;
  statementAudience?: "client" | "staff";
}) {
  const { member, currency, remaining, remainingPct, debits, creditCount, movements, spending, pockets } = view;
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
              {member ? (spending?.own ? "Encours" : "Frais de vos voyages") : "Grand livre"}
            </span>
          </div>
        </div>

        {member ? (
          spending?.own ? (
            <>
              <AllowanceBar account={spending.own} currency={spending.currency} />
              <p className="mt-2 text-xs text-muted">
                Votre société règle ces voyages. Les versements et les droits des autres ne sont pas
                visibles ici.
              </p>
            </>
          ) : (
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
          )
        ) : (
          <>
            {pockets?.length
              ? pockets.map((pocket) => (
                  <div key={pocket.companyId}>
                    <WalletBlock
                      wallet={{
                        currency,
                        balanceValue: pocket.balance,
                        debits: pocket.debits,
                        remaining: pocket.due,
                        remainingPct:
                          pocket.funding === "advance" && pocket.balance > 0 ? null : pocket.remainingPct,
                        creditCount: pocket.creditCount,
                      }}
                      label={pocket.label}
                      caption={pocket.funding === "advance" && pocket.balance > 0 ? "Crédit à dépenser" : null}
                    />
                    {pocket.funding === "advance" ? <SpendingRights spending={spending} /> : null}
                  </div>
                ))
              : wallets.map((wallet) => (
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
            <StatementRequest endpoint={statementEndpoint} audience={statementAudience} />
            {pockets?.length ? null : <SpendingRights spending={spending} />}
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

      {spending ? (
        <>
          <div className="flex items-center gap-1.5">
            <Icon name="account_balance_wallet" className="h-5 w-5 text-[var(--admin-navy)]" />
            <h2 className="font-display text-xl font-semibold text-[var(--admin-navy)]">Réservations</h2>
          </div>
          {spending.cards.length ? (
            <SpendingBookings cards={spending.cards} />
          ) : (
            <EmptyState
              title="Aucune réservation"
              description="Les séjours rattachés à un droit de dépense apparaîtront ici."
            />
          )}
          {spending.otherMovements.length ? (
            <>
              <h2 className="font-display text-xl font-semibold text-[var(--admin-navy)]">Autres mouvements</h2>
              <LedgerMovements rows={spending.otherMovements} />
            </>
          ) : null}
        </>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
