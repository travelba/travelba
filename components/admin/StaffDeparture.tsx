"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";
import { ConfirmAction } from "@/components/crm/ConfirmAction";
import { departurePlan } from "@/lib/crm/agency-access";

type Person = { id: string; name: string };

/**
 * Départ d’un collègue : un seul geste. Couper l’accès (sessions fermées) et donner ses dossiers
 * en charge à un collègue. Le choix du collègue est facultatif : sans lui, les dossiers restent à prendre.
 */
export function StaffDeparture({ staffId, name, active }: { staffId: string; name: string; active: boolean }) {
  const router = useRouter();
  const [owned, setOwned] = useState<number | null>(null);
  const [colleagues, setColleagues] = useState<Person[]>([]);
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/admin/equipe/${staffId}/depart`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Lecture impossible.");
        if (cancelled) return;
        setOwned(typeof json.owned === "number" ? json.owned : 0);
        setColleagues(json.colleagues || []);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [staffId]);

  async function run(cutAccess: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/equipe/${staffId}/depart`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ couper: cutAccess, reassign_to: to || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return json.error || "Opération impossible.";
      const toName = colleagues.find((row) => row.id === to)?.name || null;
      setDone(departurePlan({ ownedCount: json.moved ?? 0, reassignToName: toName, cutAccess }));
      setOwned(0);
      router.refresh();
      return undefined;
    } catch {
      return "Connexion interrompue. Réessayez.";
    } finally {
      setBusy(false);
    }
  }

  const ownedLabel = owned == null ? "…" : owned === 0 ? "aucun dossier en charge" : `${owned} dossier${owned > 1 ? "s" : ""} en charge`;

  return (
    <section className="admin-af-card mt-6 space-y-4 rounded-3xl p-5">
      <BusyBar active={busy} />
      <div>
        <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">Départ</h2>
        <p className="mt-1 text-sm text-muted">
          {name} a {ownedLabel}. Couper l’accès ferme ses sessions ; ses dossiers passent au collègue choisi, sinon ils
          restent à prendre.
        </p>
      </div>
      {done ? (
        <ul className="rounded-2xl bg-[var(--admin-sky)]/60 px-4 py-3 text-sm font-semibold text-[var(--admin-navy)]">
          {done.length ? done.map((line) => <li key={line}>{line}</li>) : <li>Rien à faire.</li>}
        </ul>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            Réattribuer ses dossiers à
            <select value={to} onChange={(event) => setTo(event.target.value)} className="admin-af-input text-sm" disabled={busy}>
              <option value="">Personne (à prendre)</option>
              {colleagues.map((colleague) => (
                <option key={colleague.id} value={colleague.id}>
                  {colleague.name}
                </option>
              ))}
            </select>
          </label>
          {to && (owned ?? 0) > 0 ? (
            <ConfirmAction
              size="sm"
              label="Réattribuer seulement"
              confirmLabel="Réattribuer"
              busyLabel="Réattribution…"
              ariaLabel={`Réattribuer les dossiers de ${name}`}
              question={`Les ${owned} dossier${(owned ?? 0) > 1 ? "s" : ""} de ${name} passent à ${colleagues.find((row) => row.id === to)?.name || "ce collègue"}. L’accès reste ouvert.`}
              disabled={busy}
              onConfirm={() => run(false)}
            />
          ) : null}
          <ConfirmAction
            size="sm"
            tone="danger"
            label={active ? "Couper l’accès" : "Fermer les sessions"}
            confirmLabel="Confirmer le départ"
            busyLabel="Départ…"
            ariaLabel={`Couper l’accès de ${name}`}
            question={
              to
                ? `${name} ne se connecte plus et ses dossiers passent à ${colleagues.find((row) => row.id === to)?.name || "ce collègue"}.`
                : `${name} ne se connecte plus. Ses dossiers restent à prendre.`
            }
            disabled={busy}
            onConfirm={() => run(true)}
          />
        </div>
      )}
      {error ? <p className="text-sm text-[var(--admin-red)]">{error}</p> : null}
    </section>
  );
}
