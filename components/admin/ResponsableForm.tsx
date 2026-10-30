"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";

type Person = { id: string; name: string };

type People = {
  me: string;
  created_by: Person | null;
  owner: Person | null;
  intervenants: Person[];
  colleagues: Person[];
  can_assign: boolean;
  can_take: boolean;
};

/**
 * Créé par, En charge, Intervenants : tout d’un coup d’œil, un bouton à la fois.
 * « Je prends ce dossier » pour soi ; « Attribuer à… » pour un administrateur.
 */
export function ResponsableForm({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [people, setPeople] = useState<People | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [choice, setChoice] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/bookings/${bookingId}/responsable`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Lecture impossible.");
    return json as People;
  }, [bookingId]);

  useEffect(() => {
    let cancelled = false;
    void load()
      .then((json) => {
        if (!cancelled) setPeople(json);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/responsable`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Enregistrement impossible.");
        return;
      }
      setPeople(await load());
      setAssigning(false);
      setChoice("");
      router.refresh();
    } catch {
      setError("Connexion interrompue. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  const mine = Boolean(people?.owner && people.owner.id === people.me);

  return (
    <section className="admin-af-card mb-4 space-y-4 rounded-3xl p-5">
      <BusyBar active={busy} />
      <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">Qui s’en occupe</h2>
      {people == null && !error ? <p className="text-sm text-muted">Chargement…</p> : null}
      {people ? (
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-2xl bg-[var(--admin-sky)]/60 px-4 py-3">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Créé par</dt>
            <dd className="mt-1 font-semibold text-[var(--admin-navy)]">{people.created_by?.name || "Inconnu"}</dd>
          </div>
          <div className="rounded-2xl bg-[var(--admin-sky)]/60 px-4 py-3">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">En charge</dt>
            <dd className="mt-1 font-semibold text-[var(--admin-navy)]">
              {people.owner ? (
                <>
                  {people.owner.name}
                  {mine ? <span className="ml-1 text-xs font-medium text-muted">(vous)</span> : null}
                </>
              ) : (
                <span className="inline-flex items-center rounded-full bg-[var(--admin-gold)]/25 px-2.5 py-0.5 text-xs font-bold text-[var(--admin-navy)]">
                  À prendre
                </span>
              )}
            </dd>
          </div>
          <div className="rounded-2xl bg-[var(--admin-sky)]/60 px-4 py-3">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Intervenants</dt>
            <dd className="mt-1 font-semibold text-[var(--admin-navy)]">
              {people.intervenants.length ? people.intervenants.map((person) => person.name).join(", ") : "Personne encore"}
            </dd>
          </div>
        </dl>
      ) : null}

      {people && !assigning ? (
        <div className="flex flex-wrap items-center gap-2">
          {people.can_take && !mine ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void patch({ action: "prendre" })}
              className="admin-af-btn admin-tap rounded-full px-4 py-2 text-sm disabled:opacity-50"
            >
              Je prends ce dossier
            </button>
          ) : null}
          {people.can_assign ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setChoice(people.owner?.id || "");
                setAssigning(true);
              }}
              className="admin-tap rounded-full border border-[var(--admin-navy)] px-4 py-2 text-sm font-semibold text-[var(--admin-navy)] disabled:opacity-50"
            >
              Attribuer à…
            </button>
          ) : null}
          {!people.can_take && !people.can_assign ? (
            <p className="text-sm text-muted">Votre rôle ne change pas le responsable.</p>
          ) : null}
        </div>
      ) : null}

      {people && assigning ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void patch({ owner_staff_id: choice || null });
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            Collègue en charge
            <select value={choice} onChange={(event) => setChoice(event.target.value)} className="admin-af-input text-sm">
              <option value="">À prendre (personne)</option>
              {people.colleagues.map((colleague) => (
                <option key={colleague.id} value={colleague.id}>
                  {colleague.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={busy} className="admin-af-btn admin-tap rounded-full px-4 py-2 text-sm disabled:opacity-50">
            Attribuer
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setAssigning(false)}
            className="admin-tap rounded-full px-3 py-2 text-sm font-semibold text-muted"
          >
            Annuler
          </button>
        </form>
      ) : null}
      {error ? <p className="text-sm font-semibold text-[var(--admin-red)]">{error}</p> : null}
    </section>
  );
}
