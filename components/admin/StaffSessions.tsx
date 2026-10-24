"use client";

import { useEffect, useState } from "react";
import { formatDateTimeFr } from "@/lib/crm/money";
import { BusyBar } from "@/components/crm/BusyBar";

type SessionRow = {
  id: string;
  session_id: string;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
};

export function StaffSessions({ staffId }: { staffId: string }) {
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/admin/equipe/${staffId}/sessions`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Lecture impossible.");
        if (!cancelled) setRows(json.sessions || []);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [staffId]);

  async function closeAll() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/equipe/${staffId}/sessions`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Fermeture impossible.");
        return;
      }
      setClosed(true);
      setRows((current) => current?.map((row) => ({ ...row, revoked_at: row.revoked_at || new Date().toISOString() })) || []);
    } catch {
      setError("Connexion interrompue. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-af-card mt-6 space-y-3 rounded-3xl p-5">
      <BusyBar active={busy} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold text-[var(--admin-navy)]">Sessions</h2>
        <button type="button" disabled={busy} onClick={() => void closeAll()} className="admin-tap text-sm font-semibold underline">
          Fermer les sessions
        </button>
      </div>
      {rows == null ? <p className="text-sm text-muted">Lecture…</p> : null}
      {rows && !rows.length ? <p className="text-sm text-muted">Aucune session enregistrée.</p> : null}
      <ul className="space-y-2 text-sm">
        {(rows || []).map((row) => (
          <li key={row.id} className="rounded-2xl border border-[var(--border)] px-3 py-2">
            <p className="font-semibold text-[var(--admin-navy)]">
              {formatDateTimeFr(row.last_seen_at)}
              {row.revoked_at ? " · fermée" : ""}
            </p>
            <p className="text-muted">
              {row.ip || "Adresse inconnue"} · {row.user_agent || "Navigateur inconnu"}
            </p>
          </li>
        ))}
      </ul>
      {closed ? <p className="text-sm font-semibold text-[var(--admin-navy)]">Les sessions ouvertes sont fermées.</p> : null}
      {error ? <p className="text-sm font-semibold text-[var(--admin-navy)]">{error}</p> : null}
    </section>
  );
}
