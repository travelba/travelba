"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteBookingButton({
  bookingId,
  label,
  compact = false,
  redirectTo = "/admin/reservations",
}: {
  bookingId: string;
  label: string;
  compact?: boolean;
  redirectTo?: string | null;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!confirming) {
      setConfirming(true);
      setError(null);
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/bookings/${bookingId}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Suppression impossible");
      return;
    }
    if (redirectTo) router.push(redirectTo);
    router.refresh();
  }

  return (
    <div className={compact ? "flex flex-col items-end gap-1" : "space-y-2"}>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {confirming ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(false)}
            className="text-xs font-semibold text-muted"
          >
            Annuler
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void remove()}
          className={
            compact
              ? "text-xs font-semibold text-[var(--admin-red)]"
              : "rounded-full px-4 py-2 text-sm font-semibold text-[var(--admin-red)] ring-1 ring-[var(--admin-red)]/30"
          }
        >
          {busy ? "Suppression…" : confirming ? "Confirmer" : "Supprimer"}
        </button>
      </div>
      {confirming && !busy ? (
        <p className={`text-[11px] text-muted ${compact ? "max-w-[14rem] text-right" : "max-w-xs text-right"}`}>
          {label} sera effacé, avec ses cartes. Les débits liés au dossier quittent le grand livre. Les virements restent.
        </p>
      ) : null}
      {error ? <p className="text-xs text-[var(--admin-red)]">{error}</p> : null}
    </div>
  );
}
