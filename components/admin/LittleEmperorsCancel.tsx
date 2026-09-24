"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";

const LATE_CANCEL =
  "La date limite d’annulation est passée. Écrivez à bookings@littleemperors.com : la politique d’annulation s’applique.";

export function LittleEmperorsCancel({
  id,
  hotelName,
  isCancellable,
  deadline,
  policies,
  state,
}: {
  id: string;
  hotelName: string | null;
  isCancellable: boolean | null;
  deadline: string | null;
  policies: string[];
  state: string | null;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelled = (state || "").toLowerCase() === "cancelled" || (state || "").toLowerCase() === "canceled";
  if (cancelled) return null;

  async function cancel() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/admin/little-emperors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel", id }),
    });
    const json = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(json.error || "Annulation impossible.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="mb-4 rounded-2xl border border-[#e5e3dc] bg-white px-4 py-3">
      {busy ? <BusyBar label="Annulation Little Emperors" /> : null}
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Little Emperors</p>
      <p className="text-sm font-semibold text-[var(--admin-navy)]">{hotelName || "Hôtel"}</p>
      {policies.map((policy) => (
        <p key={policy} className="mt-1 text-sm text-muted">
          {policy}
        </p>
      ))}
      {deadline ? <p className="mt-1 text-sm text-muted">Limite · {deadline}</p> : null}
      {isCancellable === true ? (
        <button
          type="button"
          onClick={() => (confirming ? cancel() : setConfirming(true))}
          disabled={busy}
          className="mt-3 rounded-md bg-[var(--admin-navy)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {confirming ? "Confirmer l’annulation" : "Annuler chez Little Emperors"}
        </button>
      ) : (
        <p className="mt-2 text-sm text-muted">
          {isCancellable === false
            ? LATE_CANCEL
            : "Little Emperors n’indique pas que cette réservation peut être annulée depuis l’API."}
        </p>
      )}
      {error ? <p className="mt-2 text-sm text-[#8a5a2a]">{error}</p> : null}
    </div>
  );
}
