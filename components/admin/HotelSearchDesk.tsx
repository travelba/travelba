"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HotelBenefits } from "@/components/crm/HotelBenefits";
import { formatDateFr, formatMoney } from "@/lib/crm/money";

export type HotelRequestView = {
  id: string;
  guest: string;
  status: "pending" | "refused" | "issued" | "locked";
  hotelName: string;
  city: string;
  room: string | null;
  checkIn: string;
  checkOut: string;
  adults: number;
  party: string;
  travelers?: string;
  rate?: string;
  sellCents: number;
  currency: string;
  benefits: string[];
  origin: string;
  photo?: string | null;
};

const STATUS: Record<HotelRequestView["status"], string> = {
  pending: "À valider",
  refused: "Refusée",
  issued: "Carte émise",
  locked: "Carte bloquée",
};

export function HotelSearchDesk({ rows, canIssue, blockedReason }: { rows: HotelRequestView[]; canIssue: boolean; blockedReason: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [note, setNote] = useState("");

  async function act(id: string, action: "issue" | "refuse" | "lock") {
    setPending(id + action);
    setNote("");
    try {
      const response = await fetch("/api/admin/hotels-demandes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const json = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
      setNote(json?.message || json?.error || "Action impossible.");
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  if (!rows.length) {
    return <p className="mt-6 text-sm text-[#5c5348]">Aucune demande pour le moment.</p>;
  }

  return (
    <div className="mt-6 space-y-3">
      {note ? <p className="text-sm text-[var(--admin-navy)]">{note}</p> : null}
      {!canIssue ? <p className="rounded-2xl border border-[var(--admin-gold)]/50 bg-[#f8f3eb] p-3 text-sm text-[var(--admin-navy)]">{blockedReason}</p> : null}
      {rows.map((row) => (
        <article key={row.id} className="overflow-hidden rounded-2xl border border-[#e5e3dc] bg-white">
          <div className="relative h-36 bg-[#0B192C]" data-hotel-cover="1">
            {row.photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- photo fournisseur https, hors next/image
              <img src={row.photo} alt="" className="absolute inset-0 h-full w-full object-cover" referrerPolicy="no-referrer" />
            ) : null}
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-24"
              style={{ background: "linear-gradient(to top, #0B192C 18%, rgba(11,25,44,0.55) 58%, transparent)" }}
              aria-hidden
            />
            <div className="absolute inset-x-0 bottom-0 px-4 pb-3 text-[#f7f4ee]" data-hotel-title="1">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#C5A880]">{STATUS[row.status]}</p>
              <h2 className="font-display text-xl font-bold leading-tight">{row.hotelName}</h2>
              {row.city ? <p className="text-sm text-white/75">{row.city}</p> : null}
            </div>
          </div>
          <p className="px-4 py-3 font-display text-xl font-bold text-[var(--admin-navy)]" data-hotel-price="1">
            {formatMoney(row.sellCents / 100, row.currency)}
          </p>
          {row.benefits.length ? (
            <div className="px-4 pb-3" data-hotel-benefits="1">
              <HotelBenefits lines={row.benefits} />
            </div>
          ) : null}
          <div className="space-y-1 px-4 pb-4 text-sm text-[#5c5348]">
            <p>
              {row.guest} · {formatDateFr(row.checkIn)} – {formatDateFr(row.checkOut)} · {row.party}
            </p>
            {row.room ? <p>{row.rate ? `${row.room} · ${row.rate}` : row.room}</p> : null}
            {row.travelers ? <p>{row.travelers}</p> : null}
            <p className="text-xs">Compte interne : {row.origin}</p>
          </div>
          {row.status === "pending" || row.status === "issued" ? (
            <div className="flex flex-wrap gap-2 px-4 pb-4">
              {row.status === "pending" ? (
                <>
                  <button
                    type="button"
                    disabled={!canIssue || pending !== null}
                    onClick={() => void act(row.id, "issue")}
                    className="rounded-full bg-[var(--admin-navy)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    Émettre la carte test
                  </button>
                  <button
                    type="button"
                    disabled={pending !== null}
                    onClick={() => void act(row.id, "refuse")}
                    className="rounded-full border border-[#e5e3dc] px-4 py-2 text-sm font-semibold text-[var(--admin-navy)]"
                  >
                    Refuser
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={!canIssue || pending !== null}
                  onClick={() => void act(row.id, "lock")}
                  className="rounded-full bg-[var(--admin-navy)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Bloquer après usage
                </button>
              )}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}
