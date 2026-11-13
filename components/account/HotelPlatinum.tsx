"use client";

import { useState } from "react";
import { HotelBenefits } from "@/components/crm/HotelBenefits";
import { HOTEL_ACCESS_COPY, HOTEL_MEMBERSHIP_LABEL } from "@/lib/crm/hotel-access";
import { HOTEL_CATALOG_COPY, TRAVEL_BA_SEARCH_ADVANTAGES } from "@/lib/crm/hotel-search-home";

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
      <div className="fixed inset-x-0 top-16 bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))] z-20 mx-auto flex w-full max-w-[480px] flex-col bg-[#f4efe6] md:bottom-8">
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8c7352]">
            {HOTEL_CATALOG_COPY.kicker} · {HOTEL_MEMBERSHIP_LABEL}
          </p>
          <h1 className="mt-2 font-display text-[2rem] font-semibold leading-none text-[#1a1a1a]">{HOTEL_CATALOG_COPY.title}</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-[#1a1a1a]">{HOTEL_CATALOG_COPY.lead}</p>
          <p className="mt-3 text-sm leading-relaxed text-[#6d675f]">{HOTEL_ACCESS_COPY.reserved}</p>
          <div className="mt-5">
            <HotelBenefits lines={[...TRAVEL_BA_SEARCH_ADVANTAGES]} title={HOTEL_CATALOG_COPY.servicesTitle} />
            <p className="mt-2 text-[11px] leading-snug text-[#6d675f]">{HOTEL_CATALOG_COPY.servicesNote}</p>
          </div>
        </div>
        <div className="shrink-0 px-5 pb-3">
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
