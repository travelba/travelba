"use client";

import { useState } from "react";
import { fieldControlClass } from "@/components/crm/fields";

type Traveler = { id: string; name: string };
type Defaults = {
  depart: string;
  arrivee: string;
  allerDate: string;
  retourDate: string;
  allerCreneau: string;
  retourCreneau: string;
};

export type TrainRequestFace = {
  statut: string;
  trajet: string;
  aller: string;
  retour: string | null;
  voyageurs: string[];
  placement: string;
};

export function TrainRequestButton({
  bookingId,
  travelers,
  defaults,
  initial,
  startOpen = false,
  preview = false,
}: {
  bookingId: string;
  travelers: Traveler[];
  defaults: Defaults;
  initial?: TrainRequestFace | null;
  startOpen?: boolean;
  /** Aperçu local : n’écrit pas en base. */
  preview?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [face, setFace] = useState<TrainRequestFace | null>(initial || null);
  const [simple, setSimple] = useState(!defaults.retourDate);
  const [selected, setSelected] = useState<string[]>(travelers.map((traveler) => traveler.id));
  const [depart, setDepart] = useState(defaults.depart);
  const [arrivee, setArrivee] = useState(defaults.arrivee);
  const [allerDate, setAllerDate] = useState(defaults.allerDate);
  const [retourDate, setRetourDate] = useState(defaults.retourDate);
  const [allerCreneau, setAllerCreneau] = useState(defaults.allerCreneau);
  const [retourCreneau, setRetourCreneau] = useState(defaults.retourCreneau);
  const departMissing = !depart.trim();

  async function submit() {
    if (departMissing || !arrivee.trim() || !selected.length) {
      setError(departMissing ? "La ville de départ est obligatoire." : "Complétez la demande.");
      return;
    }
    setBusy(true);
    setError("");
    const voyageurs = travelers.filter((traveler) => selected.includes(traveler.id)).map((traveler) => traveler.name);
    const jour = (iso: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(iso)
      ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" })
      : iso;
  const next: TrainRequestFace = {
      statut: "Nouvelle",
      trajet: `${depart.trim()} → ${arrivee.trim()}`,
      aller: `${jour(allerDate)} · ${allerCreneau}`,
      retour: simple ? null : `${jour(retourDate)} · ${retourCreneau}`,
      voyageurs,
      placement: voyageurs.length > 1 ? "Calculé selon les voyageurs." : "Place isolée ou côté fenêtre.",
    };
    if (preview) {
      setFace(next);
      setOpen(false);
      setBusy(false);
      return;
    }
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
    const json = (await response.json().catch(() => null)) as { error?: string; statut_libelle?: string; placement?: string } | null;
    setBusy(false);
    if (!response.ok) {
      setError(json?.error || "Enregistrement impossible.");
      return;
    }
    setFace({ ...next, statut: json?.statut_libelle || "Nouvelle", placement: json?.placement || next.placement });
    setOpen(false);
  }

  return (
    <div className="contents">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="admin-tap whitespace-nowrap rounded-full border border-[var(--admin-navy)] px-3 py-2 text-sm font-semibold text-[var(--admin-navy)]"
      >
        {face ? `Train · ${face.statut}` : "Demande de train"}
      </button>
      {face ? (
        <section className="basis-full rounded-2xl border border-[var(--border)] bg-white p-4 text-sm text-[var(--admin-navy)]">
          <p className="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-gold-dark)]">Demande de train</p>
          <p className="mt-1 text-base font-semibold">{face.trajet}</p>
          <p className="mt-1">
            Statut <span className="rounded-full bg-[#f8f3eb] px-2 py-0.5 font-semibold ring-1 ring-[var(--admin-gold)]">{face.statut}</span>
          </p>
          <p className="mt-2">Aller {face.aller}</p>
          <p>{face.retour ? `Retour ${face.retour}` : "Aller simple"}</p>
          <p className="mt-2">Voyageurs : {face.voyageurs.join(", ")}</p>
          <p>Placement : {face.placement}</p>
          <p className="mt-2 text-muted">Le bot SNCF est prévenu. En attente de propositions. Rien n’est acheté.</p>
        </section>
      ) : null}
      {open ? (
        <form
          className="basis-full space-y-3 rounded-2xl border border-[var(--border)] bg-white p-4 text-sm"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <p className="font-semibold text-[var(--admin-navy)]">Demande de train</p>
          <label className="block text-[var(--admin-navy)]">
            Ville de départ
            <input aria-label="Ville de départ" className={`${fieldControlClass} mt-1`} value={depart} onChange={(event) => setDepart(event.target.value)} required />
            {departMissing ? <span className="mt-1 block text-xs font-semibold text-[var(--admin-red)]">Saisie obligatoire : le domicile n’est pas connu.</span> : null}
          </label>
          <label className="block text-[var(--admin-navy)]">
            Ville d’arrivée
            <input aria-label="Ville d’arrivée" className={`${fieldControlClass} mt-1`} value={arrivee} onChange={(event) => setArrivee(event.target.value)} required />
          </label>
          <label className="block text-[var(--admin-navy)]">
            Date aller
            <input aria-label="Date aller" className={`${fieldControlClass} mt-1`} type="date" value={allerDate} onChange={(event) => setAllerDate(event.target.value)} required />
          </label>
          <label className="block text-[var(--admin-navy)]">
            Créneau aller
            <input aria-label="Créneau aller" className={`${fieldControlClass} mt-1`} value={allerCreneau} onChange={(event) => setAllerCreneau(event.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-[var(--admin-navy)]">
            <input type="checkbox" checked={simple} onChange={(event) => setSimple(event.target.checked)} />
            Aller simple
          </label>
          {simple ? null : (
            <>
              <label className="block text-[var(--admin-navy)]">
                Date retour
                <input aria-label="Date retour" className={`${fieldControlClass} mt-1`} type="date" value={retourDate} onChange={(event) => setRetourDate(event.target.value)} required />
              </label>
              <label className="block text-[var(--admin-navy)]">
                Créneau retour
                <input aria-label="Créneau retour" className={`${fieldControlClass} mt-1`} value={retourCreneau} onChange={(event) => setRetourCreneau(event.target.value)} />
              </label>
            </>
          )}
          <fieldset>
            <legend className="font-semibold text-[var(--admin-navy)]">Voyageurs</legend>
            {travelers.map((traveler) => (
              <label key={traveler.id} className="mt-1 flex items-center gap-2 text-[var(--admin-navy)]">
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
