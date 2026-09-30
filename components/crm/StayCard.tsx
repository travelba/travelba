"use client";

import { FormEvent, useState } from "react";
import { BusyBar } from "@/components/crm/BusyBar";
import { cardLast4, groupedPan, maskedCardNumber, type StayCardFace } from "@/lib/crm/hotel-arrival";


export function StayCard({
  face,
  revealUrl,
  personal = false,
}: {
  face: StayCardFace;
  revealUrl: string;
  personal?: boolean;
  needsCode?: boolean;
  views?: { name: string; at: string }[];
}) {
  const [code, setCode] = useState("");
  const [tail, setTail] = useState(face.last4);
  const [revealed, setRevealed] = useState<{ pan: string; expiry: string; cvc: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reveal(event: FormEvent) {
    event.preventDefault();
    if (face.closed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(revealUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          itemId: face.itemId,
          action: "card",
          code,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { error?: string; pan?: string; expiry?: string; cvc?: string; viewer?: string; viewedAt?: string }
        | null;
      if (!res.ok || !json?.pan || !json.expiry || !json.cvc) {
        setError(json?.error || "La carte n’a pas pu être lue.");
        return;
      }
      const last4 = cardLast4(json.pan);
      if (last4.length === 4) setTail(last4);
      setRevealed({ pan: json.pan, expiry: json.expiry, cvc: json.cvc });
      setCode("");
    } catch {
      setError("La carte n’a pas pu être lue.");
    } finally {
      setBusy(false);
    }
  }

  const number = revealed ? groupedPan(revealed.pan) : maskedCardNumber(tail);
  const expiry = revealed?.expiry || "••/••";
  const cvc = revealed?.cvc || "•••";

  return (
    <div className="w-full max-w-[22rem]">
      <article className="relative aspect-[1.586/1] overflow-hidden rounded-[1.15rem] bg-[#0B192C] p-5 text-white shadow-[0_18px_40px_rgba(11,25,44,0.28)]">
        <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-[#C5A880]/20" />
        <div className="pointer-events-none absolute -bottom-14 -left-10 h-32 w-44 rounded-full bg-[#C5A880]/10" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#C5A880]">Travelba</p>
            <p className="mt-0.5 text-sm font-semibold">Carte hôtel</p>
            {face.closed ? (
              <p className="mt-2 inline-flex rounded-full border border-[#C5A880]/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#C5A880]">
                Clôturée
              </p>
            ) : null}
          </div>
          <span className="relative mt-1 h-8 w-11 shrink-0 rounded-[7px] bg-gradient-to-br from-[#e8d7b6] to-[#C5A880]" aria-hidden>
            <span className="absolute inset-y-1.5 left-1/2 w-px -translate-x-1/2 bg-[#0B192C]/30" />
            <span className="absolute inset-x-1.5 top-1/2 h-px -translate-y-1/2 bg-[#0B192C]/30" />
          </span>
        </div>
        <p className="relative mt-5 font-mono text-[1.05rem] tracking-[0.14em]">{number}</p>
        <div className="relative mt-4 flex items-end justify-between gap-3 text-xs">
          <div className="min-w-0">
            <p className="text-[9px] uppercase tracking-[0.14em] text-white/50">Titulaire</p>
            <p className="truncate font-semibold">{face.holder || "Voyageur"}</p>
            {face.hotel ? <p className="truncate text-white/70">{face.hotel}</p> : null}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[9px] uppercase tracking-[0.14em] text-white/50">Expire</p>
            <p className="font-mono">{expiry}</p>
            <p className="mt-1 text-[9px] uppercase tracking-[0.14em] text-white/50">CVC</p>
            <p className="font-mono">{cvc}</p>
          </div>
        </div>
        {busy ? (
          <div className="absolute inset-x-5 bottom-3">
            <BusyBar tone="light" label="Lecture de la carte" />
          </div>
        ) : null}
      </article>
      {face.closed ? null : revealed ? (
        <button type="button" className="mt-2 text-xs text-[#9e7e51]" onClick={() => setRevealed(null)}>
          Masquer
        </button>
      ) : personal ? (
        <form className="mt-2" onSubmit={reveal}>
          <button type="submit" className="text-xs text-[#9e7e51] disabled:opacity-50" disabled={busy}>
            {busy ? "…" : "Voir"}
          </button>
        </form>
      ) : (
        <form className="mt-3 space-y-2" onSubmit={reveal}>
          <label className="block text-sm text-[var(--admin-navy)]">
            Code agence
            <input
              className="mt-1 w-full rounded-xl border border-[#e5e3dc] bg-white px-3 py-2.5 text-sm text-[var(--admin-navy)] outline-none focus:border-[#0B192C]"
              type="password"
              name="agency-code"
              autoComplete="off"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
          <p className="text-xs text-[var(--admin-navy)]/70">Le début du numéro s’ouvre avec le code agence.</p>
          <button
            type="submit"
            className="rounded-full bg-[#0B192C] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            disabled={busy}
          >
            Afficher le numéro
          </button>
        </form>
      )}
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
