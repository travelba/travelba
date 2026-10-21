"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  sellCents: number;
  currency: string;
  benefits: string[];
  origin: string;
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
        <article key={row.id} className="rounded-2xl border border-[#e5e3dc] bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">{STATUS[row.status]}</p>
              <h2 className="font-display text-xl font-bold text-[var(--admin-navy)]">{row.hotelName}</h2>
              <p className="text-sm text-[#5c5348]">
                {row.guest} · {row.city} · {formatDateFr(row.checkIn)} – {formatDateFr(row.checkOut)} · {row.adults} voyageurs
              </p>
              {row.room ? <p className="text-sm text-[#5c5348]">{row.room}</p> : null}
            </div>
            <p className="font-display text-xl font-bold text-[var(--admin-navy)]">{formatMoney(row.sellCents / 100, row.currency)}</p>
          </div>
          <p className="mt-2 text-xs text-[#5c5348]">Compte interne : {row.origin}</p>
          {row.benefits.length ? <p className="mt-2 text-sm text-[var(--admin-navy)]">{row.benefits.slice(0, 4).join(" · ")}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
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
            ) : null}
            {row.status === "issued" ? (
              <button
                type="button"
                disabled={!canIssue || pending !== null}
                onClick={() => void act(row.id, "lock")}
                className="rounded-full bg-[var(--admin-navy)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                Bloquer après usage
              </button>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}
