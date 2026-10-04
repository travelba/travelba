"use client";

import { useId, useState } from "react";
import { BusyBar } from "@/components/crm/BusyBar";

/**
 * Bouton à confirmation en deux temps, inline : premier clic → question + [Confirmer] [Annuler].
 * `onConfirm` renvoie une chaîne pour afficher une erreur, rien quand tout va bien.
 * Même composant côté agence et côté client : garder cette API.
 */
export function ConfirmAction({
  label,
  confirmLabel = "Confirmer",
  question,
  onConfirm,
  tone = "default",
  size = "md",
  busyLabel,
  disabled = false,
  className = "",
  align = "start",
  ariaLabel,
}: {
  label: string;
  confirmLabel?: string;
  question: string;
  onConfirm: () => Promise<string | null | undefined | void>;
  tone?: "danger" | "default";
  size?: "sm" | "md";
  busyLabel?: string;
  disabled?: boolean;
  className?: string;
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

  async function run() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await onConfirm();
      if (typeof result === "string" && result.trim()) {
        setError(result);
        return;
      }
      setArmed(false);
    } catch {
      setError("Action impossible. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`flex flex-col gap-1.5 ${alignClass} ${className}`}>
      {armed ? (
        <div className={`flex flex-col gap-2 ${alignClass}`} role="group" aria-describedby={questionId}>
          <p id={questionId} className="max-w-xs text-xs text-muted">
            {question}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy || disabled}
              onClick={() => void run()}
              className={`admin-tap inline-flex items-center justify-center rounded-full font-semibold disabled:opacity-50 ${height} ${confirmTone}`}
            >
              {busy ? busyLabel || "…" : confirmLabel}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setArmed(false);
                setError(null);
              }}
              className={`admin-tap inline-flex items-center justify-center rounded-full bg-white font-semibold text-[var(--admin-navy)] ring-1 ring-[var(--border)] disabled:opacity-50 ${height}`}
            >
              Annuler
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
          onClick={() => {
            setError(null);
            setArmed(true);
          }}
          className={`admin-tap inline-flex items-center justify-center rounded-full bg-white font-semibold disabled:opacity-50 ${height} ${trigger}`}
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
