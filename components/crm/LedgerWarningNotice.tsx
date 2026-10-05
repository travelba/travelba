"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { LEDGER_WARNING_HINT } from "@/lib/crm/ledger-warning";

/**
 * Bandeau non bloquant : enregistré, mais grand livre refusé (`ledger_warning`).
 * Se fait voir à son apparition (l’enregistrement a pu partir d’une étape plus bas dans la page).
 */
export function LedgerWarningNotice({
  message,
  onDismiss,
  className = "",
  children,
}: {
  message: string | null;
  onDismiss?: () => void;
  className?: string;
  /** Action proposée sous le texte (lien vers le dossier, etc.). */
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (message) ref.current?.scrollIntoView({ block: "nearest" });
  }, [message]);
  if (!message) return null;
  return (
    <div
      ref={ref}
      role="alert"
      className={`rounded-2xl bg-[var(--admin-peach)] px-4 py-3 text-sm text-[var(--admin-navy)] ${className}`}
    >
      <p className="font-semibold">{message}</p>
      <p className="mt-1 text-xs">{LEDGER_WARNING_HINT}</p>
      {children || onDismiss ? (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {children}
          {onDismiss ? (
            <button type="button" className="admin-tap text-xs font-semibold underline" onClick={onDismiss}>
              Compris
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
