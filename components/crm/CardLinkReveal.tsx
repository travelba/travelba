"use client";

import { useCallback, useState } from "react";
import { PliantCardFrame } from "@/components/crm/PliantCardFrame";

type Revealed =
  | { kind: "widget"; src: string; frameId: string; opensLeft: number }
  | { kind: "file"; mime: string; bytes: string; opensLeft: number };

function frenchDay(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", year: "numeric" });
}

/**
 * Page du lien carte pour l’hôtel. Rien ne s’ouvre au chargement (aperçu, scanner d’e-mail) :
 * le bouton compte une ouverture, la carte s’affiche dans le cadre Pliant ou en image.
 */
export function CardLinkReveal({
  code,
  hotel,
  reference,
  opensLeft,
  expiresAt,
}: {
  code: string;
  hotel: string;
  reference: string;
  opensLeft: number;
  expiresAt: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [cleared, setCleared] = useState(false);

  const hide = useCallback(() => setCleared(true), []);
  const failed = useCallback(() => {
    setRevealed(null);
    setError("La carte n’a pas pu s’afficher. Réessayez.");
  }, []);

  async function reveal() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setCleared(false);
    try {
      const res = await fetch(`/api/k/${encodeURIComponent(code)}`, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        opens_left?: number;
        widget?: { src: string; frameId: string } | null;
        file?: { mime: string; bytes: string } | null;
      };
      if (!res.ok) {
        setError(json.error || "La carte n’a pas pu s’afficher. Réessayez.");
        return;
      }
      const left = typeof json.opens_left === "number" ? json.opens_left : 0;
      if (json.widget?.src) {
        setRevealed({ kind: "widget", src: json.widget.src, frameId: json.widget.frameId, opensLeft: left });
      } else if (json.file?.bytes) {
        setRevealed({ kind: "file", mime: json.file.mime, bytes: json.file.bytes, opensLeft: left });
      } else {
        setError("La carte n’a pas pu s’afficher. Réessayez.");
      }
    } catch {
      setError("Connexion interrompue. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  const until = frenchDay(expiresAt);
  const left = revealed ? revealed.opensLeft : opensLeft;

  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#9e7e51]">Travel Business Agency</p>
        <h1 className="mt-1 text-2xl font-bold text-[#0b192c]">Carte de paiement / Payment card</h1>
        <p className="mt-2 text-sm text-[#5a5c60]">
          {[hotel, reference ? `Réservation ${reference}` : ""].filter(Boolean).join(" · ")}
        </p>
      </div>
      <p className="text-sm text-[#0b192c]">
        Ce lien s’ouvre encore {left} fois{until ? `, jusqu’au ${until}` : ""}. Chaque ouverture est enregistrée.
        <br />
        <span className="text-[#5a5c60]">
          This link opens {left} more time{left > 1 ? "s" : ""}. Each view is logged.
        </span>
      </p>

      {revealed?.kind === "widget" && !cleared ? (
        <PliantCardFrame src={revealed.src} frameId={revealed.frameId} onClear={hide} onFail={failed} />
      ) : null}
      {revealed?.kind === "file" && !cleared ? (
        revealed.mime === "application/pdf" ? (
          <iframe
            title="Carte du client"
            src={`data:application/pdf;base64,${revealed.bytes}`}
            className="h-96 w-full rounded-2xl border border-[#e5e3dc] bg-white"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- carte en data: URI, rien à optimiser ni à mettre en cache
          <img
            src={`data:${revealed.mime};base64,${revealed.bytes}`}
            alt="Carte du client"
            className="w-full rounded-2xl border border-[#e5e3dc]"
          />
        )
      ) : null}

      {!revealed || cleared ? (
        <button
          type="button"
          onClick={() => void reveal()}
          disabled={busy || left < 1}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#0b192c] px-5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Ouverture…" : "Afficher la carte / Show card"}
        </button>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-semibold text-[#b42318]">
          {error}
        </p>
      ) : null}
      <p className="text-xs text-[#5a5c60]">
        Le numéro s’affiche dans une fenêtre sécurisée ; il n’est jamais envoyé par e-mail. Ne le recopiez pas dans un
        message. / The card number is shown in a secure frame and never sent by e-mail.
      </p>
    </section>
  );
}
