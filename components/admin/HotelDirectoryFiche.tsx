"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Contact = { email: string | null; phone: string | null; email_status: "a_verifier" | "verifie" | null };

type Fiche = {
  nom: string;
  ville: string;
  pays: string;
  adresse: string | null;
  site: string | null;
  description: string | null;
  heure_arrivee: string | null;
  heure_depart: string | null;
  contacts: { reception: Contact; reservations: Contact; concierge: Contact };
  photos: { chemin: string; url: string; legende: string }[];
  sources: string[];
  statut: "auto" | "verified";
  statut_libelle: string;
};

const ROLES = [
  ["reception", "Réception"],
  ["reservations", "Réservations"],
  ["concierge", "Concierge"],
] as const;

export function HotelDirectoryFiche({
  bookingId,
  itemId,
  revision,
}: {
  bookingId: string;
  itemId: string;
  revision: number;
}) {
  const router = useRouter();
  const [fiche, setFiche] = useState<Fiche | null>(null);
  const [missing, setMissing] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancel = false;
    void fetch(`/api/admin/bookings/${bookingId}/hotel-fiche?itemId=${encodeURIComponent(itemId)}`)
      .then((res) => res.json())
      .then((payload: { fiche?: Fiche | null; message?: string }) => {
        if (cancel) return;
        setFiche(payload.fiche || null);
        setMissing(!payload.fiche);
        setNote(payload.message || "");
      })
      .catch(() => {
        if (!cancel) setMissing(true);
      });
    return () => {
      cancel = true;
    };
  }, [bookingId, itemId, revision]);

  async function valider() {
    if (busy || !fiche || fiche.statut === "verified") return;
    setBusy(true);
    setNote("");
    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}/hotel-fiche`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, action: "valider" }),
      });
      const payload = (await res.json().catch(() => null)) as { fiche?: Fiche; message?: string; error?: string } | null;
      if (!res.ok || !payload?.fiche) {
        setNote(payload?.error || "La fiche n’a pas été validée.");
        return;
      }
      setFiche(payload.fiche);
      setNote(payload.message || "Fiche validée. Aucun message n’est envoyé.");
      router.refresh();
    } catch {
      setNote("La fiche n’a pas été validée.");
    } finally {
      setBusy(false);
    }
  }

  if (missing && !fiche) {
    return <p className="text-xs text-muted">Pas encore de fiche pour cet hôtel. La recherche en crée une.</p>;
  }
  if (!fiche) return null;
  const verified = fiche.statut === "verified";
  return (
    <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--admin-cream,#f7f4ef)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">Fiche hôtel</p>
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--admin-navy)] ring-1 ring-[var(--border)]">
          {fiche.statut_libelle}
        </span>
      </div>
      {fiche.description ? <p className="text-sm text-[var(--admin-navy)]">{fiche.description}</p> : null}
      {fiche.adresse || fiche.site || fiche.heure_arrivee || fiche.heure_depart ? (
        <p className="text-xs text-muted">
          {[fiche.adresse, fiche.site, fiche.heure_arrivee ? `Arrivée ${fiche.heure_arrivee}` : "", fiche.heure_depart ? `Départ ${fiche.heure_depart}` : ""]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
      {fiche.photos.length ? (
        <div className="flex gap-2 overflow-x-auto">
          {fiche.photos.map((photo) => (
            // eslint-disable-next-line @next/next/no-img-element -- photo du bucket public, hors next/image
            <img
              key={photo.chemin || photo.url}
              src={photo.url}
              alt={photo.legende || fiche.nom}
              referrerPolicy="no-referrer"
              className="h-20 w-28 shrink-0 rounded-xl object-cover"
            />
          ))}
        </div>
      ) : null}
      <ul className="space-y-1 text-sm text-[var(--admin-navy)]">
        {ROLES.map(([role, label]) => {
          const contact = fiche.contacts[role];
          if (!contact.email && !contact.phone) return null;
          return (
            <li key={role}>
              <span className="font-semibold">{label}</span>
              {contact.email ? ` · ${contact.email}` : ""}
              {contact.phone ? ` · ${contact.phone}` : ""}
              {contact.email ? (
                <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-muted">
                  {contact.email_status === "verifie" ? "Vérifié" : "À vérifier"}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {fiche.sources.length ? (
        <ul className="space-y-0.5 text-xs text-muted">
          {fiche.sources.map((source) => (
            <li key={source} className="truncate">
              <a href={source} className="underline" target="_blank" rel="noreferrer">
                {source}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="admin-tap inline-flex h-11 items-center justify-center rounded-full bg-[var(--admin-navy)] px-3 text-xs font-semibold text-white disabled:opacity-40 lg:h-8"
          disabled={busy || verified}
          onClick={() => void valider()}
        >
          Valider la fiche
        </button>
        <p className="text-xs text-muted">{note || "Aucun message n’est envoyé."}</p>
      </div>
    </section>
  );
}
