"use client";

import { useState } from "react";

export type HandoffResult = {
  status: "agency" | "robot";
  line?: string;
  at?: string;
};

/** Rendre le fil au Concierge, ou le reprendre, avec un état visible. */
export function WhatsappHoldButton({
  phone,
  customerId,
  held,
  className,
  onResult,
}: {
  phone: string;
  customerId: string | null;
  held: boolean;
  className?: string;
  onResult: (result: HandoffResult) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const action = held ? "resume" : "takeover";

  async function act() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, phone, customerId }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string; line?: string; at?: string } | null;
      if (!response.ok) {
        setError(
          data?.error ||
            (held
              ? "La conversation n’a pas pu être rendue au Concierge. Réessayez."
              : "La reprise en main n’a pas abouti. Réessayez.")
        );
        return;
      }
      onResult({
        status: held ? "robot" : "agency",
        line: data?.line,
        at: data?.at,
      });
    } catch {
      setError(
        held
          ? "La conversation n’a pas pu être rendue au Concierge. Réessayez."
          : "La reprise en main n’a pas abouti. Réessayez."
      );
    } finally {
      setBusy(false);
    }
  }

  const label = busy ? (held ? "Remise en cours…" : "Reprise en cours…") : held ? "Rendre au Concierge" : "Reprendre la main";

  return (
    <div className="min-w-0">
      <button
        type="button"
        className={className}
        disabled={busy}
        aria-busy={busy}
        onClick={() => void act()}
      >
        {label}
      </button>
      {error ? (
        <p role="alert" className="mt-1 max-w-xs text-xs font-medium leading-snug text-[#0B192C]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
