"use client";

import { FormEvent, useState } from "react";
import { groupedPan } from "@/lib/crm/hotel-arrival";
import type { CardViewLine } from "@/lib/crm/types";

export function AgencyCardPeek({
  bookingId,
  itemId,
  source,
  onReady,
}: {
  bookingId: string;
  itemId: string;
  source: "pliant" | "client";
  hasCode?: boolean;
  views: CardViewLine[];
  onReady?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secrets, setSecrets] = useState<{ pan: string; expiry: string; cvc: string } | null>(null);
  const [image, setImage] = useState<{ mime: string; name: string; image: string } | null>(null);

  async function open(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/hotel-arrival`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId, action: "card", source }),
      });
      const json = (await res.json().catch(() => null)) as {
        error?: string;
        pan?: string;
        expiry?: string;
        cvc?: string;
        mime?: string;
        name?: string;
        image?: string;
        viewer?: string;
        viewedAt?: string;
      } | null;
      if (!res.ok || !json) {
        setError(json?.error || "La carte n’a pas pu être lue.");
        return;
      }
      if (json.pan && json.expiry && json.cvc) {
        setSecrets({ pan: json.pan, expiry: json.expiry, cvc: json.cvc });
        setImage(null);
      } else if (json.image && json.mime) {
        setImage({ mime: json.mime, name: json.name || "carte-client", image: json.image });
        setSecrets(null);
      } else {
        setError(json.error || "La carte n’a pas pu être lue.");
        return;
      }
      onReady?.();
    } catch {
      setError("La carte n’a pas pu être lue.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {secrets ? (
        <span className="font-mono tracking-wide">
          {groupedPan(secrets.pan)} · {secrets.expiry} · {secrets.cvc}
          <button type="button" className="ml-2 font-sans text-[#9e7e51]" onClick={() => setSecrets(null)}>
            Masquer
          </button>
        </span>
      ) : null}
      {image ? (
        <span className="inline-flex items-center gap-2">
          {image.mime.startsWith("image/") ? (
            <img src={`data:${image.mime};base64,${image.image}`} alt="Carte du client" className="max-h-8 rounded" />
          ) : (
            <a className="text-[#9e7e51]" href={`data:${image.mime};base64,${image.image}`} download={image.name}>
              PDF
            </a>
          )}
          <button type="button" className="text-[#9e7e51]" onClick={() => setImage(null)}>
            Masquer
          </button>
        </span>
      ) : null}
      {secrets || image ? null : (
        <form className="inline-flex items-center" onSubmit={open}>
          <button type="submit" className="text-[#9e7e51] disabled:opacity-50" disabled={busy}>
            {busy ? "…" : "Voir"}
          </button>
        </form>
      )}
      {error ? <span className="text-red-700">{error}</span> : null}
    </span>
  );
}
