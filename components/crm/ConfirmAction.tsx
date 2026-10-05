"use client";

import { useId, useState, type ReactNode } from "react";
import { BusyBar } from "@/components/crm/BusyBar";

/**
 * Ce que `onConfirm` peut renvoyer : rien (réussi), une chaîne (l’erreur à afficher),
 * ou `{ ok, error }` (résultat d’un appel `postJson` / `adminAction`).
 */
export type ConfirmOutcome = string | null | undefined | void | { ok: boolean; error?: string | null };

function outcomeError(outcome: ConfirmOutcome): string | null {
  if (typeof outcome === "string") return outcome.trim() ? outcome : null;
  if (outcome && typeof outcome === "object" && outcome.ok === false) {
    return outcome.error || "L’action n’a pas abouti. Réessayez.";
  }
  return null;
}

/**
 * Bouton à confirmation en deux temps, inline : premier clic → question + [Confirmer] [Annuler].
 * L’action ne part qu’au second clic ; l’erreur renvoyée reste affichée, l’attente est visible.
 * Même composant côté agence et côté client : garder cette API.
 */
export function ConfirmAction({
  label,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  question,
  hint = null,
  onConfirm,
  onOpenChange,
  tone = "default",
  size = "md",
  busyLabel,
  disabled = false,
  className,
  confirmClassName,
  wrapperClassName = "",
  align = "start",
  ariaLabel,
}: {
  label: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  question: string;
  /** Précision sous la question (ce qui part avec l’action). */
  hint?: ReactNode;
  onConfirm: () => Promise<ConfirmOutcome>;
  onOpenChange?: (open: boolean) => void;
  tone?: "danger" | "default";
  size?: "sm" | "md";
  busyLabel?: string;
  disabled?: boolean;
  /** Classe du bouton déclencheur ; remplace le style par défaut (pastille). */
  className?: string;
  /** Classe du bouton de confirmation ; remplace le style par défaut. */
  confirmClassName?: string;
  /** Classe du conteneur (marges, placement dans une ligne). */
  wrapperClassName?: string;
  /** Alignement de la question et des boutons (fin de ligne dans une table). */
  align?: "start" | "end";
  /** Libellé lu par les lecteurs d’écran sur le premier bouton (« Retirer Marie »). */
  ariaLabel?: string;
}) {
  const questionId = useId();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const height = size === "sm" ? "min-h-9 px-3 text-xs" : "min-h-11 px-4 text-sm";
  const trigger =
    tone === "danger"
      ? "text-[var(--admin-red)] ring-1 ring-[var(--admin-red)]/30"
      : "text-[var(--admin-navy)] ring-1 ring-[var(--border)]";
  const confirmTone =
    tone === "danger"
      ? "bg-[var(--admin-red)] text-white"
      : "bg-[var(--admin-navy)] text-[#faf9f6]";
  const alignClass = align === "end" ? "items-end text-right" : "items-start text-left";
  const questionClass =
    size === "sm" ? "max-w-xs text-xs text-muted" : "text-sm font-semibold text-[var(--admin-navy)]";

  function arm(next: boolean) {
    setArmed(next);
    setError(null);
    onOpenChange?.(next);
  }

  async function run() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const message = outcomeError(await onConfirm());
      if (message) {
        setError(message);
        return;
      }
      setArmed(false);
      onOpenChange?.(false);
    } catch {
      setError("Connexion interrompue. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`flex flex-col gap-1.5 ${alignClass} ${armed && align === "start" ? "w-full" : ""} ${wrapperClassName}`}
    >
      {armed ? (
        <div className={`flex flex-col gap-2 ${alignClass}`} role="group" aria-describedby={questionId}>
          <p id={questionId} className={questionClass}>
            {question}
          </p>
          {hint ? <div className="text-xs text-muted">{hint}</div> : null}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy || disabled}
              onClick={() => void run()}
              className={
                confirmClassName ??
                `admin-tap inline-flex items-center justify-center rounded-full font-semibold disabled:opacity-50 ${height} ${confirmTone}`
              }
            >
              {busy ? busyLabel || "…" : confirmLabel}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => arm(false)}
              className={`admin-tap inline-flex items-center justify-center rounded-full bg-white font-semibold text-[var(--admin-navy)] ring-1 ring-[var(--border)] disabled:opacity-50 ${height}`}
            >
              {cancelLabel}
            </button>
          </div>
          {busy ? (
            <div className="w-full min-w-[10rem]">
              <BusyBar label={busyLabel} />
            </div>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          onClick={() => arm(true)}
          className={
            className ??
            `admin-tap inline-flex items-center justify-center rounded-full bg-white font-semibold disabled:opacity-50 ${height} ${trigger}`
          }
        >
          {label}
        </button>
      )}
      <p aria-live="polite" className={error ? "text-xs text-[var(--admin-red)]" : "sr-only"}>
        {error || ""}
      </p>
    </div>
  );
}
