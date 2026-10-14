"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { OutgoingRow, type TargetOption } from "@/components/admin/OutgoingAttach";
import { StatusChip } from "@/components/crm/ui";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import {
  TRIP_ACCOUNTING_LABELS,
  type AccountedLine,
  type OutgoingLine,
  type TripAccountingState,
  type TripAccountingTotals,
  type TripCost,
} from "@/lib/crm/trip-costs";

export type TripAccountingView = {
  lines: AccountedLine[];
  unsold: TripCost[];
  totals: TripAccountingTotals;
  proposed: OutgoingLine[];
  state: TripAccountingState;
  invoice: {
    number: string | null;
    printed: boolean;
    marginStale: boolean;
    /** Lignes couvertes par une facture imprimée (id de transaction → n°). */
    byTransaction: Record<string, { number: string; printed: boolean }>;
    /** Somme des factures imprimées non annulées par un avoir. */
    printedTotal: number | null;
  };
  anomalies: string[];
};

function eur(value: number) {
  return formatMoney(value, "EUR");
}

function marginTone(margin: number) {
  if (margin < 0) return "text-[var(--admin-red)]";
  return "text-[var(--admin-navy)]";
}

function stateTone(state: TripAccountingState): "sky" | "gold" | "green" {
  if (state === "comptabilise") return "green";
  if (state === "pointe") return "gold";
  return "sky";
}

