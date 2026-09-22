import Link from "next/link";
import { Icon } from "@/components/crm/icons";
import {
  formatCreditDisponible,
  formatEncours,
  formatMoney,
  postedLedgerTotals,
} from "@/lib/crm/money";
import { siteConfig } from "@/lib/site";
import type { CrmTransaction } from "@/lib/crm/types";

export function PersonalLedgerCard({
  rows,
  balanceValue,
  currency,
  title = "Vos voyages",
  hint,
}: {
  rows: CrmTransaction[];
  balanceValue: number;
  currency: string;
  title?: string;
  hint?: string;
}) {
  const { credits, debits, settledPct } = postedLedgerTotals(rows);
  const remaining = Math.max(0, -balanceValue);

  return (
    <section className="rounded-xl border border-[#e9e8e5]/60 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-1.5">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--admin-gold)]/15 text-[#9c7c4e]">
          <Icon name="account_balance_wallet" className="h-4 w-4" />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#9c7c4e]">
          {title}
        </span>
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-muted">Encours</span>
        <span className="font-display text-2xl font-bold tracking-tight text-[var(--admin-navy)]">
          {formatEncours(balanceValue, currency)}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">
        {hint || "Positif = avoir · négatif = reste à régler"}
      </p>

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
              Déjà honoré : <strong>{formatMoney(credits, currency)}</strong>
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
    </section>
  );
}

export function CompanyTripCard({
  companyName,
  debits,
  currency,
}: {
  companyName: string;
  debits: number;
  currency: string;
}) {
  return (
    <section className="rounded-xl border border-[#e9e8e5]/60 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-1.5">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--admin-gold)]/15 text-[#9c7c4e]">
          <Icon name="verified_user" className="h-4 w-4" />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#9c7c4e]">
          Voyages {companyName}
        </span>
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-muted">Frais de vos dossiers</span>
        <span className="font-display text-2xl font-bold tracking-tight text-[var(--admin-navy)]">
          {formatMoney(debits, currency)}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">
        {companyName} règle ces séjours. Le crédit disponible et les versements de la société ne
        sont pas visibles ici.
      </p>
      <div className="mt-3">
        <a
          href={`mailto:${siteConfig.contactEmail}?subject=${encodeURIComponent("Question sur mes frais de voyage")}`}
          className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[var(--admin-navy)] text-[12px] font-semibold uppercase tracking-[0.06em] text-white"
        >
          Contacter l’agence
        </a>
      </div>
    </section>
  );
}

export function personalHomeLabel(balanceValue: number, currency: string) {
  if (balanceValue > 0) {
    return `Crédit disponible ${formatCreditDisponible(balanceValue, currency)}`;
  }
  return formatEncours(balanceValue, currency);
}
