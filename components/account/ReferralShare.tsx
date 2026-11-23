"use client";

import { FormEvent, useState } from "react";
import { TRAVEL_CLUB_FEE_LABEL, TRAVEL_CLUB_MANAGER, TRAVEL_CLUB_NAME } from "@/lib/crm/signup-options";

export function ReferralShare({
  code,
  link,
  remaining,
  cap,
  firstName,
}: {
  code: string;
  link: string;
  remaining: number;
  cap: number;
  firstName: string;
}) {
  const [copied, setCopied] = useState(false);
  const [guest, setGuest] = useState("");
  const [phone, setPhone] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [share, setShare] = useState<string | null>(null);
  const [left, setLeft] = useState(remaining);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (guest.trim().length < 1 || phone.trim().length < 5) {
      setError("Indiquez le prénom et le téléphone.");
      return;
    }
    setLoading(true);
    setError(null);
    setInfo(null);
    const response = await fetch("/api/client/parrainage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName: guest, phone, confirmer: Boolean(preview) }),
    });
    const json = (await response.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
      partage?: string | null;
      envoye?: boolean;
      restantes?: number | null;
      apercu?: boolean;
    };
    setLoading(false);
    if (!response.ok) {
      setError(json.error || "L’invitation n’a pas pu partir.");
      return;
    }
    if (json.apercu) {
      setPreview(json.message || "");
      return;
    }
    setPreview(null);
    setShare(json.envoye ? null : json.partage || null);
    if (typeof json.restantes === "number") setLeft(json.restantes);
    setInfo(json.envoye ? "Le message WhatsApp est parti." : "Le lien est prêt. WhatsApp s’ouvre pour l’envoi.");
    setGuest("");
    setPhone("");
  }

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-white p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">{TRAVEL_CLUB_NAME}</p>
      <h2 className="mt-1 text-sm font-semibold text-[var(--admin-navy)]">Inviter un proche</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        {left} invitation{left > 1 ? "s" : ""} restante{left > 1 ? "s" : ""} sur {cap}. L’adhésion, {TRAVEL_CLUB_FEE_LABEL}, est présentée par {TRAVEL_CLUB_MANAGER}.
      </p>
      <p className="mt-2 text-sm">
        Votre code <span className="font-semibold text-[var(--admin-navy)]">{code}</span>
      </p>
      <button type="button" onClick={() => void copy()} className="mt-2 text-sm font-semibold underline">
        {copied ? "Lien copié" : "Copier le lien"}
      </button>
      <form noValidate onSubmit={send} className="mt-4 space-y-2">
        <input
          className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
          placeholder="Prénom"
          value={guest}
          onChange={(event) => {
            setGuest(event.target.value);
            setPreview(null);
          }}
          required
        />
        <input
          className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
          placeholder="Téléphone"
          value={phone}
          onChange={(event) => {
            setPhone(event.target.value);
            setPreview(null);
          }}
          required
        />
        {preview ? <p className="text-sm leading-relaxed text-[var(--admin-navy)]">{preview}</p> : null}
        <button
          type="submit"
          disabled={loading || left < 1}
          className="rounded-full bg-[var(--admin-navy)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {left < 1 ? "Plafond atteint" : preview ? "Envoyer" : "Préparer l’invitation"}
        </button>
      </form>
      {share ? (
        <a href={share} className="mt-3 inline-flex text-sm font-semibold underline" target="_blank" rel="noreferrer">
          Ouvrir WhatsApp
        </a>
      ) : null}
      {info ? <p className="mt-2 text-sm">{info}</p> : null}
      {error ? <p className="mt-2 text-sm font-semibold text-[var(--admin-red)]">{error}</p> : null}
      <p className="sr-only">
        {firstName} invite dans {TRAVEL_CLUB_NAME}
      </p>
    </section>
  );
}
