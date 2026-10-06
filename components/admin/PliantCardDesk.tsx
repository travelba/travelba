"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { StayCard } from "@/components/crm/StayCard";
import { parseEurosToCents } from "@/lib/crm/hotel-arrival";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import { pliantSignedCents, pliantStatusLabel } from "@/lib/crm/pliant-tx";
import type { PliantSpendLine } from "@/lib/crm/pliant-cards";
import type { StayCardFace } from "@/lib/crm/hotel-arrival";

function issuedTransactionLine(count: number | null | undefined, cents: number | null | undefined, currency: string) {
  const bits: string[] = [];
  if (typeof count === "number" && count > 0 && count < 999_999_999) {
    bits.push(count === 1 ? "1 transaction" : `${count.toLocaleString("fr-FR")} transactions`);
  }
  if (typeof cents === "number" && cents > 0) bits.push(`${formatMoney(cents / 100, currency)} par transaction`);
  return bits.join(" · ");
}

export function PliantAccountBalance({
  account,
}: {
  account: { availableCents: number | null; currency: string } | null;
}) {
  if (!account) return null;
  return (
    <p className="text-sm text-[var(--admin-navy)]">
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Solde du compte</span>
      <span className="mt-0.5 block font-display text-2xl font-extrabold tabular-nums">
        {account.availableCents == null ? "Indisponible" : formatMoney(account.availableCents / 100, account.currency)}
      </span>
    </p>
  );
}

