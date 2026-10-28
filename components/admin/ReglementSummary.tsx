import { StatusChip } from "@/components/crm/ui";
import { formatMoney } from "@/lib/crm/money";
import type { ReglementCheck } from "@/lib/crm/reglement-checklist";
import { TRIP_ACCOUNTING_LABELS, type TripAccountingState, type TripAccountingTotals } from "@/lib/crm/trip-costs";

function stateTone(state: TripAccountingState): "sky" | "gold" | "green" {
  if (state === "comptabilise") return "green";
  if (state === "pointe") return "gold";
  return "sky";
}

function checkDot(state: ReglementCheck["state"]) {
  if (state === "done") return "bg-[var(--admin-gold)]";
  if (state === "todo") return "bg-white shadow-[inset_0_0_0_1.5px_var(--admin-red)]";
  return "bg-[var(--border)]";
}

/**
 * En tête de Règlement : le montant, ce qui est au grand livre, la marge et ce qui attend l’agent.
 * Une lecture, pas une saisie.
 */
export function ReglementSummary({
  amount,
  currency,
  ledgerCaption,
  payerCaption,
  totals,
  state,
  invoiceNumber,
  checks,
  commissionCaption = null,
}: {
  amount: number;
  currency: string;
  ledgerCaption: string;
  payerCaption: string;
  totals: TripAccountingTotals | null;
  state: TripAccountingState | null;
  invoiceNumber: string | null;
  checks: ReglementCheck[];
  commissionCaption?: string | null;
}) {
  const todo = checks.filter((check) => check.state === "todo").length;
  return (
    <section className="admin-af-card space-y-4 rounded-3xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-label text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold-dark)]">
            Montant du séjour
          </p>
          <p className="font-display text-3xl font-extrabold leading-tight text-[var(--admin-navy)]">
            {formatMoney(amount, currency)}
          </p>
          <p className="mt-1 text-sm text-muted">
            {payerCaption} · {ledgerCaption}
          </p>
          {commissionCaption ? <p className="mt-1 text-sm font-semibold text-[var(--admin-navy)]">{commissionCaption}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {state ? <StatusChip tone={stateTone(state)}>{TRIP_ACCOUNTING_LABELS[state]}</StatusChip> : null}
          {invoiceNumber ? <StatusChip tone="sky">Facture n° {invoiceNumber}</StatusChip> : null}
        </div>
      </div>

      {totals ? (
        <dl className="grid grid-cols-1 gap-3 rounded-2xl bg-[var(--admin-sky)]/60 px-4 py-3 text-sm min-[420px]:grid-cols-3">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Vendu au livre</dt>
            <dd className="font-semibold tabular-nums text-[var(--admin-navy)]">{formatMoney(totals.sale, "EUR")}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Coûts</dt>
            <dd className="font-semibold tabular-nums text-[var(--admin-navy)]">{formatMoney(totals.cost, "EUR")}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Marge directe</dt>
            <dd className="font-semibold tabular-nums text-[var(--admin-navy)]">{formatMoney(totals.direct, "EUR")}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Commission fournisseur</dt>
            <dd className="font-semibold tabular-nums text-[var(--admin-navy)]">{formatMoney(totals.commission, "EUR")}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Marge</dt>
            <dd
              className={`font-semibold tabular-nums ${
                totals.margin < 0 ? "text-[var(--admin-red)]" : "text-[var(--admin-navy)]"
              }`}
            >
              {formatMoney(totals.margin, "EUR")}
            </dd>
          </div>
        </dl>
      ) : null}

      <ul className="flex flex-wrap gap-x-5 gap-y-2" aria-label={todo ? `${todo} à faire sur le règlement` : "Règlement à jour"}>
        {checks.map((check) => (
          <li key={check.id} className="flex items-center gap-2 text-sm">
            <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${checkDot(check.state)}`} />
            <span
              className={
                check.state === "todo"
                  ? "font-semibold text-[var(--admin-navy)]"
                  : check.state === "done"
                    ? "text-[var(--admin-navy)]"
                    : "text-muted"
              }
            >
              {check.label}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
