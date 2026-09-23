"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BusyBar } from "@/components/crm/BusyBar";

export function DeleteCustomerButton({
  customerId,
  name,
  compact = false,
  redirectTo = "/admin/clients",
}: {
  customerId: string;
  name: string;
  compact?: boolean;
  redirectTo?: string | null;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!confirming) {
      setConfirming(true);
      setError(null);
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/clients/${customerId}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Suppression impossible");
      return;
    }
    if (redirectTo) router.push(redirectTo);
    router.refresh();
  }

  return (
    <div className={compact ? "flex flex-col items-end gap-1" : "space-y-2"}>
      <BusyBar active={busy} label="Suppression…" />
      <div className="flex flex-wrap items-center justify-end gap-2">
        {confirming ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(false)}
            className="text-xs font-semibold text-muted"
          >
            Annuler
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void remove()}
          className={
            compact
              ? "text-xs font-semibold text-[var(--admin-red)]"
              : "rounded-full px-4 py-2 text-sm font-semibold text-[var(--admin-red)] ring-1 ring-[var(--admin-red)]/30"
          }
        >
          {busy ? "Suppression…" : confirming ? "Confirmer" : "Supprimer"}
        </button>
      </div>
      {confirming && !busy ? (
        <p className={`text-[11px] text-muted ${compact ? "max-w-[14rem] text-right" : ""}`}>
          {name} et toutes ses données (pièces, réservations, accès) seront
          définitivement effacés.
        </p>
      ) : null}
      {error ? <p className="text-xs text-[var(--admin-red)]">{error}</p> : null}
    </div>
  );
}
