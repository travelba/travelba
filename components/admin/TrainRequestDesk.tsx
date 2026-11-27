"use client";

import { useState } from "react";
import type { TrainDeskAction } from "@/lib/crm/train-desk";

export type TrainDeskState = {
  pause: boolean;
  prise_en_main: boolean;
  ia: boolean | null;
  ia_globale: boolean;
  cle_openai: boolean;
};

const ACTIONS: { id: TrainDeskAction; label: string }[] = [
  { id: "relancer", label: "Relancer" },
  { id: "reverifier", label: "Revérifier le prix" },
  { id: "horaires", label: "Horaires" },
  { id: "tarifs", label: "Tarifs" },
  { id: "pause", label: "Pause" },
  { id: "reprendre", label: "Reprendre" },
  { id: "annuler", label: "Annuler" },
  { id: "billets", label: "Renvoyer les billets" },
  { id: "prendre", label: "Prendre la main" },
  { id: "rendre", label: "Rendre la main" },
];

export function TrainRequestDesk({
  bookingId,
  requestId,
  state,
  preview = false,
}: {
  bookingId: string;
  requestId: string;
  state: TrainDeskState;
  preview?: boolean;
}) {
  const [note, setNote] = useState("");
  const [texte, setTexte] = useState("");
  const [busy, setBusy] = useState(false);
  const iaOn = state.ia === null ? state.ia_globale : state.ia;

  async function run(action: TrainDeskAction, extra: Record<string, unknown> = {}) {
    if (preview) {
      setNote("Aperçu : rien n’est envoyé.");
      return;
    }
    setBusy(true);
    setNote("");
    const response = await fetch(`/api/admin/bookings/${bookingId}/demande-train/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ demande: requestId, action, texte, ...extra }),
    });
    const body = (await response.json().catch(() => null)) as { texte?: string; raison?: string; error?: string } | null;
    setBusy(false);
    setNote(body?.error || body?.raison || body?.texte || "Fait.");
  }

  return (
    <section className="rounded-xl bg-[#f7f6f3] p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Actions</p>
        <p className="text-[11px] text-[var(--admin-navy)]">
          {state.pause ? "En pause. " : ""}
          {state.prise_en_main ? "Prise en main. " : ""}
          {state.cle_openai ? (iaOn ? "IA ouverte" : "IA coupée") : "clé OpenAI manquante"}
        </p>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {ACTIONS.map((action) => (
          <button
            key={action.id}
            type="button"
            disabled={busy}
            onClick={() => void run(action.id)}
            className="admin-tap h-7 rounded-full bg-white px-2 text-[11px] font-semibold text-[var(--admin-navy)] ring-1 ring-[var(--border)] disabled:opacity-50"
          >
            {action.label}
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || !state.cle_openai}
          onClick={() => void run("ia", { ia: !iaOn })}
          className={`h-7 rounded-full px-2 text-[11px] font-semibold ${iaOn && state.cle_openai ? "bg-[var(--admin-navy)] text-white" : "bg-white text-[var(--admin-navy)] ring-1 ring-[var(--border)]"}`}
        >
          IA {iaOn && state.cle_openai ? "activée" : "désactivée"}
        </button>
        <button
          type="button"
          disabled={busy || !state.cle_openai}
          onClick={() => void run("ia_globale", { ia: !state.ia_globale })}
          className="h-7 rounded-full bg-white px-2 text-[11px] font-semibold text-muted ring-1 ring-[var(--border)] disabled:opacity-50"
        >
          IA globale {state.ia_globale ? "ouverte" : "fermée"}
        </button>
      </div>
      <div className="mt-1.5 flex gap-1.5">
        <input
          aria-label="Message au client"
          value={texte}
          onChange={(event) => setTexte(event.target.value)}
          placeholder="Message libre, ou mot joint à l’annulation"
          className="h-8 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-white px-2 text-xs text-[var(--admin-navy)] outline-none"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void run("message")}
          className="admin-af-btn admin-tap h-8 shrink-0 rounded-full px-3 text-[11px] disabled:opacity-50"
        >
          Envoyer
        </button>
      </div>
      {note ? <p className="mt-1 text-[11px] text-[var(--admin-navy)]">{note}</p> : null}
    </section>
  );
}
