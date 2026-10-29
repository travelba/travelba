"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RestaurantRecord } from "@/lib/crm/restaurants";
import { categoryLabel, platformLabel, RESTAURANT_CATEGORIES, RESTAURANT_PLATFORMS } from "@/lib/crm/restaurants";

const inputClass = "min-h-11 w-full rounded-xl border border-[#d9d1c3] bg-white px-3 text-sm text-[#0B192C]";

type Draft = {
  name: string;
  city: string;
  address: string;
  lat: string;
  lng: string;
  phone: string;
  website: string;
  categories: string[];
  extraCategory: string;
  platform: string;
  bookingUrl: string;
  bot: "oui" | "partiel" | "non";
  guaranteeCard: boolean;
  cancelHours: string;
  cancelFeeEuros: string;
  closedWeekdays: number[];
  annualClosures: string;
  status: "actif" | "exclu";
  exclusionReason: string;
  starred: boolean;
  prepaidRequired: boolean;
  note: string;
  photos: string;
  signaturePhoto: string;
  menuPhoto: string;
  pitch: string;
  priceBand: string;
  placeUrl: string;
};

const EMPTY: Draft = {
  name: "",
  city: "",
  address: "",
  lat: "",
  lng: "",
  phone: "",
  website: "",
  categories: [],
  extraCategory: "",
  platform: "",
  bookingUrl: "",
  bot: "non",
  guaranteeCard: false,
  cancelHours: "",
  cancelFeeEuros: "",
  closedWeekdays: [],
  annualClosures: "",
  status: "actif",
  exclusionReason: "",
  starred: false,
  prepaidRequired: false,
  note: "",
  photos: "",
  signaturePhoto: "",
  menuPhoto: "",
  pitch: "",
  priceBand: "",
  placeUrl: "",
};

function fromRow(row: RestaurantRecord): Draft {
  const known = new Set<string>(RESTAURANT_CATEGORIES);
  return {
    ...EMPTY,
    name: row.name,
    city: row.city,
    address: row.address,
    lat: row.lat == null ? "" : String(row.lat),
    lng: row.lng == null ? "" : String(row.lng),
    phone: row.phone,
    website: row.website,
    categories: row.categories.filter((item) => known.has(item)),
    extraCategory: row.categories.filter((item) => !known.has(item)).join(", "),
    platform: row.platform || "",
    bookingUrl: row.bookingUrl,
    bot: row.bot,
    guaranteeCard: row.guaranteeCard,
    cancelHours: row.cancelHours == null ? "" : String(row.cancelHours),
    cancelFeeEuros: row.cancelFeeCents == null ? "" : String(row.cancelFeeCents / 100),
    closedWeekdays: row.closedWeekdays,
    annualClosures: row.annualClosures.map((span) => `${span.from}/${span.to}`).join("\n"),
    status: row.status,
    exclusionReason: row.exclusionReason || "",
    starred: row.starred,
    prepaidRequired: row.prepaidRequired,
    note: row.note,
    photos: row.photoUrls.join("\n"),
    signaturePhoto: row.signaturePhotoUrl,
    menuPhoto: row.menuPhotoUrl,
    pitch: row.pitch,
    priceBand: row.priceBand,
    placeUrl: row.placeUrl,
  };
}

const EXAMPLE_DRAFT: Draft = {
  ...EMPTY,
  name: "Ostuni",
  city: "Milan",
  address: "Via Solferino 12",
  placeUrl: "https://exemple.invalid/ostuni",
  photos: "https://exemple.invalid/ostuni-salle.jpg\nhttps://exemple.invalid/ostuni-bar.jpg",
  signaturePhoto: "https://exemple.invalid/ostuni-plat.jpg",
  menuPhoto: "https://exemple.invalid/ostuni-carte.jpg",
  priceBand: "90 à 140 €",
  pitch: "Une salle calme, lumière basse.",
  categories: ["italien"],
};

