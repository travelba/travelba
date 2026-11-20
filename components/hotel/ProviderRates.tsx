import { formatMoney } from "@/lib/crm/money";
import type { ClientCompareRate } from "@/lib/crm/hotel-search";

function money(cents: number, currency: string) {
  return formatMoney(cents / 100, currency);
}

/** Deux tarifs du même hôtel, côte à côte. Le total affiché est celui du fournisseur. */
export function ProviderRates({ rates }: { rates: ClientCompareRate[] }) {
  const sideBySide = rates.length > 1;
  return (
    <div className={sideBySide ? "grid grid-cols-2 gap-2 px-4 py-3" : "px-4 pb-3"} data-provider-rates="1">
      {rates.map((rate) => (
        <div key={`${rate.kind}-${rate.label}`} className="min-w-0 rounded-2xl border border-[#e5e3dc] bg-[#fbf8f2] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8c7352]">{rate.label}</p>
          <p className="mt-1 text-base font-semibold leading-tight text-[#0B192C]">{money(rate.sellCents, rate.currency)} TTC</p>
          <p className="text-xs text-[#5c5348]">{money(rate.perNightCents, rate.currency)} / nuit</p>
          {rate.taxesCents != null ? (
            <p className="mt-2 text-xs text-[#0B192C]">Taxes et frais {money(rate.taxesCents, rate.currency)}</p>
          ) : null}
          {rate.dueAtPropertyCents != null && rate.dueAtPropertyCents > 0 ? (
            <p className="mt-1 text-xs text-[#0B192C]">À régler à l’hôtel {money(rate.dueAtPropertyCents, rate.currency)}</p>
          ) : null}
          {rate.refundable ? null : (
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8c7352]">Non remboursable</p>
          )}
          {rate.cancellation ? <p className="mt-1 text-xs leading-snug text-[#3d3428]">{rate.cancellation}</p> : null}
          {rate.legalLines.map((line) => (
            <p key={line} className="mt-2 text-[11px] leading-snug text-[#6d6458]">
              {line}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}
