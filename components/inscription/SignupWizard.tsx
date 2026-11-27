"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BusyBar } from "@/components/crm/BusyBar";
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

function quietMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Carte métal noir, propre à l’invitation. Photo : Unsplash, photo-1566665797739. */
function MemberCard({ name, number }: { name: string; number: string }) {
  return (
    <div className="invite-stage">
      <article className="invite-metal" data-invite-card="1" aria-label="Carte de membre Platinum">
        <span className="invite-metal-sheen" aria-hidden="true" />
        <p className="invite-metal-mark" aria-hidden="true">
          TBA
        </p>
        <p className="invite-metal-name">{name}</p>
        <p className="invite-metal-rank">Platinum</p>
        <p className="invite-metal-quiet">
          <span>Travel Club TBA</span>
          <span>{HOTEL_ACCESS_UNTIL}</span>
        </p>
        <p className="sr-only">
          {HOTEL_CLUB_NUMBER} {number}
        </p>
      </article>
    </div>
  );
}

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
      setError("Indiquez le prénom, le nom, l’adresse e-mail et la date de naissance.");
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

  function revealForm() {
    document.getElementById("invite-form")?.scrollIntoView({
      behavior: quietMotion() ? "auto" : "smooth",
      block: "start",
    });
  }

  const given = greetingGivenName(firstName);
  const engraved = [given, lastName.trim()].filter(Boolean).join(" ") || "—";
  const night = (
    <>
      <div className="invite-night-photo" aria-hidden="true">
        <Image
          src="/invitation/nuit.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="invite-night-img"
        />
      </div>
      <div className="invite-night-shade" aria-hidden="true" />
    </>
  );

  if (done) {
    return (
      <div className="invite-night">
        {night}
        <section className="invite-form">
          <p className="invite-kicker">Sur invitation</p>
          <h1 className="invite-hello">Un message vous attend</h1>
          <p className="invite-offer">
            Il confirme votre adresse. Le Travel Club TBA relit ensuite la demande. L’accès reste fermé jusque-là.
          </p>
        </section>
      </div>
    );
  }

  return (
    <form className="invite-night" noValidate onSubmit={step === 0 ? next : submit}>
      {night}
      {step === 0 ? (
        <>
          <section className="invite-hero" data-invite-hero="1">
            <div className="invite-hero-grid">
              <div className="invite-hero-card">
                <p className="invite-kicker">Sur invitation</p>
                <MemberCard
                  name={engraved}
                  number={hotelMemberNumber(prefill.invitationToken || phone || "invitation")}
                />
              </div>
              <div className="invite-hero-copy">
                <h1 className="invite-hello">{given ? `${given}, vous êtes attendu.` : "Vous êtes attendu."}</h1>
                <div className="invite-rule" aria-hidden="true" />
                <p className="invite-offer">{TRAVEL_CLUB_OFFER}</p>
                <button type="button" className="invite-accept" onClick={revealForm}>
                  Accepter l’invitation
                </button>
              </div>
            </div>
          </section>
          <section id="invite-form" className="invite-form">
            <ul className="invite-lines">
              {TRAVEL_CLUB_PRIVILEGES.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="invite-kicker">Vos coordonnées</p>
            <div className="mt-5 space-y-5">
              <label className="invite-label">
                Prénom
                <input className="invite-field" value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" />
              </label>
              <label className="invite-label">
                Nom
                <input className="invite-field" value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" />
              </label>
              <label className="invite-label">
                Adresse e-mail
                <input className="invite-field" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
              </label>
              <label className="invite-label">
                Téléphone
                <input className="invite-field" type="tel" value={phone} readOnly aria-readonly="true" />
              </label>
              <p className="invite-note">Ce numéro est celui de votre invitation.</p>
              <label className="invite-label">
                Date de naissance
                <input className="invite-field" type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} />
              </label>
            </div>
            {error ? <p className="mt-4 text-sm text-[#e7b4b4]">{error}</p> : null}
            <BusyBar active={loading} label="Envoi…" />
            <button type="submit" disabled={loading} className="invite-accept mt-8">
              Poursuivre
            </button>
            {linkUntil ? <p className="invite-link">Lien personnel, valable jusqu’au {linkUntil}.</p> : null}
          </section>
        </>
      ) : (
        <section className="invite-form">
          <p className="invite-kicker">Votre accord</p>
          <div className="mt-6 space-y-4">
            <label className="invite-check">
              <input type="checkbox" checked={terms} onChange={(event) => setTerms(event.target.checked)} />
              <span>
                J’accepte les <Link href="/fr/legal">conditions générales</Link>.
              </span>
            </label>
            <label className="invite-check">
              <input type="checkbox" checked={privacy} onChange={(event) => setPrivacy(event.target.checked)} />
              <span>
                J’accepte que le Travel Club TBA traite ces informations pour ma demande, selon la{" "}
                <Link href="/fr/confidentialite">politique de confidentialité</Link>.
              </span>
            </label>
            <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
              <label>
                Site
                <input tabIndex={-1} autoComplete="off" value={companyWebsite} onChange={(event) => setCompanyWebsite(event.target.value)} name="company_website" />
              </label>
            </div>
          </div>
          {error ? <p className="mt-4 text-sm text-[#e7b4b4]">{error}</p> : null}
          <BusyBar active={loading} label="Envoi…" />
          <div className="mt-8 flex gap-3">
            <button type="button" className="invite-back" onClick={() => setStep(0)}>
              Revenir
            </button>
            <button type="submit" disabled={loading} className="invite-accept">
              {loading ? "Envoi…" : "Présenter ma demande"}
            </button>
          </div>
        </section>
      )}
    </form>
  );
}
