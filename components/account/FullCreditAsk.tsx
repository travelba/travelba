"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";

export function FullCreditAsk({
  reference,
  itemId,
  mode,
  whatsappHref,
}: {
  reference: string;
  itemId: string;
  mode: "late" | "asked" | "ask";
  whatsappHref: string;
}) {
  const router = useRouter();
  const [asked, setAsked] = useState(mode === "asked");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (asked) {
    return <p className="mt-2 text-xs font-semibold text-[var(--admin-navy)]">Demande transmise. Nous contactons l’hôtel.</p>;
  }

  if (mode === "late") {
    return (
      <div className="mt-2 space-y-1">
        <p className="text-xs text-muted">La demande se fait au moins 48 heures avant l’arrivée.</p>
        <a href={whatsappHref} className="text-xs font-semibold text-[var(--admin-navy)] underline-offset-2 hover:underline">
          Écrire sur WhatsApp
        </a>
      </div>
    );
  }

  async function ask() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/client/bookings/${encodeURIComponent(reference)}/full-credit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "La demande n’a pas été enregistrée.");
        return;
      }
      setAsked(true);
      router.refresh();
    } catch {
      setError("La demande n’a pas été enregistrée.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 space-y-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void ask()}
        className="w-full rounded-xl bg-[var(--admin-navy)] px-3 py-2 text-xs font-semibold text-[#C5A880] disabled:opacity-50"
      >
        {busy ? "Demande en cours…" : "Demander le full credit"}
      </button>
      <BusyBar active={busy} label="Envoi de la demande…" />
      {error ? <p className="text-xs text-[var(--admin-navy)]">{error}</p> : null}
    </div>
  );
}
