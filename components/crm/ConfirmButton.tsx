"use client";

import { useState, type ReactNode } from "react";

/**
 * Bouton d'action destructive à double confirmation (2 clics), homogène avec
 * DeleteCustomerButton. Le 1er clic affiche « Confirmer / Annuler ».
 * Utiliser `children` pour un bouton icône (l'icône reste au repos, le texte
 * de confirmation s'affiche à l'étape 2).
 */
export function ConfirmButton({
  onConfirm,
  label,
  children,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  busyLabel = "…",
  className = "",
  confirmClassName = "text-xs font-semibold text-[var(--admin-red)]",
  cancelClassName = "text-xs font-semibold text-muted",
  disabled = false,
  ariaLabel,
  title,
}: {
  onConfirm: () => void | Promise<void>;
  label?: ReactNode;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  busyLabel?: string;
  className?: string;
  confirmClassName?: string;
  cancelClassName?: string;
  disabled?: boolean;
  ariaLabel?: string;
  title?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handle() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (confirming && !busy) {
    return (
      <span className="inline-flex items-center gap-2">
        <button
          type="button"
          className={confirmClassName}
          onClick={() => void handle()}
          disabled={disabled}
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          className={cancelClassName}
          onClick={() => setConfirming(false)}
        >
          {cancelLabel}
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel}
      disabled={disabled || busy}
      className={className}
      onClick={() => void handle()}
    >
      {busy ? busyLabel : (children ?? label)}
    </button>
  );
}
