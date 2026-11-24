"use client";

import { useState } from "react";

export function HotelAutoSettings({
  payRequest,
  chargeEnabled,
  maxEuros,
}: {
  payRequest: boolean;
  chargeEnabled: boolean;
  maxEuros: number;
}) {
  const [pay, setPay] = useState(payRequest);
  const [charge, setCharge] = useState(chargeEnabled);
  const [max, setMax] = useState(String(maxEuros));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setNote("");
    try {
      const response = await fetch("/api/admin/hotel-auto", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "reglages",
          payRequest: pay,
          chargeEnabled: charge,
          maxEuros: Number(max),
        }),
      });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;
      setNote(response.ok ? "Enregistré. Rien ne part tant que les interrupteurs sont éteints." : json?.error || "Le réglage n’a pas été enregistré.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 rounded-2xl border border-[#e5e3dc] bg-white p-4">
      <h3 className="font-display text-base font-bold text-[var(--admin-navy)]">Réservation autonome</h3>
      <p className="mt-1 text-sm text-muted">
        Éteint par défaut. La demande de lien part vers HOTEL_DIRECT_TEST_TO, sauf HOTEL_AUTO_PAY_LIVE. Le paiement
        automatique ouvre la page hors de Vercel.
      </p>
      <label className="mt-4 flex min-h-11 items-center gap-3 text-sm font-semibold text-[var(--admin-navy)]">
        <input type="checkbox" checked={pay} onChange={(event) => setPay(event.target.checked)} />
        Demander le lien de paiement à l’hôtel
      </label>
      <label className="mt-2 flex min-h-11 items-center gap-3 text-sm font-semibold text-[var(--admin-navy)]">
        <input type="checkbox" checked={charge} onChange={(event) => setCharge(event.target.checked)} />
        Payer le lien automatiquement
      </label>
      <label className="mt-3 block text-sm font-semibold text-[var(--admin-navy)]">
        Plafond avant validation humaine (€)
        <input
          className="mt-1 block w-32 rounded-xl border border-[#e5e3dc] px-3 py-2"
          inputMode="numeric"
          value={max}
          onChange={(event) => setMax(event.target.value)}
        />
      </label>
      <button
        type="button"
        className="mt-4 min-h-11 rounded-full bg-[var(--admin-navy)] px-4 text-sm font-semibold text-white"
        disabled={busy}
        onClick={save}
      >
        Enregistrer
      </button>
      {note ? <p className="mt-2 text-sm text-muted">{note}</p> : null}
    </div>
  );
}
