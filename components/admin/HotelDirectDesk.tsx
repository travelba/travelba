"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CLIENT_PHASE_LABEL, directDeskMoneyActions } from "@/lib/crm/hotel-direct";
import type { DirectDeskStay } from "@/lib/crm/hotel-direct-desk";

export type { DirectDeskStay };

export function HotelDirectDesk({ stays }: { stays: DirectDeskStay[] }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (!stays.length) return null;

  async function post(stay: DirectDeskStay, action: string, text: string) {
    setBusy(true);
    setNote("");
    try {
      const response = await fetch(`/api/admin/clients/${stay.customerId}/hotels/sejour`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stayId: stay.id, action, text }),
      });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;
      setNote(json?.error || (response.ok ? "Enregistré." : "Action impossible."));
      if (response.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-af-card rounded-3xl px-5 py-4" data-hotel-direct-desk="1" aria-labelledby="demandes-hotel-titre">
      <h2 id="demandes-hotel-titre" className="font-display text-lg font-bold text-[var(--admin-navy)]">
        Demandes hôtel
      </h2>
      <ul className="mt-3 flex flex-col gap-2">
        {stays.map((stay) => (
          <StayRow key={stay.id} stay={stay} busy={busy} onPost={post} />
        ))}
      </ul>
      {note ? <p className="mt-3 text-sm text-[var(--admin-navy)]">{note}</p> : null}
    </section>
  );
}

function StayRow({
  stay,
  busy,
  onPost,
}: {
  stay: DirectDeskStay;
  busy: boolean;
  onPost: (stay: DirectDeskStay, action: string, text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const money = directDeskMoneyActions(stay.phase);
  const title = stay.hotel || "Hôtel";
  const phase = CLIENT_PHASE_LABEL[stay.phase] || stay.phase;

  return (
    <li className="rounded-2xl border border-[var(--admin-gold)]/30 bg-[#f8f4ed] px-4 py-3 text-[var(--admin-navy)]" data-hotel-direct-stay={stay.id} data-hotel-direct-phase={stay.phase}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {stay.clientName ? `${stay.clientName} · ` : ""}
            {title} · {phase}
          </p>
          <p className="mt-1 text-xs text-muted">
            {stay.payMethod === "card" ? "Carte" : "Agence"}
            {stay.trial ? " · essai" : " · réel"}
            {stay.confirmation ? ` · ${stay.confirmation}` : ""}
          </p>
        </div>
        {stay.dossierHref ? (
          <Link href={stay.dossierHref} className="text-sm font-semibold underline">
            {stay.dossierLabel ? `Dossier ${stay.dossierLabel}` : "Dossier"}
          </Link>
        ) : stay.clientName ? (
          <span className="text-xs text-muted">Pas encore de dossier</span>
        ) : null}
      </div>
      {money ? (
        <>
          <label className="mt-3 block text-xs text-muted">
            Réponse de l’hôtel
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={3}
              className="mt-1 w-full rounded-2xl border border-[#e5e3dc] bg-white px-3 py-2 text-sm text-[var(--admin-navy)]"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !text.trim()}
              className="min-h-11 rounded-full border border-[#e5e3dc] bg-white px-3 py-2 text-xs font-semibold"
              onClick={() => void onPost(stay, "reply", text)}
            >
              Rattacher la réponse
            </button>
            <button
              type="button"
              disabled={busy}
              className="min-h-11 rounded-full bg-[var(--admin-navy)] px-3 py-2 text-xs font-semibold text-white"
              onClick={() => void onPost(stay, "mark_paid", text)}
            >
              Lien payé
            </button>
            <button
              type="button"
              disabled={busy}
              className="min-h-11 rounded-full border border-[#e5e3dc] bg-white px-3 py-2 text-xs font-semibold"
              onClick={() => void onPost(stay, "refund_now", text)}
            >
              Rembourser le client
            </button>
            <button
              type="button"
              disabled={busy}
              className="min-h-11 rounded-full border border-[#e5e3dc] bg-white px-3 py-2 text-xs font-semibold"
              onClick={() => void onPost(stay, "cancel_agency", text)}
            >
              Annuler
            </button>
          </div>
        </>
      ) : null}
    </li>
  );
}
