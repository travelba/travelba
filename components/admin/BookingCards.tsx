"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { StayCard } from "@/components/crm/StayCard";
import { stayCardFace } from "@/lib/crm/hotel-arrival";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import type { CrmBookingCard } from "@/lib/crm/types";

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
  const [first, setFirst] = useState(firstName);
  const [last, setLast] = useState(lastName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/cards`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "issue", amount, firstName: first, lastName: last }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(json?.error || "La carte n’a pas pu être créée.");
        return;
      }
      setAmount("");
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
            Autant de cartes que le dossier en a besoin. Chacune est en euros, libellée au prénom et au nom, sans restriction de paiement, et rattachée à Benjamin Boukris.
          </p>
        </div>
        <form className="space-y-3" onSubmit={submit}>
          <label className="block text-sm text-[var(--admin-navy)]">
            Montant (€)
            <input
              className={`${fieldClass} mt-1`}
              inputMode="decimal"
              value={amount}
              disabled={busy}
              required
              aria-label="Montant en euros"
              onChange={(event) => setAmount(event.target.value)}
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
          {error ? <p className="text-sm text-[#8a3b2b]">{error}</p> : null}
          <button
            type="submit"
            className="rounded-full bg-[#0B192C] px-4 py-2 text-sm font-semibold text-[#faf9f6] disabled:opacity-50"
            disabled={busy}
          >
            {busy ? "Génération…" : "Générer la carte"}
          </button>
        </form>
      </section>
      {cards.length ? (
        <ul className="space-y-4">
          {cards.map((card) => (
            <li key={card.id} className="admin-af-card space-y-3 rounded-3xl p-5">
              <div>
                <p className="font-display text-lg font-extrabold tracking-tight text-[var(--admin-navy)]">{card.label}</p>
                <p className="text-sm text-[var(--admin-navy)]/70">
                  {formatMoney(card.limit_cents / 100, card.currency || "EUR")} · du {formatDateFr(card.valid_from)} au{" "}
                  {formatDateFr(card.valid_to)}
                </p>
              </div>
              <StayCard
                personal
                face={stayCardFace({
                  itemId: card.id,
                  hotel: "",
                  holder: `${card.first_name} ${card.last_name}`.trim(),
                  last4: null,
                  closed: false,
                })}
                revealUrl={`/api/admin/bookings/${bookingId}/cards`}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--admin-navy)]/70">Aucune carte sur ce dossier.</p>
      )}
    </div>
  );
}
