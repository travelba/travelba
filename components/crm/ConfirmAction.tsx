"use client";

import { useState, type ReactNode } from "react";
import { BusyBar } from "@/components/crm/BusyBar";

export type ConfirmOutcome = { ok: boolean; error?: string | null } | void;

/**
 * Bouton qui demande confirmation en place : « {question} [Confirmer] [Annuler] ».
 * L’action ne part qu’au second clic ; l’erreur renvoyée reste affichée, le busy est visible.
 */
export function ConfirmAction({
  label,
  question,
  onConfirm,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  busyLabel = "Un instant…",
  className = "text-xs font-semibold text-accent",
  confirmClassName = "admin-af-btn inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm",
  disabled = false,
  hint = null,
  onOpenChange,
}: {
  label: ReactNode;
  question: string;
  onConfirm: () => Promise<ConfirmOutcome>;
  confirmLabel?: string;
  cancelLabel?: string;
  busyLabel?: string;
  /** Classe du bouton déclencheur. */
  className?: string;
  /** Classe du bouton de confirmation. */
  confirmClassName?: string;
  disabled?: boolean;
  /** Précision sous la question (ce qui part avec l’action). */
  hint?: ReactNode;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(next: boolean) {
    setOpen(next);
    onOpenChange?.(next);
  }

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await onConfirm();
      if (outcome && outcome.ok === false) {
        setError(outcome.error || "L’action n’a pas abouti. Réessayez.");
        return;
      }
      toggle(false);
    } catch {
      setError("Connexion interrompue. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setError(null);
          toggle(true);
        }}
        className={className}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="w-full space-y-2" aria-live="polite" role="group" aria-label={question}>
      <p className="text-sm font-semibold text-[var(--admin-navy)]">{question}</p>
      {hint ? <div className="text-xs text-muted">{hint}</div> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void confirm()} disabled={busy} className={confirmClassName}>
          {busy ? busyLabel : confirmLabel}
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null);
            toggle(false);
          }}
          disabled={busy}
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--admin-navy)]"
        >
          {cancelLabel}
        </button>
      </div>
      <BusyBar active={busy} label={busyLabel} />
      {error ? <p className="text-sm text-accent">{error}</p> : null}
    </div>
  );
}
