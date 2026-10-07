"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ConfirmDialog } from "@/components/crm/ConfirmDialog";
import { Icon } from "@/components/crm/icons";
import { adminAction } from "@/lib/crm/admin-action";
import { useIsClient } from "@/lib/crm/use-is-client";

function IconHover({ label, children }: { label: string; children: ReactNode }) {
  const mounted = useIsClient();
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);

  function show(target: HTMLElement) {
    const rect = target.getBoundingClientRect();
    setTip({ x: rect.right, y: rect.top });
  }

  return (
    <span
      className="inline-flex"
      onMouseEnter={(event) => show(event.currentTarget)}
      onMouseLeave={() => setTip(null)}
      onFocus={(event) => show(event.currentTarget)}
      onBlur={() => setTip(null)}
    >
      {children}
      {tip && mounted
        ? createPortal(
            <span
              role="tooltip"
              style={{ position: "fixed", top: Math.max(8, tip.y - 8), left: tip.x, transform: "translate(-100%, -100%)" }}
              className="pointer-events-none z-[70] whitespace-nowrap rounded-lg bg-[var(--admin-navy)] px-2.5 py-1 text-[11px] font-semibold text-[#faf9f6] shadow-lg"
            >
              {label}
            </span>,
            document.body
          )
        : null}
    </span>
  );
}

function ActionTrigger({
  label,
  icon,
  tone = "default",
  iconOnly = false,
  compact = false,
  disabled = false,
  onClick,
}: {
  label: string;
  icon: "content_copy" | "archive" | "unarchive";
  tone?: "danger" | "default";
  iconOnly?: boolean;
  compact?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  if (iconOnly) {
    const toneClass =
      tone === "danger"
        ? "text-[var(--admin-red)] ring-[var(--admin-red)]/35"
        : "text-[var(--admin-navy)] ring-[var(--border)]";
    return (
      <IconHover label={label}>
        <button
          type="button"
          disabled={disabled}
          aria-label={label}
          aria-haspopup="dialog"
          onClick={onClick}
          className={`admin-tap inline-flex h-9 w-9 items-center justify-center rounded-full bg-white ring-1 transition hover:bg-[var(--admin-sky)] disabled:opacity-50 ${toneClass}`}
        >
          <Icon name={icon} className="h-4 w-4" />
        </button>
      </IconHover>
    );
  }

  const height = compact ? "min-h-9 px-3 text-xs" : "min-h-11 px-4 text-sm";
  const toneClass =
    tone === "danger"
      ? "text-[var(--admin-red)] ring-1 ring-[var(--admin-red)]/30"
      : "text-[var(--admin-navy)] ring-1 ring-[var(--border)]";
  return (
    <button
      type="button"
      disabled={disabled}
      aria-haspopup="dialog"
      onClick={onClick}
      className={`admin-tap inline-flex items-center justify-center rounded-full bg-white font-semibold disabled:opacity-50 ${height} ${toneClass}`}
    >
      {label}
    </button>
  );
}

/** Archive le dossier (la route DELETE archive, elle ne supprime pas). Le bouton dit Archiver. */
export function ArchiveBookingButton({
  bookingId,
  label,
  compact = false,
  iconOnly = false,
  redirectTo = "/admin/reservations",
}: {
  bookingId: string;
  label: string;
  compact?: boolean;
  iconOnly?: boolean;
  redirectTo?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function archive() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await adminAction(`/api/admin/bookings/${bookingId}`, { method: "DELETE" });
    if (!result.ok) {
      setBusy(false);
      setError(result.error || "Archivage impossible");
      return;
    }
    setOpen(false);
    setBusy(false);
    if (redirectTo) router.push(redirectTo);
    router.refresh();
  }

  return (
    <>
      <ActionTrigger
        label="Archiver"
        icon="archive"
        tone="danger"
        iconOnly={iconOnly}
        compact={compact}
        disabled={busy}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      />
      <ConfirmDialog
        open={open}
        title="Archiver le dossier"
        question={`${label} est archivé. Le client ne le voit plus. Les débits quittent le grand livre. Vous pourrez le réactiver.`}
        confirmLabel="Archiver"
        tone="danger"
        busy={busy}
        busyLabel="Archivage…"
        error={error}
        onConfirm={() => void archive()}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
      />
    </>
  );
}

export function DuplicateBookingButton({
  bookingId,
  label = "Ce dossier",
  compact = false,
  iconOnly = false,
}: {
  bookingId: string;
  label?: string;
  compact?: boolean;
  iconOnly?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
    setOpen(false);
    router.push(`/admin/reservations/${nextId}`);
    router.refresh();
  }

  return (
    <>
      <ActionTrigger
        label="Dupliquer"
        icon="content_copy"
        iconOnly={iconOnly}
        compact={compact}
        disabled={busy}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      />
      <ConfirmDialog
        open={open}
        title="Dupliquer le dossier"
        question={`${label} est copié. Le nouveau dossier reste en préparation : le client ne le voit pas.`}
        confirmLabel="Dupliquer"
        busy={busy}
        busyLabel="Copie…"
        error={error}
        onConfirm={() => void copy()}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
      />
    </>
  );
}

export function RestoreBookingButton({
  bookingId,
  compact = false,
  iconOnly = false,
}: {
  bookingId: string;
  compact?: boolean;
  iconOnly?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await adminAction(`/api/admin/bookings/${bookingId}/restore`, { method: "POST" });
    if (!result.ok) {
      setBusy(false);
      setError(result.error || "Réactivation impossible");
      return;
    }
    setOpen(false);
    setBusy(false);
    router.refresh();
  }

  return (
    <>
      <ActionTrigger
        label="Réactiver"
        icon="unarchive"
        iconOnly={iconOnly}
        compact={compact}
        disabled={busy}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      />
      <ConfirmDialog
        open={open}
        title="Réactiver le dossier"
        question="Le dossier revient dans la liste. Les débits du grand livre sont recalculés."
        confirmLabel="Réactiver"
        busy={busy}
        busyLabel="Réactivation…"
        error={error}
        onConfirm={() => void restore()}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
      />
    </>
  );
}
