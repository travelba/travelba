"use client";

import { FormEvent, useState } from "react";
import { groupedPan } from "@/lib/crm/hotel-arrival";
import type { CardViewLine } from "@/lib/crm/types";

function viewedWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function AgencyCardPeek({
  bookingId,
  itemId,
  source,
  hasCode,
  views,
  onReady,
}: {
  bookingId: string;
  itemId: string;
  source: "pliant" | "client";
  hasCode: boolean;
  views: CardViewLine[];
  onReady?: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secrets, setSecrets] = useState<{ pan: string; expiry: string; cvc: string } | null>(null);
  const [image, setImage] = useState<{ mime: string; name: string; image: string } | null>(null);
  const [extra, setExtra] = useState<{ name: string; at: string }[]>([]);
  const lines = [...extra, ...views.filter((line) => line.source === source)]
    .filter((line, index, all) => all.findIndex((item) => item.at === line.at && item.name === line.name) === index)
    .slice(0, 5);

  async function open(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/hotel-arrival`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          itemId,
          action: "card",
          source,
          code,
        }),
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
    <div className="space-y-1">
      {secrets ? (
        <p className="font-mono text-[11px] tracking-wide text-[#0B192C]">
          {groupedPan(secrets.pan)} · {secrets.expiry} · {secrets.cvc}
          <button type="button" className="ml-2 font-sans text-[#9e7e51] underline" onClick={() => setSecrets(null)}>
            Masquer
          </button>
        </p>
      ) : null}
      {image ? (
        <div>
          {image.mime.startsWith("image/") ? (
            <img src={`data:${image.mime};base64,${image.image}`} alt="Carte du client" className="max-h-16 rounded border border-[#e5e3dc]" />
          ) : (
            <a
              className="font-semibold text-[#0B192C] underline"
              href={`data:${image.mime};base64,${image.image}`}
              download={image.name}
            >
              Ouvrir le PDF
            </a>
          )}
          <button type="button" className="ml-2 text-[#9e7e51] underline" onClick={() => setImage(null)}>
            Masquer
          </button>
        </div>
      ) : null}
      {secrets || image ? null : (
        <form className="flex flex-wrap items-center gap-1" onSubmit={open}>
          <input
            className="w-28 rounded-lg border border-[#e5e3dc] bg-white px-2 py-1 text-[#0B192C] outline-none focus:border-[#0B192C]"
            type="password"
            name="staff-card-code"
            autoComplete="off"
            aria-label="Code maître"
            placeholder="Code maître"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          <button type="submit" className="rounded-full bg-[#0B192C] px-2.5 py-1 font-semibold text-white disabled:opacity-50" disabled={busy}>
            {busy ? "…" : "Voir"}
          </button>
        </form>
      )}
      {lines.length ? (
        <ul className="text-[10px] text-[#9e7e51]">
          {lines.map((line) => (
            <li key={`${line.at}-${line.name}`}>
              Vu par {line.name} · {viewedWhen(line.at)}
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="text-red-700">{error}</p> : null}
    </div>
  );
}
