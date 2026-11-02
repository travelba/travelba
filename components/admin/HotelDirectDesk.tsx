"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CLIENT_PHASE_LABEL, type ClientPhase } from "@/lib/crm/hotel-direct";

export type DirectDeskStay = {
  id: string;
  phase: ClientPhase;
  payMethod: string;
  trial: boolean;
  hotel: string;
  confirmation: string | null;
};

export function HotelDirectDesk({ customerId, stays }: { customerId: string; stays: DirectDeskStay[] }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  if (!stays.length) return null;

  async function post(stayId: string, action: string, extra?: Record<string, unknown>) {
    setBusy(true);
    setNote("");
    try {
      const response = await fetch(`/api/admin/clients/${customerId}/hotels/sejour`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stayId, action, text, ...extra }),
      });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;
      setNote(json?.error || (response.ok ? "Enregistré." : "Action impossible."));
      if (response.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-af-card rounded-3xl px-5 py-4" data-hotel-direct-desk="1">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#9e7e51]">Demandes hôtel</p>
      <div className="mt-3 space-y-4">
        {stays.map((stay) => (
          <article key={stay.id} className="rounded-2xl bg-[#f8f3eb] px-3 py-3" data-hotel-direct-stay={stay.id}>
            <p className="text-sm font-semibold text-[var(--admin-navy)]">
              {stay.hotel || "Hôtel"} · {CLIENT_PHASE_LABEL[stay.phase] || stay.phase}
            </p>
            <p className="mt-1 text-xs text-muted">
              {stay.payMethod === "card" ? "Carte" : "Agence"}
              {stay.trial ? " · essai" : " · réel"}
              {stay.confirmation ? ` · ${stay.confirmation}` : ""}
            </p>
            <label className="mt-3 block text-xs text-muted">
              Réponse de l’hôtel
              <textarea value={text} onChange={(event) => setText(event.target.value)} rows={3} className="mt-1 w-full rounded-2xl border border-[#e5e3dc] bg-white px-3 py-2 text-sm text-[var(--admin-navy)]" />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={busy || !text.trim()} className="rounded-full border border-[#e5e3dc] bg-white px-3 py-2 text-xs font-semibold" onClick={() => void post(stay.id, "reply")}>
                Rattacher la réponse
              </button>
              <button type="button" disabled={busy} className="rounded-full bg-[var(--admin-navy)] px-3 py-2 text-xs font-semibold text-white" onClick={() => void post(stay.id, "mark_paid")}>
                Lien payé
              </button>
              <button type="button" disabled={busy} className="rounded-full border border-[#e5e3dc] bg-white px-3 py-2 text-xs font-semibold" onClick={() => void post(stay.id, "refund_now")}>
                Rembourser le client
              </button>
              <button type="button" disabled={busy} className="rounded-full border border-[#e5e3dc] bg-white px-3 py-2 text-xs font-semibold" onClick={() => void post(stay.id, "cancel_agency")}>
                Annuler
              </button>
            </div>
          </article>
        ))}
      </div>
      {note ? <p className="mt-3 text-sm text-[var(--admin-navy)]">{note}</p> : null}
    </section>
  );
}
