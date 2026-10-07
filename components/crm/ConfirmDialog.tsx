"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { BusyBar } from "@/components/crm/BusyBar";
import { useIsClient } from "@/lib/crm/use-is-client";

/** Popup de validation : l’action ne part qu’au clic sur le bouton de confirmation. */
export function ConfirmDialog({
  open,
  title,
  question,
  confirmLabel,
  cancelLabel = "Annuler",
  tone = "default",
  busy = false,
  busyLabel,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  question: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
  busy?: boolean;
  busyLabel?: string;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const questionId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const mounted = useIsClient();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focus = window.setTimeout(() => cancelRef.current?.focus(), 20);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focus);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || busy) return;
      event.preventDefault();
      onCloseRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy]);

  if (!open || !mounted) return null;

  const confirmClass =
    tone === "danger"
      ? "bg-[var(--admin-red)] text-white"
      : "bg-[var(--admin-navy)] text-[#faf9f6]";

  return createPortal(
    <div
      className="admin-portal fixed inset-0 z-50 flex items-end justify-center bg-[#0b192c]/55 p-3 sm:items-center"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={questionId}
        className="w-full max-w-md overflow-hidden rounded-3xl border border-[#e8e4dc] bg-white text-[#1a1c1a] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="bg-[#faf9f6] px-5 py-4">
          <p id={titleId} className="font-display text-lg font-bold text-[#0b192c]">
            {title}
          </p>
        </div>
        <div className="space-y-4 px-5 py-4">
          <p id={questionId} className="text-sm text-[#44474c]">
            {question}
          </p>
          {busy ? <BusyBar label={busyLabel} /> : null}
          {error ? (
            <p role="alert" className="text-sm text-[var(--admin-red)]">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              ref={cancelRef}
              type="button"
              disabled={busy}
              onClick={onClose}
              className="admin-tap inline-flex min-h-11 items-center justify-center rounded-full bg-white px-4 text-sm font-semibold text-[var(--admin-navy)] ring-1 ring-[var(--border)] disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onConfirm}
              className={`admin-tap inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold disabled:opacity-50 ${confirmClass}`}
            >
              {busy ? busyLabel || "…" : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
