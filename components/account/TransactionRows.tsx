import { EmptyState } from "@/components/crm/ui";
import { Icon } from "@/components/crm/icons";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import { TX_KIND_LABELS, type CrmTransaction } from "@/lib/crm/types";

export function TransactionRows({
  rows,
  emptyTitle,
  emptyDescription,
}: {
  rows: CrmTransaction[];
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (!rows.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <ul className="space-y-2">
      {rows.map((t) => {
        const credit = t.direction === "credit";
        return (
          <li
            key={t.id}
            className="flex flex-col gap-1 rounded-xl border border-[#e9e8e5]/60 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
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
                    {t.label || TX_KIND_LABELS[t.kind] || t.kind}
                  </p>
                  <p className="text-[13px] text-muted">
                    {credit ? "Reçu le" : "Le"} {formatDateFr(t.occurred_on)}
                  </p>
                  <p className="pt-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">
                    {TX_KIND_LABELS[t.kind]}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end">
                <p className="text-[16px] font-bold tracking-tight text-[var(--admin-navy)]">
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
  );
}