export function RestaurantCatalog({
  rows,
  query,
  exampleForm = false,
}: {
  rows: RestaurantRecord[];
  query: string;
  /** Ouvre la fiche avec un restaurant fictif. L’enregistrement ne part pas. */
  exampleForm?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(exampleForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(exampleForm ? EXAMPLE_DRAFT : EMPTY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function payload() {
    const categories = [...draft.categories];
    for (const extra of draft.extraCategory.split(/[,;/]/)) {
      const value = extra.trim();
      if (value && !categories.includes(value)) categories.push(value);
    }
    return {
      nom: draft.name,
      ville: draft.city,
      adresse: draft.address,
      lat: draft.lat,
      lng: draft.lng,
      telephone: draft.phone,
      site: draft.website,
      categories,
      plateforme: draft.platform,
      lien: draft.bookingUrl,
      bot: draft.bot,
      garantie: draft.guaranteeCard,
      annulation_heures: draft.cancelHours,
      annulation_frais: draft.cancelFeeEuros,
      fermeture_jours: draft.closedWeekdays,
      fermetures: draft.annualClosures,
      statut: draft.status,
      motif: draft.exclusionReason,
      etoile: draft.starred,
      prepaiement: draft.prepaidRequired,
      note: draft.note,
      photos: draft.photos,
      photo_plat: draft.signaturePhoto,
      photo_carte: draft.menuPhoto,
      description: draft.pitch,
      fourchette: draft.priceBand,
      page: draft.placeUrl,
    };
  }

  async function save(id?: string) {
    if (exampleForm) {
      setError("Aperçu fictif : rien n’est enregistré.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(id ? `/api/admin/restaurants/${id}` : "/api/admin/restaurants", {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(json?.error || "Enregistrement impossible.");
        return;
      }
      setOpen(false);
      setEditing(null);
      router.refresh();
    } catch {
      setError("Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/restaurants/${id}`, { method: "DELETE" });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(json?.error || "Retrait impossible.");
        return;
      }
      router.refresh();
    } catch {
      setError("Retrait impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <form className="flex flex-col gap-2 sm:flex-row" action="/admin/restaurants">
        <input className={inputClass} name="q" defaultValue={query} placeholder="Nom ou ville" aria-label="Chercher un restaurant" />
        <button className="admin-tap min-h-11 rounded-full bg-[#0B192C] px-4 text-sm font-semibold text-white" type="submit">
          Chercher
        </button>
        <button
          className="admin-tap min-h-11 rounded-full border border-[#0B192C] px-4 text-sm font-semibold text-[#0B192C]"
          type="button"
          onClick={() => {
            setDraft(EMPTY);
            setEditing(null);
            setOpen(true);
          }}
        >
          Nouveau
        </button>
      </form>
      {error ? <p className="text-sm font-semibold text-[#0B192C]">{error}</p> : null}
      {open ? (
        <Editor
          draft={draft}
          setDraft={setDraft}
          busy={busy}
          onSave={() => void save(editing || undefined)}
          onClose={() => setOpen(false)}
        />
      ) : null}
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="admin-af-card rounded-3xl p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-display text-lg font-semibold text-[#0B192C]">{row.name}</p>
                <p className="text-sm text-muted">
                  {row.city}
                  {row.categories.length ? ` · ${row.categories.map(categoryLabel).join(", ")}` : ""}
                </p>
                {row.pitch || row.priceBand || row.photoUrls.length ? (
                  <p className="text-sm text-muted">
                    {[row.pitch, row.priceBand, row.photoUrls.length ? `${row.photoUrls.length} photo${row.photoUrls.length > 1 ? "s" : ""}` : ""]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}
                <p className="text-sm text-[#0B192C]">
                  {row.status === "exclu" ? "Exclu" : "Actif"}
                  {row.exclusionReason ? ` · ${row.exclusionReason}` : ""}
                  {platformLabel(row.platform) ? ` · ${platformLabel(row.platform)}` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="admin-tap min-h-11 rounded-full border border-[#d9d1c3] px-3 text-sm font-semibold text-[#0B192C]"
                  onClick={() => {
                    setDraft(fromRow(row));
                    setEditing(row.id);
                    setOpen(true);
                  }}
                >
                  Modifier
                </button>
                <button
                  type="button"
                  className="admin-tap min-h-11 rounded-full border border-[#d9d1c3] px-3 text-sm font-semibold text-[#0B192C]"
                  disabled={busy}
                  onClick={() => void remove(row.id)}
                >
                  Retirer
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {rows.length ? null : <p className="text-sm text-muted">Aucun restaurant dans le catalogue.</p>}
    </div>
  );
}

function Editor({
  draft,
  setDraft,
  busy,
  onSave,
  onClose,
}: {
  draft: Draft;
  setDraft: (next: Draft) => void;
  busy: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const days = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  return (
    <form
      id="fiche-restaurant"
      className="admin-af-card space-y-3 rounded-3xl p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-[#0B192C]">
          Nom
          <input className={`${inputClass} mt-1`} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
        </label>
        <label className="text-sm text-[#0B192C]">
          Ville
          <input className={`${inputClass} mt-1`} value={draft.city} onChange={(event) => setDraft({ ...draft, city: event.target.value })} required />
        </label>
      </div>
      <fieldset className="space-y-3 rounded-2xl border border-[#d9d1c3] p-3">
        <legend className="px-1 text-sm font-semibold text-[#0B192C]">Fiche envoyée au client</legend>
        <label className="block text-sm text-[#0B192C]">
          Page, site ou Google
          <input className={`${inputClass} mt-1`} value={draft.placeUrl} onChange={(event) => setDraft({ ...draft, placeUrl: event.target.value })} autoCapitalize="off" placeholder="https://" />
        </label>
        <label className="block text-sm text-[#0B192C]">
          Photos, une adresse https par ligne. La première est la salle.
          <textarea className={`${inputClass} mt-1 min-h-24 py-2`} value={draft.photos} onChange={(event) => setDraft({ ...draft, photos: event.target.value })} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-[#0B192C]">
            Photo du plat signature
            <input className={`${inputClass} mt-1`} value={draft.signaturePhoto} onChange={(event) => setDraft({ ...draft, signaturePhoto: event.target.value })} autoCapitalize="off" placeholder="https://" />
          </label>
          <label className="text-sm text-[#0B192C]">
            Photo de la carte
            <input className={`${inputClass} mt-1`} value={draft.menuPhoto} onChange={(event) => setDraft({ ...draft, menuPhoto: event.target.value })} autoCapitalize="off" placeholder="Facultative" />
          </label>
          <label className="text-sm text-[#0B192C]">
            Fourchette par personne
            <input className={`${inputClass} mt-1`} value={draft.priceBand} onChange={(event) => setDraft({ ...draft, priceBand: event.target.value })} placeholder="90 à 140 €" />
          </label>
          <label className="text-sm text-[#0B192C] sm:col-span-2">
            Description
            <textarea className={`${inputClass} mt-1 min-h-20 py-2`} value={draft.pitch} onChange={(event) => setDraft({ ...draft, pitch: event.target.value })} />
          </label>
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-[#0B192C] sm:col-span-2">
          Adresse
          <input className={`${inputClass} mt-1`} value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} />
        </label>
        <label className="text-sm text-[#0B192C]">
          Latitude
          <input className={`${inputClass} mt-1`} inputMode="decimal" value={draft.lat} onChange={(event) => setDraft({ ...draft, lat: event.target.value })} />
        </label>
        <label className="text-sm text-[#0B192C]">
          Longitude
          <input className={`${inputClass} mt-1`} inputMode="decimal" value={draft.lng} onChange={(event) => setDraft({ ...draft, lng: event.target.value })} />
        </label>
        <label className="text-sm text-[#0B192C]">
          Téléphone
          <input className={`${inputClass} mt-1`} value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} />
        </label>
        <label className="text-sm text-[#0B192C]">
          Site
          <input className={`${inputClass} mt-1`} value={draft.website} onChange={(event) => setDraft({ ...draft, website: event.target.value })} autoCapitalize="off" />
        </label>
      </div>
      <fieldset>
        <legend className="text-sm text-[#0B192C]">Catégories</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {RESTAURANT_CATEGORIES.map((category) => {
            const on = draft.categories.includes(category);
            return (
              <button
                key={category}
                type="button"
                className={`min-h-11 rounded-full px-3 text-sm font-semibold ${on ? "bg-[#0B192C] text-white" : "border border-[#d9d1c3] bg-white text-[#0B192C]"}`}
                onClick={() =>
                  setDraft({
                    ...draft,
                    categories: on ? draft.categories.filter((item) => item !== category) : [...draft.categories, category],
                  })
                }
              >
                {categoryLabel(category)}
              </button>
            );
          })}
        </div>
        <input
          className={`${inputClass} mt-2`}
          value={draft.extraCategory}
          placeholder="Autre catégorie"
          onChange={(event) => setDraft({ ...draft, extraCategory: event.target.value })}
        />
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-[#0B192C]">
          Réservation
          <select className={`${inputClass} mt-1`} value={draft.platform} onChange={(event) => setDraft({ ...draft, platform: event.target.value })}>
            <option value="">—</option>
            {RESTAURANT_PLATFORMS.map((platform) => (
              <option key={platform} value={platform}>
                {platformLabel(platform)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-[#0B192C]">
          Lien
          <input className={`${inputClass} mt-1`} value={draft.bookingUrl} onChange={(event) => setDraft({ ...draft, bookingUrl: event.target.value })} autoCapitalize="off" />
        </label>
        <label className="text-sm text-[#0B192C]">
          Réservable par bot
          <select className={`${inputClass} mt-1`} value={draft.bot} onChange={(event) => setDraft({ ...draft, bot: event.target.value as "oui" | "partiel" | "non" })}>
            <option value="oui">Oui</option>
            <option value="partiel">Partiel</option>
            <option value="non">Non</option>
          </select>
        </label>
        <label className="text-sm text-[#0B192C]">
          Annulation, heures
          <input className={`${inputClass} mt-1`} inputMode="numeric" value={draft.cancelHours} onChange={(event) => setDraft({ ...draft, cancelHours: event.target.value })} />
        </label>
        <label className="text-sm text-[#0B192C]">
          Frais d’annulation, euros
          <input className={`${inputClass} mt-1`} inputMode="decimal" value={draft.cancelFeeEuros} onChange={(event) => setDraft({ ...draft, cancelFeeEuros: event.target.value })} />
        </label>
      </div>
      <fieldset>
        <legend className="text-sm text-[#0B192C]">Jours de fermeture</legend>
        <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-7">
          {days.map((label, index) => {
            const day = index + 1;
            const on = draft.closedWeekdays.includes(day);
            return (
              <button
                key={label}
                type="button"
                className={`min-h-11 rounded-full text-sm font-semibold ${on ? "bg-[#0B192C] text-white" : "border border-[#d9d1c3] bg-white"}`}
                onClick={() =>
                  setDraft({
                    ...draft,
                    closedWeekdays: on ? draft.closedWeekdays.filter((item) => item !== day) : [...draft.closedWeekdays, day],
                  })
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      </fieldset>
      <label className="block text-sm text-[#0B192C]">
        Fermetures annuelles, mois-jour/mois-jour
        <textarea className={`${inputClass} mt-1 min-h-20 py-2`} value={draft.annualClosures} onChange={(event) => setDraft({ ...draft, annualClosures: event.target.value })} />
      </label>
      <div className="flex flex-wrap gap-3 text-sm text-[#0B192C]">
        <label className="inline-flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={draft.guaranteeCard} onChange={(event) => setDraft({ ...draft, guaranteeCard: event.target.checked })} />
          Carte de garantie
        </label>
        <label className="inline-flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={draft.starred} onChange={(event) => setDraft({ ...draft, starred: event.target.checked })} />
          Étoilé
        </label>
        <label className="inline-flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={draft.prepaidRequired} onChange={(event) => setDraft({ ...draft, prepaidRequired: event.target.checked })} />
          Prépaiement obligatoire
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-[#0B192C]">
          Statut
          <select className={`${inputClass} mt-1`} value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Draft["status"] })}>
            <option value="actif">Actif</option>
            <option value="exclu">Exclu</option>
          </select>
        </label>
        <label className="text-sm text-[#0B192C]">
          Motif
          <select className={`${inputClass} mt-1`} value={draft.exclusionReason} onChange={(event) => setDraft({ ...draft, exclusionReason: event.target.value })}>
            <option value="">—</option>
            <option value="ferme">Fermé</option>
            <option value="gastronomique">Gastronomique</option>
            <option value="prepaiement">Prépaiement</option>
          </select>
        </label>
      </div>
      <label className="block text-sm text-[#0B192C]">
        Note interne
        <textarea className={`${inputClass} mt-1 min-h-20 py-2`} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} />
      </label>
      <p className="text-sm text-muted">Un restaurant étoilé, gastronomique ou à prépaiement obligatoire ne peut pas être choisi sur un dossier.</p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="admin-tap min-h-11 rounded-full bg-[#0B192C] px-4 text-sm font-semibold text-white disabled:opacity-50">
          Enregistrer
        </button>
        <button type="button" className="admin-tap min-h-11 rounded-full border border-[#d9d1c3] px-4 text-sm font-semibold" onClick={onClose}>
          Fermer
        </button>
      </div>
    </form>
  );
}
