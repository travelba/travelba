"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";
import { customerDeleteConfirmed } from "@/lib/crm/delete-confirm";

/** Reprend un doublon sur cette fiche. Le nom complet de la fiche conservée confirme. */
export function MergeCustomersButton({ customerId, name }: { customerId: string; name: string }) {
  const router = useRouter();
  const duplicateId = useId();
  const confirmId = useId();
  const [open, setOpen] = useState(false);
  const [duplicate, setDuplicate] = useState("");
  const [typed, setTyped] = useState("");
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = customerDeleteConfirmed(typed, name) && duplicate.trim().length > 0;

  async function submit() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/admin/clients/${customerId}/fusionner`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ doublon_id: duplicate.trim(), confirmer: typed, forcer: force }),
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (!response.ok) {
      setError(body?.error || "Fusion impossible.");
      return;
    }
    router.refresh();
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="admin-tap text-sm font-semibold text-[var(--admin-navy)] underline-offset-2 hover:underline"
      >
        Fusionner un doublon
      </button>
    );
  }

  return (
    <form
      className="space-y-3 rounded-2xl border border-[var(--border)] bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (confirmed) void submit();
      }}
    >
      <p className="text-sm font-semibold text-[var(--admin-navy)]">Reprendre un doublon sur {name}</p>
      <label className="block text-sm" htmlFor={duplicateId}>
        Identifiant du doublon
        <input
          id={duplicateId}
          value={duplicate}
          onChange={(event) => setDuplicate(event.target.value)}
          className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2"
          autoComplete="off"
        />
      </label>
      <label className="block text-sm" htmlFor={confirmId}>
        Nom complet de la fiche conservée
        <input
          id={confirmId}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2"
          autoComplete="off"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={force} onChange={(event) => setForce(event.target.checked)} />
        Les pièces d’identité diffèrent
      </label>
      {error ? <p className="text-sm text-[var(--admin-red)]">{error}</p> : null}
      <BusyBar active={busy} label="Fusion…" />
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={!confirmed || busy}
          className="admin-tap rounded-full bg-[var(--admin-navy)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Fusionner
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm font-semibold text-[var(--admin-navy)]">
          Annuler
        </button>
      </div>
    </form>
  );
}