export function TripAccountingBlock({
  bookingId,
  booking,
  view,
  busy,
  onBusy,
}: {
  bookingId: string;
  booking: TargetOption;
  view: TripAccountingView;
  busy: boolean;
  onBusy: (active: boolean) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  async function costAction(costId: string, body: Record<string, unknown>, failure: string) {
    setWorking(costId);
    setError(null);
    try {
      const res = await fetch("/api/admin/comptabilite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cost_id: costId, ...body }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(json?.error || failure);
        return;
      }
      router.refresh();
    } catch {
      setError("Connexion interrompue. Réessayez.");
    } finally {
      setWorking(null);
    }
  }

  function detach(costId: string) {
    return costAction(costId, { action: "detach" }, "Le coût n’a pas pu être retiré.");
  }

  /** Lignes vendues qui peuvent recevoir un coût : cartes et dépenses au livre, puis le séjour s’il y est. */
  const retargets = view.lines
    .filter((line) => line.itemId || line.nature === "stay")
    .map((line) => ({ value: line.itemId || "", label: line.label }));

  async function reissue() {
    onBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/mb3m`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reissue" }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string; creditNote?: string; number?: string } | null;
      if (!res.ok || !json?.number) {
        setError(json?.error || "L’avoir n’a pas abouti.");
        return;
      }
      setNote(
        `Avoir n° ${json.creditNote || "—"} et facture pro forma n° ${json.number} préparés. Les deux se valident dans MB3M.`
      );
      router.refresh();
    } catch {
      setError("L’avoir n’a pas abouti.");
    } finally {
      onBusy(false);
    }
  }

  const control = view.invoice.printedTotal == null ? null : Math.abs(view.invoice.printedTotal - view.totals.sale) < 0.005;

  return (
    <section className="order-2 admin-af-card space-y-4 rounded-3xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-label text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold-dark)]">
            Comptabilité du voyage
          </p>
          <p className="text-sm text-muted">
            Une ligne par vente. Les coûts Pliant et Revolut s’y rattachent ; la marge part sur la facture MB3M. Le client
            ne voit que la vente.
          </p>
        </div>
        <StatusChip tone={stateTone(view.state)}>{TRIP_ACCOUNTING_LABELS[view.state]}</StatusChip>
      </div>

      {view.proposed.length ? (
        <div className="rounded-2xl border border-[var(--admin-gold)]/50 bg-[#fbf7ef] px-4 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--admin-gold-dark)]">
            Sorties proposées pour ce voyage
          </p>
          <ul className="divide-y divide-[#e7e1d6]">
            {view.proposed.map((line) => (
              <OutgoingRow key={`${line.source}-${line.id}`} line={line} fixedBooking={booking} />
            ))}
          </ul>
        </div>
      ) : null}

      {view.lines.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="font-label text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
              <tr>
                <th className="py-2 pr-3">Vente</th>
                <th className="py-2 pr-3 text-right">Vendu</th>
                <th className="py-2 pr-3 text-right">Coût</th>
                <th className="py-2 pr-3 text-right">Marge</th>
                <th className="py-2">Facture</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {view.lines.map((line) => {
                const piece = view.invoice.byTransaction[line.transactionId];
                return (
                  <tr key={line.transactionId} className="align-top">
                    <td className="py-2 pr-3">
                      <p className="font-medium text-[var(--admin-navy)]">{line.label}</p>
                      {line.costs.length ? (
                        <ul className="mt-1 space-y-0.5">
                          {line.costs.map((cost) => (
                            <li key={cost.id} className="flex flex-wrap items-center gap-2 text-xs text-muted">
                              <span>
                                {cost.source === "pliant" ? "Pliant" : "Revolut"} · {cost.supplier || "—"}
                                {cost.occurredOn ? ` · ${formatDateFr(cost.occurredOn)}` : ""}
                                {cost.originalCurrency && cost.originalCurrency !== "EUR" && cost.originalAmount != null
                                  ? ` · ${formatMoney(cost.originalAmount, cost.originalCurrency)}`
                                  : ""}
                              </span>
                              <span className="tabular-nums">{eur(cost.amountEur)}</span>
                              <button
                                type="button"
                                disabled={working === cost.id || busy}
                                onClick={() => void detach(cost.id)}
                                className="text-[#9e7e51] underline disabled:opacity-50"
                              >
                                Retirer
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-xs text-muted">Aucun coût rattaché</p>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-[var(--admin-navy)]">{eur(line.sale)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-[var(--admin-navy)]">{eur(line.cost)}</td>
                    <td className={`py-2 pr-3 text-right font-semibold tabular-nums ${marginTone(line.margin)}`}>{eur(line.margin)}</td>
                    <td className="py-2 text-xs text-muted">
                      {piece ? `n° ${piece.number} · ${piece.printed ? "imprimée" : "pro forma"}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-[var(--admin-navy)]/20 font-semibold text-[var(--admin-navy)]">
              <tr>
                <td className="py-2 pr-3">Total</td>
                <td className="py-2 pr-3 text-right tabular-nums">{eur(view.totals.sale)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{eur(view.totals.cost)}</td>
                <td className={`py-2 pr-3 text-right tabular-nums ${marginTone(view.totals.margin)}`}>{eur(view.totals.margin)}</td>
                <td className="py-2 text-xs font-normal text-muted">
                  {control == null ? "" : control ? "Égal aux transactions du client" : "Différent des transactions du client"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted">Aucune vente au grand livre pour ce séjour. Les coûts se rattachent quand même.</p>
      )}

      {view.unsold.length ? (
        <div className="rounded-2xl bg-[var(--admin-sky)]/60 px-4 py-3 text-sm">
          <p className="font-semibold text-[var(--admin-navy)]">Coûts sans vente ({eur(view.totals.unsoldCost)})</p>
          <p className="text-xs text-muted">
            Ce coût ne tient à aucune ligne vendue : le séjour n’est pas visible, la ligne n’est pas au grand livre, ou le coût
            est posé sur le montant du séjour alors que les cartes sont vendues une à une. Choisissez la ligne. La facture attend.
          </p>
          <ul className="mt-1 space-y-0.5">
            {view.unsold.map((cost) => (
              <li key={cost.id} className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>
                  {cost.source === "pliant" ? "Pliant" : "Revolut"} · {cost.supplier || "—"}
                  {cost.occurredOn ? ` · ${formatDateFr(cost.occurredOn)}` : ""}
                </span>
                <span className="tabular-nums">{eur(cost.amountEur)}</span>
                {retargets.length ? (
                  <label className="inline-flex items-center gap-1">
                    <span>Rattacher à</span>
                    <select
                      aria-label="Ligne vendue"
                      disabled={working === cost.id || busy}
                      defaultValue=""
                      onChange={(event) => {
                        const value = event.target.value;
                        if (value === "") return;
                        void costAction(
                          cost.id,
                          { action: "retarget", item_id: value === "__stay__" ? null : value },
                          "Le coût n’a pas pu être déplacé."
                        );
                      }}
                      className="rounded-lg border border-[var(--border)] bg-white px-2 py-1 text-xs text-[var(--admin-navy)]"
                    >
                      <option value="">Choisir…</option>
                      {retargets.map((option) => (
                        <option key={option.value || "__stay__"} value={option.value || "__stay__"}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <button
                  type="button"
                  disabled={working === cost.id || busy}
                  onClick={() => void detach(cost.id)}
                  className="text-[#9e7e51] underline disabled:opacity-50"
                >
                  Retirer
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {view.anomalies.map((text) => (
        <p key={text} className="text-xs text-[var(--admin-red)]">
          {text}
        </p>
      ))}

      {view.invoice.printed && view.invoice.marginStale ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--admin-red)]/40 px-4 py-3">
          <p className="text-sm text-[var(--admin-navy)]">
            <span className="font-semibold">Marge à corriger.</span> La facture n° {view.invoice.number} est imprimée avec une
            autre marge.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void reissue()}
            className="admin-tap rounded-full border border-[var(--admin-navy)] bg-white px-4 py-2 text-sm font-semibold text-[var(--admin-navy)] disabled:opacity-50"
          >
            Avoir et nouvelle facture
          </button>
        </div>
      ) : null}
      {note ? <p className="text-sm text-[var(--admin-navy)]">{note}</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-[var(--admin-red)]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
