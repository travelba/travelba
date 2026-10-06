"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminAction } from "@/lib/crm/admin-action";
import type { EstaTravelerLine } from "@/lib/crm/esta";

const TONE = {
  ok: "bg-[#0B192C] text-[#C5A880]",
  warn: "bg-[#C5A880]/25 text-[#0B192C]",
  muted: "bg-[#f4f1ea] text-[#0B192C]",
};

export function EstaOnBooking({ bookingId, rows }: { bookingId: string; rows: EstaTravelerLine[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!rows.length) return null;

  async function run(travelerId: string, action: "verify" | "send") {
    setBusy(`${action}:${travelerId}`);
    setError(null);
    const result = await adminAction(`/api/admin/bookings/${bookingId}/esta`, {
      method: "POST",
      body: { travelerId, action },
    });
    setBusy(null);
    if (!result.ok) {
      setError(result.error || "Impossible pour le moment.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#C5A880]">ESTA</p>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.travelerId} className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-[#0B192C]">{row.name}</span>
              <span className="block text-xs text-[#5c6570]">
                {row.checkedLabel}
                {row.caption ? ` · ${row.caption}` : ""}
              </span>
            </span>
            <span className="flex flex-wrap items-center justify-end gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${TONE[row.tone]}`}>{row.badge}</span>
              {row.canVerify ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void run(row.travelerId, "verify")}
                  className="admin-tap rounded-full border border-[#0B192C] px-3 py-1 text-xs font-semibold text-[#0B192C] disabled:opacity-50"
                >
                  {busy === `verify:${row.travelerId}` ? "Vérification…" : "Vérifier l’ESTA"}
                </button>
              ) : null}
              {row.canSend ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void run(row.travelerId, "send")}
                  className="admin-tap rounded-full bg-[#0B192C] px-3 py-1 text-xs font-semibold text-[#C5A880] disabled:opacity-50"
                >
                  {busy === `send:${row.travelerId}` ? "Envoi…" : "Envoyer au client"}
                </button>
              ) : null}
              {row.sent ? <span className="text-xs text-[#5c6570]">Envoyé au client</span> : null}
            </span>
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="text-sm text-[var(--admin-red)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
