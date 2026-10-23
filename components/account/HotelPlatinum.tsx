"use client";

import { useState } from "react";
import { HOTEL_ACCESS_COPY, HOTEL_MEMBERSHIP_LABEL } from "@/lib/crm/hotel-access";

export function HotelPlatinum({
  pending,
  preview = false,
}: {
  pending: boolean;
  /** Aperçu agence : aucun enregistrement. */
  preview?: boolean;
}) {
  const [sent, setSent] = useState(pending);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function ask() {
    if (preview || sent) return;
    setBusy(true);
    setNote("");
    try {
      const response = await fetch("/api/client/hotels/acces", { method: "POST" });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setNote(json?.error || "La demande n’a pas pu être envoyée.");
        return;
      }
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hotel-theme" data-hotel-platinum="1">
      <div className="fixed inset-x-0 top-16 bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))] z-20 mx-auto flex w-full max-w-[480px] flex-col bg-[#f4efe6] px-5 md:bottom-8">
        <div className="pt-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8c7352]">Membres</p>
          <h1 className="mt-2 font-display text-[2rem] font-semibold leading-none text-[#1a1a1a]">{HOTEL_MEMBERSHIP_LABEL}</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-[#1a1a1a]">{HOTEL_ACCESS_COPY.reserved}</p>
          <ul className="mt-5 space-y-2 text-sm text-[#1a1a1a]">
            {HOTEL_ACCESS_COPY.benefits.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <div className="mt-auto pb-3">
          {sent ? (
            <p className="text-center text-sm text-[#1a1a1a]" data-hotel-access-sent="1" role="status">
              {HOTEL_ACCESS_COPY.sent}
            </p>
          ) : (
            <button
              type="button"
              className="h-btn h-12 w-full text-sm font-semibold disabled:opacity-40"
              onClick={() => void ask()}
              disabled={busy || preview}
            >
              {busy ? "Envoi…" : HOTEL_ACCESS_COPY.ask}
            </button>
          )}
          {note ? (
            <p className="mt-2 text-center text-sm text-[#8c7352]" role="alert">
              {note}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
