"use client";

import { useState } from "react";
import { PliantCardFrame } from "@/components/crm/PliantCardFrame";
import { formatMoney } from "@/lib/crm/money";
import type { PliantCardRecap } from "@/lib/crm/pliant-booking";

export function PliantBookingTab({
  bookingId,
  cards,
}: {
  bookingId: string;
  cards: PliantCardRecap[];
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState<{ cardId: string; src: string; frameId: string } | null>(null);

  async function reveal(pliantCardId: string) {
    if (busyId) return;
    setBusyId(pliantCardId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/cards`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "card", pliantCardId }),
      });
      const json = (await res.json().catch(() => null)) as
        | { error?: string; widgetUrl?: string; frameId?: string }
        | null;
      if (!res.ok || !json?.widgetUrl || !json.frameId) {
        setError(json?.error || "La carte n’a pas pu être lue.");
        return;
      }
      setFrame({ cardId: pliantCardId, src: json.widgetUrl, frameId: json.frameId });
    } catch {
      setError("La carte n’a pas pu être lue.");
    } finally {
      setBusyId(null);
    }
  }
  if (!cards.length) {
    return (
      <section className="admin-af-card rounded-3xl p-5">
        <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">Pliant</h2>
        <p className="mt-2 text-sm text-muted">Aucune carte Pliant sur ce séjour.</p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p role="alert" className="text-sm text-[var(--admin-red)]">
          {error}
        </p>
      ) : null}
      {cards.map((card) => (
        <section key={card.pliantCardId} className="admin-af-card rounded-3xl p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">{card.label}</h2>
            <span className="flex items-center gap-3">
              {card.last4 ? (
                <p className="text-sm tabular-nums tracking-wide text-muted">···· {card.last4}</p>
              ) : null}
              <button
                type="button"
                className="text-xs font-semibold text-[#9e7e51] disabled:opacity-50"
                disabled={busyId != null}
                onClick={() => void reveal(card.pliantCardId)}
              >
                {busyId === card.pliantCardId ? "…" : "Voir"}
              </button>
            </span>
          </div>
          {frame?.cardId === card.pliantCardId ? (
            <div className="mt-3 space-y-2">
              <PliantCardFrame
                src={frame.src}
                frameId={frame.frameId}
                onClear={() => setFrame(null)}
                onFail={() => {
                  setFrame(null);
                  setError("La carte n’a pas pu être lue.");
                }}
              />
              <button type="button" className="text-xs text-[#9e7e51]" onClick={() => setFrame(null)}>
                Masquer
              </button>
            </div>
          ) : null}
          <p className="mt-1 text-sm text-muted">
            {card.ceilingCents != null
              ? `Plafond ${formatMoney(card.ceilingCents / 100, card.currency)} · `
              : null}
            Dépensé {formatMoney(card.spentCents / 100, card.currency)}
          </p>
          <p className="mt-3 text-sm text-muted">Le détail des transactions est dans Règlement.</p>
        </section>
      ))}
    </div>
  );
}
