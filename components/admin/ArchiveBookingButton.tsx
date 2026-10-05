"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BusyBar } from "@/components/crm/BusyBar";
import { ConfirmAction } from "@/components/crm/ConfirmAction";
import { adminAction } from "@/lib/crm/admin-action";

/** Archive le dossier (la route DELETE archive, elle ne supprime pas). Le bouton dit Archiver. */
export function ArchiveBookingButton({
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

  async function archive() {
    const result = await adminAction(`/api/admin/bookings/${bookingId}`, { method: "DELETE" });
    if (!result.ok) return result.error || "Archivage impossible";
    if (redirectTo) router.push(redirectTo);
    router.refresh();
    return undefined;
  }

  return (
    <ConfirmAction
      tone="danger"
      size={compact ? "sm" : "md"}
      align="end"
      label="Archiver"
      confirmLabel="Confirmer l’archivage"
      busyLabel="Archivage…"
      ariaLabel={`Archiver ${label}`}
      question={`${label} est archivé. Le client ne le voit plus. Les débits quittent le grand livre. Vous pourrez le réactiver.`}
      onConfirm={archive}
    />
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
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await adminAction<{ booking?: { id?: string } }>(`/api/admin/bookings/${bookingId}/duplicate`, {
      method: "POST",
    });
    const nextId = result.data?.booking?.id;
    if (!result.ok || !nextId) {
      setBusy(false);
      setError(result.error || "Copie impossible");
      return;
    }
    router.push(`/admin/reservations/${nextId}`);
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
      {error ? (
        <p role="alert" className="text-xs text-[var(--admin-red)]">
          {error}
        </p>
      ) : null}
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

  async function restore() {
    const result = await adminAction(`/api/admin/bookings/${bookingId}/restore`, { method: "POST" });
    if (!result.ok) return result.error || "Réactivation impossible";
    router.refresh();
    return undefined;
  }

  return (
    <ConfirmAction
      size={compact ? "sm" : "md"}
      align="end"
      label="Réactiver"
      confirmLabel="Confirmer"
      busyLabel="Réactivation…"
      question="Le dossier revient dans la liste. Les débits du grand livre sont recalculés."
      onConfirm={restore}
    />
  );
}