export function PliantCardDesk({
  mode,
  bookingId = null,
  customerId = null,
  cardId = null,
  face,
  ceilingCents = null,
  currency = "EUR",
  locked = false,
  closed = false,
  revealUrl = "",
  account = null,
  spends = [],
  views = [],
  designation = null,
  transactionCount = null,
  transactionLimitCents = null,
}: {
  mode: "booking" | "customer";
  bookingId?: string | null;
  customerId?: string | null;
  cardId?: string | null;
  face: StayCardFace;
  ceilingCents?: number | null;
  currency?: string;
  locked?: boolean;
  closed?: boolean;
  revealUrl?: string;
  account?: { availableCents: number | null; currency: string } | null;
  spends?: PliantSpendLine[];
  views?: { name: string; at: string }[];
  designation?: string | null;
  transactionCount?: number | null;
  transactionLimitCents?: number | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(ceilingCents != null ? (ceilingCents / 100).toFixed(2).replace(".", ",") : "");
  const [note, setNote] = useState("");
  const [transactionAmount, setTransactionAmount] = useState("");
  const [transactionCountInput, setTransactionCountInput] = useState("");
  const ceilingLabel = ceilingCents != null && ceilingCents > 0 ? formatMoney(ceilingCents / 100, currency) : null;
  const issuedTransactions = issuedTransactionLine(transactionCount, transactionLimitCents, currency);
  const draftCeiling = parseEurosToCents(limit);
  const draftAmount = parseEurosToCents(transactionAmount);
  const draftCount = Number(transactionCountInput.replace(/\s/g, ""));
  const draftTransactions = issuedTransactionLine(
    Number.isInteger(draftCount) && draftCount > 0 ? draftCount : null,
    draftAmount,
    currency
  );

  async function post(body: Record<string, unknown>, failure: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/pliant/cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(json?.error || failure);
        return;
      }
      router.refresh();
    } catch {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  function changeLimit(event: FormEvent) {
    event.preventDefault();
    if (!cardId || busy) return;
    void post({ action: "limit", cardId, limit }, "Pliant n’a pas modifié le plafond.");
  }

  return (
    <div className="space-y-4">
      <PliantAccountBalance account={account} />
      {cardId ? (
        <StayCard
          face={face}
          revealUrl={revealUrl}
          ceilingLabel={ceilingLabel}
          locked={locked}
          sealed={!revealUrl}
          views={views}
          title={designation || undefined}
        />
      ) : (
        <div className="max-w-[22rem] rounded-[1.15rem] border border-dashed border-[#C5A880] bg-[#0B192C] p-5 text-white">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#C5A880]">Travelba</p>
          <p className="mt-1 break-words text-sm font-semibold">
            {note.trim() || "Nom de la carte"}
          </p>
          {mode === "booking" ? (
            <p className="mt-4 text-sm text-white/70">Le plafond se calcule avec le prix de l’hôtel, plus 30 %.</p>
          ) : draftCeiling || draftTransactions ? (
            <div className="mt-4">
              {draftCeiling ? (
                <p>
                  <span className="text-[9px] uppercase tracking-[0.14em] text-white/50">Plafond</span>
                  <span className="block text-lg font-semibold tabular-nums">
                    {formatMoney(draftCeiling / 100, currency)}
                  </span>
                </p>
              ) : null}
              {draftTransactions ? <p className="mt-2 text-sm text-white/70">{draftTransactions}</p> : null}
            </div>
          ) : (
            <p className="mt-4 text-sm text-white/70">
              Indiquez le plafond, le montant par transaction et le nombre de transactions.
            </p>
          )}
        </div>
      )}
      {cardId && !closed ? (
        <form className="flex max-w-md flex-wrap items-end gap-2" onSubmit={changeLimit}>
          <label className="text-sm text-[var(--admin-navy)]">
            Nouveau plafond
            <input
              className="mt-1 w-36 rounded-xl border border-[#e5e3dc] bg-white px-3 py-2 text-sm outline-none focus:border-[#0B192C]"
              inputMode="decimal"
              value={limit}
              onChange={(event) => setLimit(event.target.value)}
              aria-label="Nouveau plafond"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-[#0B192C] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "…" : "Modifier le plafond"}
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded-full border border-[#0B192C] px-4 py-2 text-sm font-semibold text-[#0B192C] disabled:opacity-60"
            onClick={() =>
              void post(
                { action: locked ? "unlock" : "lock", cardId },
                locked ? "Pliant n’a pas débloqué la carte." : "Pliant n’a pas bloqué la carte."
              )
            }
          >
            {locked ? "Débloquer la carte" : "Bloquer la carte"}
          </button>
        </form>
      ) : null}
      {cardId && issuedTransactions ? <p className="text-sm text-[var(--admin-navy)]/70">{issuedTransactions}</p> : null}
      {!cardId && mode === "booking" && bookingId ? (
        <button
          type="button"
          disabled={busy}
          className="rounded-full bg-[#0B192C] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          onClick={() => void post({ action: "issue", bookingId }, "Pliant n’a pas créé la carte.")}
        >
          {busy ? "…" : "Générer la carte"}
        </button>
      ) : null}
      {!cardId && mode === "customer" && customerId ? (
        <form
          className="flex max-w-md flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void post(
              {
                action: "issue",
                customerId,
                limit,
                designation: note,
                transactionAmount,
                transactionCount: transactionCountInput,
              },
              "Pliant n’a pas créé la carte."
            );
          }}
        >
          <label className="basis-full text-sm text-[var(--admin-navy)]">
            Nom de la carte
            <input
              className="mt-1 w-full rounded-xl border border-[#e5e3dc] bg-white px-3 py-2 text-sm outline-none focus:border-[#0B192C]"
              value={note}
              required
              maxLength={40}
              onChange={(event) => setNote(event.target.value)}
              aria-label="Nom de la carte"
            />
          </label>
          <label className="text-sm text-[var(--admin-navy)]">
            Montant par transaction
            <input
              className="mt-1 w-36 rounded-xl border border-[#e5e3dc] bg-white px-3 py-2 text-sm outline-none focus:border-[#0B192C]"
              inputMode="decimal"
              value={transactionAmount}
              onChange={(event) => setTransactionAmount(event.target.value)}
              aria-label="Montant par transaction"
              required
            />
          </label>
          <label className="text-sm text-[var(--admin-navy)]">
            Nombre de transactions
            <input
              className="mt-1 w-36 rounded-xl border border-[#e5e3dc] bg-white px-3 py-2 text-sm outline-none focus:border-[#0B192C]"
              inputMode="numeric"
              value={transactionCountInput}
              onChange={(event) => setTransactionCountInput(event.target.value)}
              aria-label="Nombre de transactions"
              required
            />
          </label>
          <label className="text-sm text-[var(--admin-navy)]">
            Plafond
            <input
              className="mt-1 w-36 rounded-xl border border-[#e5e3dc] bg-white px-3 py-2 text-sm outline-none focus:border-[#0B192C]"
              inputMode="decimal"
              value={limit}
              onChange={(event) => setLimit(event.target.value)}
              aria-label="Plafond"
              required
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-[#0B192C] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "…" : "Générer la carte"}
          </button>
        </form>
      ) : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {cardId ? <PliantSpends spends={spends} /> : null}
    </div>
  );
}

function PliantSpends({ spends }: { spends: PliantSpendLine[] }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Dépenses de la carte</p>
      {spends.length ? (
        <ul className="mt-2 divide-y divide-[#e7e1d6] text-sm">
          {spends.map((row) => {
            const signed = pliantSignedCents(row.type, row.billingCents);
            return (
              <li key={row.id} className="flex items-baseline justify-between gap-3 py-2">
                <span>
                  <span className="block font-medium text-[var(--admin-navy)]">{row.merchant || "Dépense"}</span>
                  <span className="text-xs text-muted">
                    {formatDateFr(row.bookedAt)} · {pliantStatusLabel(row.status)}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-[var(--admin-navy)]">
                  {signed == null ? "—" : formatMoney(signed / 100, row.currency || "EUR")}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-[var(--admin-navy)]/70">Aucune dépense sur cette carte.</p>
      )}
    </div>
  );
}
