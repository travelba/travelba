"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "@/components/crm/icons";

type Traveler = { id: string; name: string };
type Defaults = {
  depart: string;
  arrivee: string;
  allerDate: string;
  retourDate: string;
  allerCreneau: string;
  retourCreneau: string;
};

const compactField =
  "h-8 w-full rounded-lg border border-[var(--border)] bg-white px-2 text-xs text-[var(--admin-navy)] outline-none focus:border-[var(--admin-navy)] disabled:bg-[#f3f5f7]";

function Field({ label, muted = false, children }: { label: string; muted?: boolean; children: ReactNode }) {
  return (
    <div className={muted ? "opacity-40" : ""}>
      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">{label}</span>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

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
  embedded = false,
  anchorItemId = "",
  anchorSide = "",
  onDone,
  onCancel,
}: {
  bookingId: string;
  travelers: Traveler[];
  defaults: Defaults;
  initial?: TrainRequestFace | null;
  startOpen?: boolean;
  /** Aperçu local : n’écrit pas en base. */
  preview?: boolean;
  /** Formulaire seul, ouvert depuis le fil des cartes. */
  embedded?: boolean;
  anchorItemId?: string;
  anchorSide?: "" | "avant" | "apres";
  onDone?: () => void;
  onCancel?: () => void;
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

  function cancel() {
    setOpen(false);
    setError("");
    onCancel?.();
  }

  function swap() {
    setDepart(arrivee);
    setArrivee(depart);
  }

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
      onDone?.();
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
        kind: "train",
        ...(anchorItemId && anchorSide ? { anchor_item_id: anchorItemId, anchor_side: anchorSide } : {}),
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
    onDone?.();
  }

  return (
    <div className="contents">
      {embedded ? null : (
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="admin-tap whitespace-nowrap rounded-full border border-[var(--admin-navy)] px-3 py-2 text-sm font-semibold text-[var(--admin-navy)]"
      >
        {face ? `Train · ${face.statut}` : "Demande de train"}
      </button>
      )}
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
          className="basis-full rounded-2xl border border-[var(--border)] bg-white p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--admin-navy)] text-[#C5A880]">
              <Icon name="train" className="h-3.5 w-3.5" />
            </span>
            <p className="text-sm font-semibold text-[var(--admin-navy)]">Demande de train</p>
          </div>
          <div className="mt-2 inline-flex rounded-full bg-[#f3f5f7] p-0.5 text-[11px] font-semibold" role="group" aria-label="Type de trajet">
            <button
              type="button"
              aria-pressed={!simple}
              onClick={() => setSimple(false)}
              className={`rounded-full px-2.5 py-1 ${simple ? "text-muted" : "bg-[var(--admin-navy)] text-white"}`}
            >
              Aller-retour
            </button>
            <button
              type="button"
              aria-pressed={simple}
              onClick={() => setSimple(true)}
              className={`rounded-full px-2.5 py-1 ${simple ? "bg-[var(--admin-navy)] text-white" : "text-muted"}`}
            >
              Aller simple
            </button>
          </div>
          <div className="mt-2 grid grid-cols-1 items-end gap-1.5 sm:grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)]">
            <Field label="Départ">
              <input aria-label="Ville de départ" className={compactField} value={depart} onChange={(event) => setDepart(event.target.value)} required />
            </Field>
            <button
              type="button"
              aria-label="Inverser le trajet"
              onClick={swap}
              className="admin-tap mb-0.5 grid h-8 w-8 place-items-center justify-self-center rounded-full border border-[var(--border)] text-[var(--admin-navy)]"
            >
              <Icon name="sync_alt" className="h-3.5 w-3.5" />
            </button>
            <Field label="Arrivée">
              <input aria-label="Ville d’arrivée" className={compactField} value={arrivee} onChange={(event) => setArrivee(event.target.value)} required />
            </Field>
          </div>
          {departMissing ? <p className="mt-1 text-[11px] font-semibold text-[var(--admin-red)]">Saisie obligatoire : le domicile n’est pas connu.</p> : null}
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="Aller">
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                <input aria-label="Date aller" className={compactField} type="date" value={allerDate} onChange={(event) => setAllerDate(event.target.value)} required />
                <input aria-label="Créneau aller" className={compactField} value={allerCreneau} onChange={(event) => setAllerCreneau(event.target.value)} />
              </div>
            </Field>
            <Field label="Retour" muted={simple}>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                <input aria-label="Date retour" className={compactField} type="date" value={retourDate} onChange={(event) => setRetourDate(event.target.value)} required={!simple} disabled={simple} />
                <input aria-label="Créneau retour" className={compactField} value={retourCreneau} onChange={(event) => setRetourCreneau(event.target.value)} disabled={simple} />
              </div>
            </Field>
          </div>
          <fieldset className="mt-2">
            <legend className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Voyageurs</legend>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {travelers.map((traveler) => {
                const checked = selected.includes(traveler.id);
                return (
                  <label
                    key={traveler.id}
                    className={`inline-flex h-7 cursor-pointer items-center rounded-full px-2.5 text-[11px] font-semibold ${
                      checked ? "bg-[var(--admin-navy)] text-white" : "bg-[#f3f5f7] text-[var(--admin-navy)]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      aria-label={traveler.name}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked ? [...current, traveler.id] : current.filter((id) => id !== traveler.id)
                        )
                      }
                    />
                    {traveler.name}
                  </label>
                );
              })}
            </div>
          </fieldset>
          {error ? <p className="mt-2 text-xs font-semibold text-[var(--admin-red)]">{error}</p> : null}
          <div className="mt-2 flex items-center justify-end gap-3">
            <button type="button" onClick={cancel} className="text-xs font-semibold text-muted">
              Annuler
            </button>
            <button type="submit" disabled={busy} className="admin-af-btn admin-tap h-8 rounded-full px-3 text-xs disabled:opacity-50">
              {busy ? "Enregistrement…" : "Créer la demande"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
