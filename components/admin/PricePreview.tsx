"use client";

import { useState } from "react";
import { IngestItemCard } from "@/components/crm/IngestItemCard";
import type { BookingExtract } from "@/lib/crm/ingest-types";

type Draft = BookingExtract["items"][number];

const flight: Draft = {
  kind: "flight",
  title: "Tel Aviv → Paris",
  supplier: "El Al",
  confirmation_ref: "ZLFJIN",
  start_at: "2026-12-08T10:00:00",
  end_at: "2026-12-08T14:00:00",
  amount: 640,
  include_in_ledger: true,
  details: {
    price_mode: "avec",
    airline: "El Al",
    flight_number: "LY325",
    from: "TLV",
    to: "CDG",
    city_from: "Tel Aviv",
    city_to: "Paris",
  },
};

/** Aperçu local des choix de prix. Aucune écriture. */
export function PricePreview() {
  const [item, setItem] = useState(flight);
  const [mode, setMode] = useState<"cartes" | "forfait">("forfait");
  const [amount, setAmount] = useState("2480");
  return (
    <section className="admin-af-card rounded-3xl p-4 sm:p-5">
      <h1 className="font-display text-lg font-bold text-[var(--admin-navy)]">Étapes du voyage</h1>
      <div className="mt-4 rounded-2xl border border-[var(--border)] bg-white/70 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Prix du voyage</p>
        <div role="radiogroup" aria-label="Prix du voyage" className="mt-1.5 inline-flex gap-1 rounded-2xl bg-white p-1 shadow-[inset_0_0_0_1px_var(--border)]">
          {([
            ["cartes", "Par carte"],
            ["forfait", "Prix forfait"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              onClick={() => setMode(value)}
              className={`admin-tap rounded-xl px-3.5 py-1.5 text-sm font-semibold ${
                mode === value ? "bg-[var(--admin-navy)] text-white" : "text-[var(--admin-navy)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted">
          Un seul prix pour le voyage. Aucune carte n’affiche de prix, et une seule ligne part dans les transactions.
        </p>
        {mode === "forfait" ? (
          <label className="mt-3 flex max-w-xs flex-col gap-1 text-sm font-semibold text-[var(--admin-navy)]">
            Prix forfait
            <input
              aria-label="Prix forfait"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold"
            />
          </label>
        ) : null}
      </div>
      <div className="relative mt-4 rounded-2xl border border-[var(--border)] bg-white px-3 py-3">
        <IngestItemCard item={item} forfait={mode === "forfait"} onChange={setItem} onRemove={() => undefined} />
      </div>
    </section>
  );
}
