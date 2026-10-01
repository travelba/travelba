"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BusyBar } from "@/components/crm/BusyBar";

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
      setError(json.error || "Archivage impossible");
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
              ? "admin-tap text-xs font-semibold text-[var(--admin-red)]"
              : "rounded-full px-4 py-2 text-sm font-semibold text-[var(--admin-red)] ring-1 ring-[var(--admin-red)]/30"
          }
        >
          {busy ? "Archivage…" : confirming ? "Confirmer l’archivage" : "Archiver"}
        </button>
      </div>
      {busy ? <BusyBar label="Archivage…" /> : null}
      {confirming && !busy ? (
        <p className={`text-[11px] text-muted ${compact ? "max-w-[14rem] text-right" : "max-w-xs text-right"}`}>
          {label} est archivé. Le client ne le voit plus. Les débits quittent le grand livre. Vous pourrez le réactiver.
        </p>
      ) : null}
      {error ? <p className="text-xs text-[var(--admin-red)]">{error}</p> : null}
    </div>
  );
}

export function DuplicateBookingButton({
  bookingId,
  compact = false,
}: {
  bookingId: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/bookings/${bookingId}/duplicate`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.booking?.id) {
      setBusy(false);
      setError(json.error || "Copie impossible");
      return;
    }
    router.push(`/admin/reservations/${json.booking.id}`);
    router.refresh();
  }

  return (
    <div className={compact ? "flex flex-col items-end gap-1" : "space-y-2"}>
      <button
        type="button"
        disabled={busy}
        onClick={() => void copy()}
        className={
          compact
            ? "admin-tap text-xs font-semibold text-[var(--admin-navy)]"
            : "admin-tap rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--admin-navy)] disabled:opacity-50"
        }
      >
        {busy ? "Copie…" : "Dupliquer"}
      </button>
      {busy ? <BusyBar label="Copie du dossier…" /> : null}
      {error ? <p className="text-xs text-[var(--admin-red)]">{error}</p> : null}
    </div>
  );
}

export function RestoreBookingButton({
  bookingId,
  compact = false,
}: {
  bookingId: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    if (!confirming) {
      setConfirming(true);
      setError(null);
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/bookings/${bookingId}/restore`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    setConfirming(false);
    if (!res.ok) {
      setError(json.error || "Réactivation impossible");
      return;
    }
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
          onClick={() => void restore()}
          className={
            compact
              ? "admin-tap text-xs font-semibold text-[var(--admin-navy)]"
              : "admin-af-btn admin-tap rounded-full px-4 py-2 text-sm disabled:opacity-50"
          }
        >
          {busy ? "Réactivation…" : confirming ? "Confirmer" : "Réactiver"}
        </button>
      </div>
      {busy ? <BusyBar label="Réactivation…" /> : null}
      {confirming && !busy ? (
        <p className={`text-[11px] text-muted ${compact ? "max-w-[14rem] text-right" : "max-w-xs text-right"}`}>
          Le dossier revient dans la liste. Les débits du grand livre sont recalculés.
        </p>
      ) : null}
      {error ? <p className="text-xs text-[var(--admin-red)]">{error}</p> : null}
    </div>
  );
}
