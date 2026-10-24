"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { OutgoingRow, type TargetOption } from "@/components/admin/OutgoingAttach";
import { BusyBar } from "@/components/crm/BusyBar";
import { StatusChip } from "@/components/crm/ui";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import type { PliantCardRecap } from "@/lib/crm/pliant-booking";
import { pliantCategoryLabel, pliantSignedCents, pliantStatusLabel, pliantStatusTone, pliantTypeLabel } from "@/lib/crm/pliant-tx";
import {
  costPlacements,
  pendingCostLines,
  revolutLinkedWithoutCost,
  spendAwaitsAttach,
  spendReconcileState,
} from "@/lib/crm/trip-cost-lines";
import {
  TRIP_ACCOUNTING_LABELS,
  settlementLabel,
  type TripAccountingState,
  type TripAccountingView,
  type TripCost,
} from "@/lib/crm/trip-costs";

function eur(value: number) {
  return formatMoney(value, "EUR");
}

function money(cents: number, currency: string | null) {
  try {
    return formatMoney(cents / 100, currency || "EUR");
  } catch {
    return formatMoney(cents / 100, "EUR");
  }
}

function marginTone(margin: number) {
  return margin < 0 ? "text-[var(--admin-red)]" : "text-[var(--admin-navy)]";
}

function stateTone(state: TripAccountingState): "sky" | "gold" | "green" {
  if (state === "comptabilise") return "green";
  if (state === "pointe") return "gold";
  return "sky";
}

function spendAmount(row: PliantCardRecap["spends"][number]) {
  const status = (row.status || "").toUpperCase();
  if (status === "DECLINED" || status === "REVERSED") return "—";
  const signed = pliantSignedCents(row.type, row.billingCents);
  if (signed == null || signed === 0) return "—";
  return money(signed, row.currency);
}

