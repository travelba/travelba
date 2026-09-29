"use client";

import { FormEvent, useState } from "react";
import { groupedPan } from "@/lib/crm/hotel-arrival";
import type { CardViewLine } from "@/lib/crm/types";

function whoLooked(lines: { name: string }[]) {
  const names = [...new Set(lines.map((line) => line.name).filter(Boolean))];
  if (!names.length) return "";
  const shown = names.slice(0, 3).join(", ");
  return names.length > 3 ? `Vu par ${shown} +${names.length - 3}` : `Vu par ${shown}`;
}

export function AgencyCardPeek({
  bookingId,
  itemId,
  source,
  views,
  onReady,
}: {
  bookingId: string;
  itemId: string;
  source: "pliant" | "client";
  hasCode?: boolean;
  views: CardViewLine[];
  onReady?: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secrets, setSecrets] = useState<{ pan: string; expiry: string; cvc: string } | null>(null);
  const [image, setImage] = useState<{ mime: string; name: string; image: string } | null>(null);
  const [extra, setExtra] = useState<{ name: string; at: string }[]>([]);
  const looked = whoLooked([...extra, ...views.filter((line) => line.source === source)]);

  async function open(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/hotel-arrival`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId, action: "card", source, code }),
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
      setCode("");
      if (json.viewer && json.viewedAt) {
        setExtra((current) => [{ name: json.viewer as string, at: json.viewedAt as string }, ...current]);
      }
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
        <form className="inline-flex items-center gap-1" onSubmit={open}>
          <input
            className="w-24 border-b border-[#e5e3dc] bg-transparent px-0 py-0.5 text-[#0B192C] outline-none focus:border-[#0B192C]"
            type="password"
            name="staff-card-code"
            autoComplete="off"
            aria-label="Code maître"
            placeholder="Code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          <button type="submit" className="text-[#9e7e51] disabled:opacity-50" disabled={busy}>
            {busy ? "…" : "Voir"}
          </button>
        </form>
      )}
      {looked ? <span className="text-[10px] text-[#9e7e51]">{looked}</span> : null}
      {error ? <span className="text-red-700">{error}</span> : null}
    </span>
  );
}
