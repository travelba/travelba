"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { BusyBar } from "@/components/crm/BusyBar";
import { Icon } from "@/components/crm/icons";
import { greetingGivenName } from "@/lib/crm/identity";
import { HOTEL_ACCESS_UNTIL, HOTEL_CLUB_NUMBER, hotelMemberNumber } from "@/lib/crm/hotel-search-home";
import { TRAVEL_CLUB_OFFER, TRAVEL_CLUB_PRIVILEGES } from "@/lib/crm/signup-options";

export type SignupPrefill = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  birthDate?: string;
  invitationToken?: string;
  resume?: boolean;
};

export function SignupWizard({ prefill, linkUntil }: { prefill: SignupPrefill; linkUntil?: string | null }) {
  const [step, setStep] = useState(0);
  const [firstName, setFirstName] = useState(prefill.firstName || "");
  const [lastName, setLastName] = useState(prefill.lastName || "");
  const [email, setEmail] = useState(prefill.email || "");
  const [birthDate, setBirthDate] = useState(prefill.birthDate || "");
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const phone = prefill.phone || "";

  function next(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim() || !birthDate) {
      setError("Confirmez le prénom, le nom, l’e-mail et la date de naissance.");
      return;
    }
    setStep(1);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const response = await fetch("/api/inscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName,
        lastName,
        email,
        phone,
        birthDate,
        terms,
        privacy,
        company_website: companyWebsite,
        invitationToken: prefill.resume ? undefined : prefill.invitationToken,
      }),
    });
    const json = (await response.json().catch(() => ({}))) as { error?: string; errors?: { message: string }[] };
    setLoading(false);
    if (!response.ok) {
      setError(json.errors?.[0]?.message || json.error || "La demande n’a pas pu être envoyée.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="invite-letter space-y-3">
        <p className="invite-paper-kicker">Sur invitation</p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-[#0B1F3A]">Vérifiez votre e-mail</h1>
        <p className="text-sm leading-relaxed">
          Un message part pour confirmer l’adresse. Le Travel Club TBA relit ensuite la demande. L’accès reste fermé jusque-là.
        </p>
      </div>
    );
  }

  const given = greetingGivenName(firstName);
  const engraved = [given, lastName.trim()].filter(Boolean).join(" ") || "—";

  return (
    <form noValidate onSubmit={step === 0 ? next : submit}>
      {step === 0 ? (
        <>
          <section className="invite-hero" data-invite-hero="1">
            <div className="invite-hero-inner">
              <div className="invite-reveal">
                <p className="invite-mono" aria-hidden="true">
                  TBA
                </p>
                <p className="invite-kicker mt-4">Sur invitation</p>
                <p className="invite-wordmark">Travel Club TBA</p>
                <div className="invite-rule" aria-hidden="true" />
                <h1 className="invite-hello">Bonjour{given ? ` ${given}` : ""},</h1>
                <p className="invite-offer">{TRAVEL_CLUB_OFFER}</p>
              </div>
              <div className="invite-stage">
                <article className="invite-card" aria-label="Carte Platinum">
                  <div className="invite-card-top">
                    <p className="invite-card-brand">TBA</p>
                    <p className="invite-card-rank">Platinum</p>
                  </div>
                  <p className="invite-card-word">Travel Club TBA</p>
                  <p className="invite-card-person">{engraved}</p>
                  <p className="invite-card-number">
                    <span className="sr-only">{HOTEL_CLUB_NUMBER}</span>
                    {hotelMemberNumber(prefill.invitationToken || phone || "invitation")}
                  </p>
                  <p className="invite-card-until">{HOTEL_ACCESS_UNTIL}</p>
                </article>
              </div>
              <ol className="invite-chapters invite-reveal invite-reveal-late">
                {TRAVEL_CLUB_PRIVILEGES.map((item, index) => (
                  <li key={item.title}>
                    <span className="invite-index">{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <h2>{item.title}</h2>
                      <p>{item.note}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>
          <section className="invite-paper">
            <p className="invite-paper-kicker">Confirmer</p>
            <div className="mt-5 space-y-4">
              <label className="block text-[13px] font-semibold">
                Prénom
                <input className="invite-field" value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" />
              </label>
              <label className="block text-[13px] font-semibold">
                Nom
                <input className="invite-field" value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" />
              </label>
              <label className="block text-[13px] font-semibold">
                E-mail
                <input className="invite-field" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
              </label>
              <label className="block text-[13px] font-semibold">
                Téléphone
                <input className="invite-field" type="tel" value={phone} readOnly aria-readonly="true" />
              </label>
              <p className="-mt-2 text-xs text-[#5c6570]">Ce numéro est celui de l’invitation.</p>
              <label className="block text-[13px] font-semibold">
                Date de naissance
                <input className="invite-field" type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} />
              </label>
            </div>
            {error ? <p className="mt-4 text-sm text-[var(--admin-red)]">{error}</p> : null}
            <BusyBar active={loading} label="Envoi…" />
            <div className="mt-6">
              <button type="submit" disabled={loading} className="invite-submit">
                Continuer
              </button>
            </div>
            {linkUntil ? (
              <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs leading-snug text-[#5c6570]">
                <Icon name="lock" className="h-3.5 w-3.5 shrink-0 text-[#C9A24B]" />
                Lien personnel, valable jusqu’au {linkUntil}.
              </p>
            ) : null}
          </section>
        </>
      ) : (
        <section className="invite-paper">
          <p className="invite-paper-kicker">Étape 2 sur 2</p>
          <div className="mt-5 space-y-4">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={terms} onChange={(event) => setTerms(event.target.checked)} className="mt-1 accent-[#0B1F3A]" />
              <span>
                J’accepte les <Link className="underline decoration-[#C9A24B]" href="/fr/legal">conditions générales</Link>.
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={privacy} onChange={(event) => setPrivacy(event.target.checked)} className="mt-1 accent-[#0B1F3A]" />
              <span>
                J’accepte que le Travel Club TBA utilise ces informations pour traiter ma demande, comme indiqué dans la{" "}
                <Link className="underline decoration-[#C9A24B]" href="/fr/confidentialite">politique de confidentialité</Link>.
              </span>
            </label>
            <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
              <label>
                Site
                <input tabIndex={-1} autoComplete="off" value={companyWebsite} onChange={(event) => setCompanyWebsite(event.target.value)} name="company_website" />
              </label>
            </div>
          </div>
          {error ? <p className="mt-4 text-sm text-[var(--admin-red)]">{error}</p> : null}
          <BusyBar active={loading} label="Envoi…" />
          <div className="mt-6 flex gap-2">
            <button type="button" className="invite-back" onClick={() => setStep(0)}>
              Retour
            </button>
            <button type="submit" disabled={loading} className="invite-submit">
              {loading ? "Envoi…" : "Déposer ma demande"}
            </button>
          </div>
        </section>
      )}
    </form>
  );
}
