"use client";

import { FormEvent, useEffect, useState } from "react";
import { BusyBar } from "@/components/crm/BusyBar";

type Colleague = { id: string; name: string };

/** Visible seulement si le rôle peut changer l’agent responsable. */
export function ResponsableForm({ bookingId }: { bookingId: string }) {
  const [hidden, setHidden] = useState(false);
  const [owner, setOwner] = useState("");
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/admin/bookings/${bookingId}/responsable`)
      .then(async (res) => {
        if (res.status === 403) {
          if (!cancelled) setHidden(true);
          return;
        }
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Lecture impossible.");
        if (cancelled) return;
        setOwner(json.owner_staff_id || "");
        setColleagues(json.colleagues || []);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/responsable`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ owner_staff_id: owner || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Enregistrement impossible.");
        return;
      }
      setSaved(true);
    } catch {
      setError("Connexion interrompue. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  if (hidden) return null;

  return (
    <form onSubmit={onSubmit} className="admin-af-card mb-4 space-y-3 rounded-3xl p-5">
      <BusyBar active={busy} />
      <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">Agent responsable</h2>
      <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
        Dossier
        <select value={owner} onChange={(event) => setOwner(event.target.value)} className="admin-af-input text-sm">
          <option value="">Pool commun</option>
          {colleagues.map((colleague) => (
            <option key={colleague.id} value={colleague.id}>
              {colleague.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={busy} className="admin-af-btn admin-tap rounded-full px-4 py-2 text-sm disabled:opacity-50">
        Enregistrer
      </button>
      {saved ? <p className="text-sm font-semibold text-[var(--admin-navy)]">Responsable enregistré.</p> : null}
      {error ? <p className="text-sm font-semibold text-[var(--admin-navy)]">{error}</p> : null}
    </form>
  );
}
