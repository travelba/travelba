"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
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
  question: ReactNode;
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

  return createPortal(
    <ConfirmDialogCard
      title={title}
      titleId={titleId}
      question={question}
      questionId={questionId}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      tone={tone}
      busy={busy}
      busyLabel={busyLabel}
      error={error}
      cancelRef={cancelRef}
      onConfirm={onConfirm}
      onClose={onClose}
    />,
    document.body
  );
}

/** Carte du dialogue, au-dessus de la barre de navigation (z-50). Les boutons restent à l’écran. */
export function ConfirmDialogCard({
  title,
  titleId,
  question,
  questionId,
  confirmLabel,
  cancelLabel,
  tone,
  busy,
  busyLabel,
  error,
  cancelRef,
  onConfirm,
  onClose,
}: {
  title: string;
  titleId: string;
  question: ReactNode;
  questionId: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: "danger" | "default";
  busy: boolean;
  busyLabel?: string;
  error?: string | null;
  cancelRef?: { current: HTMLButtonElement | null };
  onConfirm: () => void;
  onClose: () => void;
}) {
  const confirmClass =
    tone === "danger"
      ? "bg-[var(--admin-red)] text-white"
      : "bg-[var(--admin-navy)] text-[#faf9f6]";

  return (
    <div
      className="admin-portal fixed inset-0 z-[80] flex items-end justify-center bg-[#0b192c]/55 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={questionId}
        className="flex max-h-[min(100dvh-1.5rem,40rem)] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-[#e8e4dc] bg-white text-[#1a1c1a] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shrink-0 bg-[#faf9f6] px-5 py-4">
          <p id={titleId} className="font-display text-lg font-bold text-[#0b192c]">
            {title}
          </p>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div id={questionId} className="space-y-3 text-sm leading-relaxed text-[#44474c]">
            {question}
          </div>
          {busy ? <BusyBar label={busyLabel} /> : null}
          {error ? (
            <p role="alert" className="text-sm text-[var(--admin-red)]">
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col gap-2 px-5 pb-4 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            disabled={busy}
            onClick={onClose}
            className="admin-tap inline-flex min-h-11 w-full items-center justify-center rounded-full bg-white px-4 text-sm font-semibold text-[var(--admin-navy)] ring-1 ring-[var(--border)] disabled:opacity-50 sm:w-auto"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`admin-tap inline-flex min-h-11 w-full items-center justify-center rounded-full px-4 text-center text-sm font-semibold leading-snug whitespace-normal disabled:opacity-50 sm:w-auto ${confirmClass}`}
          >
            {busy ? busyLabel || "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
