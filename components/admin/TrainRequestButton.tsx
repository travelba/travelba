"use client";

import { useState } from "react";

type Traveler = { id: string; name: string };
type Defaults = {
  depart: string;
  arrivee: string;
  allerDate: string;
  retourDate: string;
  allerCreneau: string;
  retourCreneau: string;
};

export function TrainRequestButton({
  bookingId,
  travelers,
  defaults,
}: {
  bookingId: string;
  travelers: Traveler[];
  defaults: Defaults;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [simple, setSimple] = useState(!defaults.retourDate);
  const [selected, setSelected] = useState<string[]>(travelers.map((traveler) => traveler.id));
  const [depart, setDepart] = useState(defaults.depart);
  const [arrivee, setArrivee] = useState(defaults.arrivee);
  const [allerDate, setAllerDate] = useState(defaults.allerDate);
  const [retourDate, setRetourDate] = useState(defaults.retourDate);
  const [allerCreneau, setAllerCreneau] = useState(defaults.allerCreneau);
  const [retourCreneau, setRetourCreneau] = useState(defaults.retourCreneau);

  async function submit() {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/admin/bookings/${bookingId}/demande-train`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        depart,
        arrivee,
        aller_date: allerDate,
        aller_creneau: allerCreneau,
        retour_date: simple ? "" : retourDate,
        retour_creneau: simple ? "" : retourCreneau,
        aller_simple: simple,
        voyageur_ids: selected,
      }),
    });
    const json = (await response.json().catch(() => null)) as { error?: string; statut_libelle?: string } | null;
    setBusy(false);
    if (!response.ok) {
      setError(json?.error || "Enregistrement impossible.");
      return;
    }
    setDone(json?.statut_libelle || "Nouvelle");
    setOpen(false);
  }

  return (
    <div className="contents">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="admin-tap whitespace-nowrap rounded-full border border-[var(--admin-navy)] px-3 py-2 text-sm font-semibold text-[var(--admin-navy)]"
      >
        {done ? `Train · ${done}` : "Demande de train"}
      </button>
      {open ? (
        <form
          className="basis-full space-y-3 rounded-2xl border border-[var(--border)] bg-white p-4 text-sm"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <p className="font-semibold text-[var(--admin-navy)]">Demande de train</p>
          <label className="block">
            Ville de départ
            <input className="mt-1 w-full rounded-lg border px-3 py-2" value={depart} onChange={(event) => setDepart(event.target.value)} required />
          </label>
          <label className="block">
            Ville d’arrivée
            <input className="mt-1 w-full rounded-lg border px-3 py-2" value={arrivee} onChange={(event) => setArrivee(event.target.value)} required />
          </label>
          <label className="block">
            Date aller
            <input className="mt-1 w-full rounded-lg border px-3 py-2" type="date" value={allerDate} onChange={(event) => setAllerDate(event.target.value)} required />
          </label>
          <label className="block">
            Créneau aller
            <input className="mt-1 w-full rounded-lg border px-3 py-2" value={allerCreneau} onChange={(event) => setAllerCreneau(event.target.value)} />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={simple} onChange={(event) => setSimple(event.target.checked)} />
            Aller simple
          </label>
          {simple ? null : (
            <>
              <label className="block">
                Date retour
                <input className="mt-1 w-full rounded-lg border px-3 py-2" type="date" value={retourDate} onChange={(event) => setRetourDate(event.target.value)} required />
              </label>
              <label className="block">
                Créneau retour
                <input className="mt-1 w-full rounded-lg border px-3 py-2" value={retourCreneau} onChange={(event) => setRetourCreneau(event.target.value)} />
              </label>
            </>
          )}
          <fieldset>
            <legend className="font-semibold">Voyageurs</legend>
            {travelers.map((traveler) => (
              <label key={traveler.id} className="mt-1 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.includes(traveler.id)}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked ? [...current, traveler.id] : current.filter((id) => id !== traveler.id)
                    )
                  }
                />
                {traveler.name}
              </label>
            ))}
          </fieldset>
          {error ? <p className="font-semibold text-[var(--admin-red)]">{error}</p> : null}
          <button type="submit" disabled={busy} className="admin-af-btn admin-tap rounded-full px-4 py-2 text-sm disabled:opacity-50">
            {busy ? "Enregistrement…" : "Créer la demande"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
