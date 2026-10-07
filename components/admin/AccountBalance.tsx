import Link from "next/link";
import type { AccountPocket } from "@/lib/crm/account-balances";
import { formatMoney } from "@/lib/crm/money";

function money(amount: number, currency: string) {
  try {
    return formatMoney(amount, currency);
  } catch {
    return formatMoney(amount, "EUR");
  }
}

function PocketFigures({ pocket, large }: { pocket: AccountPocket; large: boolean }) {
  return (
    <p>
      {pocket.name ? (
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">{pocket.name}</span>
      ) : null}
      <span className={`block font-display font-extrabold tabular-nums ${large ? "text-3xl" : "text-2xl"}`}>
        {pocket.amount == null ? "Indisponible" : money(pocket.amount, pocket.currency)}
      </span>
      {pocket.pending != null && pocket.pending !== 0 ? (
        <span className="mt-0.5 block text-xs font-medium text-muted">
          En attente {money(pocket.pending, pocket.currency)}
        </span>
      ) : null}
    </p>
  );
}

/** Même lecture que le solde Pliant : un chiffre, ou une poche par compte. */
export function AccountBalanceCard({ pockets }: { pockets: AccountPocket[] }) {
  const shown = pockets.length ? pockets : [{ name: null, amount: null, currency: "EUR", pending: null }];
  return (
    <div className="admin-af-card max-w-xs rounded-3xl px-5 py-4 text-[var(--admin-navy)]">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Solde du compte</p>
      <div className="mt-1 space-y-3">
        {shown.map((pocket) => (
          <PocketFigures key={`${pocket.name || "compte"}-${pocket.currency}`} pocket={pocket} large={false} />
        ))}
      </div>
    </div>
  );
}

export function AgencyAccountBalances({
  accounts,
}: {
  accounts: { label: string; href: string; pockets: AccountPocket[] }[];
}) {
  if (!accounts.length) return null;
  return (
    <section aria-labelledby="comptes-titre" className="space-y-3">
      <h2 id="comptes-titre" className="font-display text-lg font-bold text-[var(--admin-navy)]">
        Comptes
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {accounts.map((account) => {
          const shown = account.pockets.length
            ? account.pockets
            : [{ name: null, amount: null, currency: "EUR", pending: null }];
          return (
            <Link
              key={account.href}
              href={account.href}
              className="admin-af-card rounded-2xl px-5 py-4 text-[var(--admin-navy)] transition hover:border-[var(--admin-gold)]"
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">{account.label}</p>
              <div className="mt-2 space-y-3">
                {shown.map((pocket) => (
                  <PocketFigures
                    key={`${account.href}-${pocket.name || "compte"}-${pocket.currency}`}
                    pocket={pocket}
                    large={shown.length === 1}
                  />
                ))}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
