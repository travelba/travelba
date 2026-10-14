"use client";

import { useState } from "react";

export function Mb3mFicheAction({
  customerId,
  blocker,
  sent,
}: {
  customerId: string;
  blocker: string | null;
  sent: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [known, setKnown] = useState(sent);
  const [note, setNote] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/admin/clients/${customerId}/mb3m`, { method: "POST" });
      const json = (await res.json().catch(() => null)) as { error?: string; updated?: boolean } | null;
      if (!res.ok) {
        setNote(json?.error || "La fiche MB3M n’a pas abouti.");
        return;
      }
      setNote(json?.updated || known ? "Fiche mise à jour dans MB3M." : "Fiche envoyée dans MB3M.");
      setKnown(true);
    } catch {
      setNote("La fiche MB3M n’a pas abouti.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-af-card space-y-2 rounded-3xl px-5 py-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--admin-gold-dark)]">MB3M</p>
      <p className="text-sm text-muted">
        Envoie la fiche dans MB3M : le client, et chaque société dont l’adresse de facturation est complète. Rien ne
        part à l’enregistrement.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || Boolean(blocker)}
          onClick={() => void send()}
          className="admin-tap rounded-full border border-[var(--admin-navy)] bg-white px-4 py-2 text-sm font-semibold text-[var(--admin-navy)] disabled:border-[var(--border)] disabled:opacity-50"
        >
          {busy ? "Envoi…" : "Créer dans MB3M"}
        </button>
        {blocker ? <p className="text-sm text-muted">{blocker}</p> : null}
      </div>
      {note ? <p className="text-sm text-[var(--admin-navy)]">{note}</p> : null}
    </section>
  );
}
