"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { BusyBar } from "@/components/crm/BusyBar";
import { customerDeleteConfirmed } from "@/lib/crm/delete-confirm";

/** Suppression définitive (administrateurs). Le bouton rouge ne s’active qu’une fois le nom complet saisi. */
export function DeleteCustomerButton({
  customerId,
  name,
  redirectTo = "/admin/clients",
}: {
  customerId: string;
  name: string;
  redirectTo?: string | null;
}) {
  const router = useRouter();
  const inputId = useId();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = customerDeleteConfirmed(typed, name);

  function cancel() {
    setConfirming(false);
    setTyped("");
    setError(null);
  }

  async function remove() {
    if (!confirmed || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/clients/${customerId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: typed }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Suppression impossible");
      return;
    }
    if (redirectTo) router.push(redirectTo);
    router.refresh();
  }

  if (!confirming) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--admin-red)] ring-1 ring-[var(--admin-red)]/30"
        >
          Supprimer
        </button>
        {error ? <p className="text-xs text-[var(--admin-red)]">{error}</p> : null}
      </div>
    );
  }

  return (
    <form
      className="w-full max-w-sm space-y-2 rounded-2xl border border-[var(--admin-red)]/30 bg-white p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void remove();
      }}
    >
      <BusyBar active={busy} label="Suppression…" />
      <p className="text-[11px] text-muted">
        {name} et toutes ses données (pièces, réservations, accès) seront définitivement effacés. Les
        virements déjà rapprochés reviennent dans l’inbox Revolut.
      </p>
      <label htmlFor={inputId} className="block text-xs font-semibold text-[var(--admin-navy)]">
        Saisissez « {name} » pour confirmer
      </label>
      <input
        id={inputId}
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        autoComplete="off"
        autoFocus
        disabled={busy}
        placeholder={name}
        className="admin-af-input w-full text-sm"
      />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" disabled={busy} onClick={cancel} className="text-xs font-semibold text-muted">
          Annuler
        </button>
        <button
          type="submit"
          disabled={busy || !confirmed}
          aria-disabled={busy || !confirmed}
          className="rounded-full bg-[var(--admin-red)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Suppression…" : "Supprimer définitivement"}
        </button>
      </div>
      {error ? <p className="text-xs text-[var(--admin-red)]">{error}</p> : null}
    </form>
  );
}