/** « Carte Pliant ···· 5454 · HASSLER ROMA · 10/10/2026 » : le mode de règlement d’abord, c’est ce que la compta pointe. */
function costCaption(cost: TripCost) {
  return [
    cost.state === "pending" ? "En attente" : "",
    settlementLabel(cost),
    cost.supplier || "—",
    cost.occurredOn ? formatDateFr(cost.occurredOn) : "",
    cost.originalCurrency && cost.originalCurrency !== "EUR" && cost.originalAmount != null
      ? formatMoney(cost.originalAmount, cost.originalCurrency)
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Coût synthétique, lu avant l’écriture en base : pas de Retirer ni de Déplacer. */
function costPersisted(cost: TripCost) {
  return !cost.id.startsWith("pending:");
}

/**
 * Coûts du voyage : une seule liste de sorties (Pliant et Revolut) avec un seul geste, Rattacher ;
 * puis chaque ligne vendue avec ses coûts et sa marge. Rien ne part au client.
 */
export function TripCostsBlock({
  bookingId,
  booking,
  view,
  cards,
  revolutLinked,
  busy,
  showMargins = true,
}: {
  bookingId: string;
  booking: TargetOption;
  view: TripAccountingView;
  cards: PliantCardRecap[];
  /** Débits Revolut rattachés au dossier (libellé déjà formé, montant signé). */
  revolutLinked: { id: string; label: string; amount: string }[];
  busy: boolean;
  showMargins?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);

  const pending = useMemo(() => pendingCostLines({ proposed: view.proposed, cards, bookingId }), [view.proposed, cards, bookingId]);
  const placements = useMemo(() => costPlacements(view), [view]);
  const legacyRevolut = useMemo(() => revolutLinkedWithoutCost(revolutLinked, placements), [revolutLinked, placements]);

  async function post(key: string, body: Record<string, unknown>, failure: string) {
    setWorking(key);
    setError(null);
    try {
      const res = await fetch("/api/admin/comptabilite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(json?.error || failure);
        return;
      }
      setMoving(null);
      router.refresh();
    } catch {
      setError("Connexion interrompue. Réessayez.");
    } finally {
      setWorking(null);
    }
  }

  function detach(costId: string) {
    return post(costId, { action: "detach", cost_id: costId }, "Le coût n’a pas pu être retiré.");
  }

  function restore(source: "pliant" | "revolut", id: string) {
    return post(`${source}:${id}`, { source, id, action: "restore" }, "La sortie n’a pas pu revenir dans la file.");
  }

  /** Lignes vendues qui peuvent recevoir un coût : cartes et dépenses au livre, puis le séjour s’il y est. */
  const retargets = view.lines
    .filter((line) => line.itemId || line.nature === "stay")
    .map((line) => ({ value: line.itemId || "", label: line.label }));

  const locked = busy || working != null;

  return (
    <section className="admin-af-card space-y-5 rounded-3xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-label text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold-dark)]">
            Coûts du voyage
          </p>
          <p className="text-sm text-muted">
            {showMargins
              ? "Les sorties Pliant et Revolut se rattachent à une ligne vendue, au clic. La marge part sur la facture MB3M. Le client ne voit que la vente."
              : "Les ventes du séjour."}
          </p>
        </div>
        <StatusChip tone={stateTone(view.state)}>{TRIP_ACCOUNTING_LABELS[view.state]}</StatusChip>
      </div>

      {showMargins && pending.length ? (
        <div className="rounded-2xl border border-[var(--admin-gold)]/50 bg-[#fbf7ef] px-4 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--admin-gold-dark)]">
            {pending.length > 1 ? `${pending.length} sorties à rattacher` : "Une sortie à rattacher"}
          </p>
          <ul>
            {pending.map((line) => (
              <OutgoingRow key={`${line.source}-${line.id}`} line={line} fixedBooking={booking} allowOutside />
            ))}
          </ul>
        </div>
      ) : null}

      {showMargins && cards.length ? (
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Cartes Pliant du dossier</p>
          {cards.map((card) => {
            const rows = card.spends.filter((row) => !spendAwaitsAttach(spendReconcileState(row, bookingId)));
            return (
              <article key={card.pliantCardId} className="rounded-2xl bg-white/70 px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-display text-base font-bold text-[var(--admin-navy)]">
                    {card.label}
                    {card.last4 ? <span className="ml-2 text-sm font-normal tabular-nums text-muted">···· {card.last4}</span> : null}
                  </p>
                  <p className="text-sm text-muted">
                    {card.ceilingCents != null ? `Plafond ${formatMoney(card.ceilingCents / 100, card.currency)} · ` : null}
                    Dépensé {formatMoney(card.spentCents / 100, card.currency)}
                  </p>
                </div>
                {rows.length ? (
                  <ul className="mt-2 divide-y divide-[#e7e1d6]">
                    {rows.map((row) => {
                      const state = spendReconcileState(row, bookingId);
                      const placement = placements.get(`pliant:${row.id}`) || null;
                      const meta = [
                        formatDateFr(row.bookedAt),
                        pliantTypeLabel(row.type),
                        pliantCategoryLabel(row.category || null),
                        row.holderName?.trim() || "",
                      ]
                        .filter(Boolean)
                        .join(" · ");
                      return (
                        <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
                          <div className="min-w-0">
                            <p className="font-medium text-[var(--admin-navy)]">{row.merchant?.trim() || "Dépense"}</p>
                            <p className="text-xs text-muted">{meta}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                              <StatusChip tone={pliantStatusTone(row.status)}>{pliantStatusLabel(row.status)}</StatusChip>
                              {state === "here" ? (
                                <span className="font-semibold text-[var(--admin-navy)]">
                                  {placement?.lineLabel ? `Rattachée · ${placement.lineLabel}` : placement ? "Rattachée · coût sans vente" : "Rattachée"}
                                </span>
                              ) : null}
                              {state === "elsewhere" && row.matchedBookingId ? (
                                <span className="font-semibold text-[var(--admin-navy)]">
                                  Rattachée ·{" "}
                                  <Link href={`/admin/reservations/${row.matchedBookingId}?tab=reglement`} className="text-[#9e7e51] underline">
                                    {row.matchedReference || "autre réservation"}
                                  </Link>
                                </span>
                              ) : null}
                              {state === "ignored" ? <span className="text-muted">Hors voyage</span> : null}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <p className="font-semibold tabular-nums text-[var(--admin-navy)]">{spendAmount(row)}</p>
                            {state === "here" && placement ? (
                              <button
                                type="button"
                                disabled={locked}
                                onClick={() => void detach(placement.cost.id)}
                                className="text-xs text-[#9e7e51] underline disabled:opacity-50"
                              >
                                Retirer
                              </button>
                            ) : null}
                            {state === "ignored" ? (
                              <button
                                type="button"
                                disabled={locked}
                                onClick={() => void restore("pliant", row.id)}
                                className="text-xs text-[#9e7e51] underline disabled:opacity-50"
                              >
                                Remettre dans la file
                              </button>
                            ) : null}
                            <BusyBar active={working === placement?.cost.id || working === `pliant:${row.id}`} label="En cours…" />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted">
                    {card.spends.length ? "Toutes les transactions de cette carte attendent ci-dessus." : "Aucune transaction sur cette carte."}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      ) : null}

      {view.lines.length ? (
        <>
        <ul className="space-y-3 lg:hidden">
          {view.lines.map((line) => {
            const piece = view.invoice.byTransaction[line.transactionId];
            return (
              <li key={line.transactionId} className="rounded-2xl border border-border px-3 py-3 text-sm">
                <p className="break-words font-medium text-[var(--admin-navy)]">{line.label}</p>
                <dl className={`mt-2 grid gap-2 ${showMargins ? "grid-cols-3" : "grid-cols-1"}`}>
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">Vendu</dt>
                    <dd className="font-semibold tabular-nums text-[var(--admin-navy)]">{eur(line.sale)}</dd>
                  </div>
                  {showMargins ? (
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">Coût</dt>
                      <dd className="font-semibold tabular-nums text-[var(--admin-navy)]">{eur(line.cost)}</dd>
                    </div>
                  ) : null}
                  {showMargins ? (
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">Marge</dt>
                      <dd className={`font-semibold tabular-nums ${marginTone(line.margin)}`}>{eur(line.margin)}</dd>
                    </div>
                  ) : null}
                </dl>
                {showMargins && line.costs.length ? (
                  <ul className="mt-2 space-y-1">
                    {line.costs.map((cost) => (
                      <li key={cost.id} className="flex flex-wrap items-center gap-2 text-xs text-muted">
                        <span className="min-w-0 break-words">{costCaption(cost)}</span>
                        <span className="tabular-nums">{eur(cost.amountEur)}</span>
                        {costPersisted(cost) ? (
                          <button
                            type="button"
                            disabled={locked}
                            onClick={() => void detach(cost.id)}
                            className="admin-tap text-[#9e7e51] underline disabled:opacity-50"
                          >
                            Retirer
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  showMargins ? <p className="mt-2 text-xs text-muted">Aucun coût rattaché</p> : null
                )}
                <p className="mt-2 text-xs text-muted">
                  {piece ? `Facture n° ${piece.number} · ${piece.printed ? "imprimée" : "pro forma"}` : "Facture —"}
                </p>
              </li>
            );
          })}
          <li className="rounded-2xl bg-[var(--admin-sky)]/60 px-3 py-3 text-sm font-semibold text-[var(--admin-navy)]">
            <p>Total</p>
            <dl className={`mt-2 grid gap-2 font-semibold ${showMargins ? "grid-cols-3" : "grid-cols-1"}`}>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">Vendu</dt>
                <dd className="tabular-nums">{eur(view.totals.sale)}</dd>
              </div>
              {showMargins ? (
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">Coût</dt>
                  <dd className="tabular-nums">{eur(view.totals.cost)}</dd>
                </div>
              ) : null}
              {showMargins ? (
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted">Marge</dt>
                  <dd className={`tabular-nums ${marginTone(view.totals.margin)}`}>{eur(view.totals.margin)}</dd>
                </div>
              ) : null}
            </dl>
          </li>
        </ul>
        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-full text-left text-sm">
            <thead className="font-label text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
              <tr>
                <th className="py-2 pr-3">Vente</th>
                <th className="py-2 pr-3 text-right">Vendu</th>
                {showMargins ? <th className="py-2 pr-3 text-right">Coût</th> : null}
                {showMargins ? <th className="py-2 pr-3 text-right">Marge</th> : null}
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
                      {showMargins && line.costs.length ? (
                        <ul className="mt-1 space-y-0.5">
                          {line.costs.map((cost) => (
                            <li key={cost.id} className="flex flex-wrap items-center gap-2 text-xs text-muted">
                              <span>{costCaption(cost)}</span>
                              <span className="tabular-nums">{eur(cost.amountEur)}</span>
                              {costPersisted(cost) ? (
                                <button
                                  type="button"
                                  disabled={locked}
                                  onClick={() => void detach(cost.id)}
                                  className="text-[#9e7e51] underline disabled:opacity-50"
                                >
                                  Retirer
                                </button>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        showMargins ? <p className="mt-1 text-xs text-muted">Aucun coût rattaché</p> : null
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-[var(--admin-navy)]">{eur(line.sale)}</td>
                    {showMargins ? (
                      <td className="py-2 pr-3 text-right tabular-nums text-[var(--admin-navy)]">{eur(line.cost)}</td>
                    ) : null}
                    {showMargins ? (
                      <td className={`py-2 pr-3 text-right font-semibold tabular-nums ${marginTone(line.margin)}`}>
                        {eur(line.margin)}
                      </td>
                    ) : null}
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
                {showMargins ? <td className="py-2 pr-3 text-right tabular-nums">{eur(view.totals.cost)}</td> : null}
                {showMargins ? (
                  <td className={`py-2 pr-3 text-right tabular-nums ${marginTone(view.totals.margin)}`}>
                    {eur(view.totals.margin)}
                  </td>
                ) : null}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        </>
      ) : (
        <p className="text-sm text-muted">Aucune vente au grand livre pour ce séjour. Les coûts se rattachent quand même.</p>
      )}

      {showMargins && view.unsold.length ? (
        <div className="rounded-2xl bg-[var(--admin-sky)]/60 px-4 py-3 text-sm">
          <p className="font-semibold text-[var(--admin-navy)]">
            {view.unsold.every((cost) => cost.state === "pending")
              ? "Dépenses en attente"
              : `Coûts sans vente (${eur(view.totals.unsoldCost)})`}
          </p>
          <p className="text-xs text-muted">
            {view.unsold.some((cost) => cost.state === "pending")
              ? "Une autorisation de carte n’est pas encore réglée. Le montant en euros se confirme au règlement de Pliant."
              : "Ce coût ne tient à aucune ligne vendue : le séjour n’est pas visible, la ligne n’est pas au grand livre, ou le coût est posé sur le montant du séjour alors que les cartes sont vendues une à une. Déplacez-le sur la bonne ligne."}
          </p>
          <ul className="mt-2 space-y-2">
            {view.unsold.map((cost) => (
              <li key={cost.id} className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span>{costCaption(cost)}</span>
                  <span className="tabular-nums">{eur(cost.amountEur)}</span>
                  {costPersisted(cost) && retargets.length ? (
                    <button
                      type="button"
                      disabled={locked}
                      aria-expanded={moving === cost.id}
                      onClick={() => setMoving((current) => (current === cost.id ? null : cost.id))}
                      className="rounded-full bg-[#0B192C] px-3 py-1 text-xs font-semibold text-[#faf9f6] disabled:opacity-50"
                    >
                      Déplacer
                    </button>
                  ) : null}
                  {costPersisted(cost) ? (
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => void detach(cost.id)}
                      className="text-[#9e7e51] underline disabled:opacity-50"
                    >
                      Retirer
                    </button>
                  ) : null}
                </div>
                {moving === cost.id ? (
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Ligne vendue">
                    {retargets.map((option) => (
                      <button
                        key={option.value || "__stay__"}
                        type="button"
                        disabled={locked}
                        onClick={() =>
                          void post(
                            cost.id,
                            { action: "retarget", cost_id: cost.id, item_id: option.value || null },
                            "Le coût n’a pas pu être déplacé."
                          )
                        }
                        className="rounded-full border border-[var(--admin-navy)] bg-white px-3 py-1 text-xs font-semibold text-[var(--admin-navy)] disabled:opacity-50"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : null}
                <BusyBar active={working === cost.id} label="En cours…" />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {legacyRevolut.length ? (
        <div className="space-y-1 rounded-2xl bg-white/70 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Débits Revolut rattachés au dossier</p>
          <ul className="space-y-1">
            {legacyRevolut.map((row) => (
              <li key={row.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{row.label}</span>
                <span className="shrink-0 font-semibold tabular-nums">{row.amount}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">Rattachés avant la comptabilité du voyage : sans ligne vendue, ils n’entrent pas dans la marge.</p>
        </div>
      ) : null}

      {view.anomalies.map((text) => (
        <p key={text} className="text-xs text-[var(--admin-red)]">
          {text}
        </p>
      ))}
      {error ? (
        <p role="alert" className="text-sm text-[var(--admin-red)]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
