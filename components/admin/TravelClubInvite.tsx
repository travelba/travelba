"use client";

import { FormEvent, useState } from "react";
import { TRAVEL_CLUB_FEE_LABEL, TRAVEL_CLUB_MANAGER, TRAVEL_CLUB_NAME } from "@/lib/crm/signup-options";

export function TravelClubInvite({
  customerId,
  firstName,
  remaining,
  cap,
}: {
  customerId: string;
  firstName: string;
  remaining: number | null;
  cap: number;
}) {
  const [guest, setGuest] = useState("");
  const [phone, setPhone] = useState("");
  const [left, setLeft] = useState(remaining);
  const [info, setInfo] = useState<string | null>(null);
  const [share, setShare] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function send(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const response = await fetch("/api/admin/inscriptions/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "parrainage",
        referrerCustomerId: customerId,
        firstName: guest,
        phone,
        send: true,
      }),
    });
    const json = (await response.json().catch(() => ({}))) as {
      error?: string;
      envoye?: boolean;
      partage?: string;
      restantes?: number | null;
    };
    setLoading(false);
    if (!response.ok) {
      setError(json.error || "L’invitation n’a pas été envoyée.");
      return;
    }
    if (typeof json.restantes === "number") setLeft(json.restantes);
    setShare(json.envoye ? null : json.partage || null);
    setInfo(json.envoye ? "Le message WhatsApp est parti au nom du membre." : "Lien prêt à partager. Rien n’est parti chez Meta.");
    setGuest("");
    setPhone("");
  }

  return (
    <section className="admin-af-card space-y-3 rounded-3xl px-5 py-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">{TRAVEL_CLUB_NAME}</p>
        <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">{firstName} est membre</h2>
        <p className="mt-1 text-sm text-muted">
          Adhésion {TRAVEL_CLUB_FEE_LABEL}. Gestionnaire {TRAVEL_CLUB_MANAGER}.
        </p>
        <p className="mt-1 text-sm font-semibold text-[var(--admin-navy)]">
          {left == null ? "Compteur indisponible." : `${left} invitation${left > 1 ? "s" : ""} restante${left > 1 ? "s" : ""} sur ${cap}.`}
        </p>
      </div>
      <form onSubmit={send} className="space-y-2">
        <p className="text-sm font-semibold">Inviter un proche au nom de {firstName}</p>
        <input className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" placeholder="Prénom du proche" value={guest} onChange={(event) => setGuest(event.target.value)} required />
        <input className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" placeholder="Téléphone" value={phone} onChange={(event) => setPhone(event.target.value)} required />
        <button type="submit" disabled={loading || left === 0} className="rounded-full bg-[var(--admin-navy)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">
          {left === 0 ? "Plafond atteint" : "Envoyer l’invitation"}
        </button>
      </form>
      {share ? (
        <a className="text-sm font-semibold underline" href={share} target="_blank" rel="noreferrer">
          Ouvrir le message WhatsApp
        </a>
      ) : null}
      {info ? <p className="text-sm">{info}</p> : null}
      {error ? <p className="text-sm font-semibold text-[var(--admin-red)]">{error}</p> : null}
    </section>
  );
}
