"use client";

import { useState } from "react";
import { BusyBar } from "@/components/crm/BusyBar";
import { FoldedRow } from "@/components/crm/FoldedRow";
import type { ShareCompanion } from "@/lib/crm/trip-share";

export function TripSharePanel({
  bookingId,
  shareUrl,
  companions,
  preview = false,
  canSend = true,
  sendUrl,
}: {
  bookingId: string;
  shareUrl: string;
  companions: ShareCompanion[];
  /** Aperçu local : le clic n’appelle pas WhatsApp. */
  preview?: boolean;
  /** Faux : le client n’a pas de téléphone, l’envoi reste bloqué. */
  canSend?: boolean;
  sendUrl?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setNotice("Lien copié.");
    } catch {
      setCopied(false);
      setNotice("Sélectionnez le lien pour le copier.");
    }
  }

  async function send(companion: ShareCompanion) {
    if (!companion.companionId || !companion.hasPhone || sendingId) return;
    setSendingId(companion.companionId);
    setNotice(null);
    if (preview) {
      setNotice("Aperçu : aucun message n’est envoyé.");
      setSendingId(null);
      return;
    }
    try {
      const response = await fetch(sendUrl || `/api/client/bookings/${bookingId}/partage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companion_id: companion.companionId }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setNotice(payload?.error || "WhatsApp n’a pas pu envoyer le message. Le lien reste à copier.");
        return;
      }
      setNotice(`Lien envoyé à ${companion.firstName} par WhatsApp.`);
    } catch {
      setNotice("WhatsApp n’a pas pu envoyer le message. Le lien reste à copier.");
    } finally {
      setSendingId(null);
    }
  }

  return (
    <FoldedRow title="Partager le voyage">
      <p className="text-sm text-[var(--admin-navy)]">
        Ce lien ouvre la page du voyage, sans compte.
      </p>
      <div className="flex gap-2">
        <input
          readOnly
          value={shareUrl}
          aria-label="Lien du voyage"
          onFocus={(event) => event.currentTarget.select()}
          className="min-w-0 flex-1 rounded-full border border-[#e5e3dc] bg-[#f7f5f0] px-3 py-2 text-sm text-[var(--admin-navy)]"
        />
        <button
          type="button"
          onClick={() => void copy()}
          className="shrink-0 rounded-full bg-[var(--admin-navy)] px-4 py-2 text-sm font-semibold text-white"
        >
          {copied ? "Copié" : "Copier le lien"}
        </button>
      </div>

      {companions.length ? (
        <ul className="space-y-2">
          {companions.map((companion) => {
            const name = [companion.firstName, companion.lastName].filter(Boolean).join(" ");
            const sending = sendingId === companion.companionId;
            return (
              <li key={companion.travelerId} className="rounded-2xl bg-[#f7f5f0] px-3 py-2.5">
                <p className="text-sm font-semibold text-[var(--admin-navy)]">{name}</p>
                {!canSend ? (
                  <p className="mt-1 text-sm text-muted">
                    Ajoutez un téléphone dans Vous pour envoyer ce lien.
                  </p>
                ) : companion.hasPhone && companion.companionId ? (
                  <button
                    type="button"
                    disabled={Boolean(sendingId)}
                    onClick={() => void send(companion)}
                    className="mt-2 inline-flex h-10 items-center justify-center rounded-full bg-[var(--admin-navy)] px-4 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {sending ? "Envoi…" : `Envoyer à ${companion.firstName} par WhatsApp`}
                  </button>
                ) : (
                  <p className="mt-1 text-sm text-muted">
                    {companion.firstName} n’a pas de téléphone. Le lien reste à copier.
                  </p>
                )}
                <BusyBar active={sending} label="Envoi par WhatsApp…" />
              </li>
            );
          })}
        </ul>
      ) : null}

      {notice ? <p className="text-sm text-[var(--admin-navy)]">{notice}</p> : null}
    </FoldedRow>
  );
}
