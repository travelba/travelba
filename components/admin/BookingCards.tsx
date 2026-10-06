"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { StayCard } from "@/components/crm/StayCard";
import { stayCardFace } from "@/lib/crm/hotel-arrival";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import type { CrmBookingCard } from "@/lib/crm/types";

function cardTransactionLine(card: CrmBookingCard) {
  const bits: string[] = [];
  const count = card.max_transaction_count;
  if (typeof count === "number" && count > 0 && count < 999_999_999) {
    bits.push(count === 1 ? "1 transaction" : `${count.toLocaleString("fr-FR")} transactions`);
  }
  if (typeof card.transaction_limit_cents === "number" && card.transaction_limit_cents > 0) {
    bits.push(`${formatMoney(card.transaction_limit_cents / 100, card.currency || "EUR")} par transaction`);
  }
  return bits.length ? ` · ${bits.join(" · ")}` : "";
}

const fieldClass =
  "w-full rounded-xl border border-[#d9d1c3] bg-[#faf9f6] px-3 py-2.5 text-sm text-[#0B192C] outline-none transition placeholder:text-[#3d4654] focus:border-[#0B192C] focus:bg-white";

export function BookingCards({
  bookingId,
  cards,
  firstName,
  lastName,
}: {
  bookingId: string;
  cards: CrmBookingCard[];
  firstName: string;
  lastName: string;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [transactionAmount, setTransactionAmount] = useState("");
  const [transactionCount, setTransactionCount] = useState("");
  const [designation, setDesignation] = useState("");
  const [first, setFirst] = useState(firstName);
  const [last, setLast] = useState(lastName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(cardRowId: string, action: "lock" | "unlock" | "terminate", failure: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/cards`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, itemId: cardRowId }),
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

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/cards`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "issue",
          amount,
          firstName: first,
          lastName: last,
          designation,
          transactionAmount,
          transactionCount,
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(json?.error || "La carte n’a pas pu être créée.");
        return;
      }
      setAmount("");
      setTransactionAmount("");
      setTransactionCount("");
      setDesignation("");
      router.refresh();
    } catch {
      setError("La carte n’a pas pu être créée.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="admin-af-card space-y-4 rounded-3xl p-5">
        <div>
          <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">Générer une carte</h2>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-[var(--admin-navy)]/70">
            Autant de cartes que le dossier en a besoin. Le plafond, chaque transaction, le nom de la carte et le
            titulaire sont ceux saisis ici. Pliant ne bloque ni les catégories (sauf le transfert d’argent), ni les
            devises, ni les pays. La carte est rattachée à Benjamin Boukris.
          </p>
        </div>
        <form className="space-y-3" onSubmit={submit}>
          <label className="block text-sm text-[var(--admin-navy)]">
            Nom de la carte
            <input
              className={`${fieldClass} mt-1`}
              value={designation}
              disabled={busy}
              required
              maxLength={40}
              aria-label="Nom de la carte"
              onChange={(event) => setDesignation(event.target.value)}
            />
            <span className="mt-1 block text-xs text-[var(--admin-navy)]/60">
              Affiché sur la carte et dans Pliant. 40 caractères.
            </span>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-[var(--admin-navy)]">
              Plafond (€)
              <input
                className={`${fieldClass} mt-1`}
                inputMode="decimal"
                value={amount}
                disabled={busy}
                required
                aria-label="Plafond en euros"
                onChange={(event) => setAmount(event.target.value)}
              />
            </label>
            <label className="block text-sm text-[var(--admin-navy)]">
              Montant par transaction (€)
              <input
                className={`${fieldClass} mt-1`}
                inputMode="decimal"
                value={transactionAmount}
                disabled={busy}
                required
                aria-label="Montant par transaction"
                onChange={(event) => setTransactionAmount(event.target.value)}
              />
            </label>
          </div>
          <label className="block text-sm text-[var(--admin-navy)]">
            Nombre de transactions
            <input
              className={`${fieldClass} mt-1`}
              inputMode="numeric"
              value={transactionCount}
              disabled={busy}
              required
              aria-label="Nombre de transactions"
              onChange={(event) => setTransactionCount(event.target.value)}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-[var(--admin-navy)]">
              Nom
              <input
                className={`${fieldClass} mt-1`}
                value={last}
                disabled={busy}
                required
                aria-label="Nom sur la carte"
                onChange={(event) => setLast(event.target.value)}
              />
            </label>
            <label className="block text-sm text-[var(--admin-navy)]">
              Prénom
              <input
                className={`${fieldClass} mt-1`}
                value={first}
                disabled={busy}
                required
                aria-label="Prénom sur la carte"
                onChange={(event) => setFirst(event.target.value)}
              />
            </label>
          </div>
          <button
            type="submit"
            className="rounded-full bg-[#0B192C] px-4 py-2 text-sm font-semibold text-[#faf9f6] disabled:opacity-50"
            disabled={busy}
          >
            {busy ? "Génération…" : "Générer la carte"}
          </button>
        </form>
      </section>
      {cards.some((card) => card.status !== "terminated") ? (
        <ul className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
          {cards
            .filter((card) => card.status !== "terminated")
            .map((card) => (
            <li key={card.id} className="admin-af-card min-w-0 space-y-3 rounded-3xl p-5">
              <div>
                <p className="font-display text-lg font-extrabold tracking-tight text-[var(--admin-navy)]">{card.label}</p>
                <p className="text-sm text-[var(--admin-navy)]/70">
                  {formatMoney(card.limit_cents / 100, card.currency || "EUR")}
                  {cardTransactionLine(card)}
                  {" · "}du {formatDateFr(card.valid_from)} au {formatDateFr(card.valid_to)}
                  {card.status === "locked" ? " · bloquée" : ""}
                </p>
              </div>
              <StayCard
                personal
                title={card.label}
                face={stayCardFace({
                  itemId: card.id,
                  hotel: "",
                  holder: `${card.first_name} ${card.last_name}`.trim(),
                  last4: card.last4,
                  closed: false,
                })}
                revealUrl={`/api/admin/bookings/${bookingId}/cards`}
                locked={card.status === "locked"}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-full border border-[#0B192C] px-4 py-2 text-sm font-semibold text-[#0B192C] disabled:opacity-60"
                  onClick={() =>
                    void act(
                      card.id,
                      card.status === "locked" ? "unlock" : "lock",
                      card.status === "locked" ? "Pliant n’a pas débloqué la carte." : "Pliant n’a pas bloqué la carte."
                    )
                  }
                >
                  {card.status === "locked" ? "Débloquer la carte" : "Bloquer la carte"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-full border border-[#8a3b2b] px-4 py-2 text-sm font-semibold text-[#8a3b2b] disabled:opacity-60"
                  onClick={() => {
                    if (!window.confirm("Supprimer cette carte ? Elle ne pourra plus payer.")) return;
                    void act(card.id, "terminate", "Pliant n’a pas supprimé la carte.");
                  }}
                >
                  Supprimer la carte
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--admin-navy)]/70">Aucune carte sur ce dossier.</p>
      )}
      {error ? <p className="text-sm text-[#8a3b2b]">{error}</p> : null}
    </div>
  );
}
