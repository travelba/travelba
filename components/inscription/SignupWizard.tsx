"use client";

import { FormEvent, PointerEvent, useState } from "react";
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

function quietMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function MemberCard({ name, number }: { name: string; number: string }) {
  function follow(event: PointerEvent<HTMLElement>) {
    if (quietMotion() || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * 100;
    const y = ((event.clientY - box.top) / box.height) * 100;
    event.currentTarget.style.setProperty("--shine-x", `${x}%`);
    event.currentTarget.style.setProperty("--shine-y", `${y}%`);
  }

  return (
    <article className="invite-metal" data-invite-card="1" aria-label="Carte de membre Platinum" onPointerMove={follow}>
      <span className="invite-metal-sheen" aria-hidden="true" />
      <p className="invite-metal-mark" aria-hidden="true">
        TBA
      </p>
      <p className="invite-metal-club">Travel Club TBA</p>
      <p className="invite-metal-name">{name}</p>
      <div className="invite-metal-foot">
        <p>Platinum</p>
        <p>
          <span className="sr-only">{HOTEL_CLUB_NUMBER}</span>
          {number}
        </p>
      </div>
      <p className="invite-metal-until">{HOTEL_ACCESS_UNTIL}</p>
    </article>
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

  if (done) {
    return (
      <div className="invite-sheet">
        <p className="invite-kicker">Sur invitation</p>
        <h1 className="invite-hello">Un message vous attend</h1>
        <p className="invite-offer">
          Il confirme votre adresse. Le Travel Club TBA relit ensuite la demande. L’accès reste fermé jusque-là.
        </p>
      </div>
    );
  }

  const given = greetingGivenName(firstName);
  const engraved = [given, lastName.trim()].filter(Boolean).join(" ") || "—";

  return (
    <form noValidate onSubmit={step === 0 ? next : submit}>
      {step === 0 ? (
        <div className="invite-sheet">
          <header className="invite-mast">
            <p className="invite-kicker">Sur invitation</p>
            <p className="invite-wordmark">Travel Club TBA</p>
            <div className="invite-rule" aria-hidden="true" />
          </header>
          <MemberCard
            name={engraved}
            number={hotelMemberNumber(prefill.invitationToken || phone || "invitation")}
          />
          {given ? <h1 className="invite-hello">{given},</h1> : <h1 className="sr-only">Invitation</h1>}
          <p className="invite-offer">{TRAVEL_CLUB_OFFER}</p>
          <ul className="invite-lines">
            {TRAVEL_CLUB_PRIVILEGES.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="invite-kicker invite-kicker-ink">Vos coordonnées</p>
          <div className="mt-4 space-y-4">
            <label className="block text-[13px] font-semibold">
              Prénom
              <input className="invite-field" value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" />
            </label>
            <label className="block text-[13px] font-semibold">
              Nom
              <input className="invite-field" value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" />
            </label>
            <label className="block text-[13px] font-semibold">
              Adresse e-mail
              <input className="invite-field" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
            </label>
            <label className="block text-[13px] font-semibold">
              Téléphone
              <input className="invite-field" type="tel" value={phone} readOnly aria-readonly="true" />
            </label>
            <p className="-mt-2 text-xs text-[#5c6570]">Ce numéro est celui de votre invitation.</p>
            <label className="block text-[13px] font-semibold">
              Date de naissance
              <input className="invite-field" type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} />
            </label>
          </div>
          {error ? <p className="mt-4 text-sm text-[var(--admin-red)]">{error}</p> : null}
          <BusyBar active={loading} label="Envoi…" />
          <button type="submit" disabled={loading} className="invite-submit mt-6">
            Poursuivre
          </button>
          {linkUntil ? (
            <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs leading-snug text-[#5c6570]">
              <Icon name="lock" className="h-3.5 w-3.5 shrink-0 text-[#C9A24B]" />
              Lien personnel, valable jusqu’au {linkUntil}.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="invite-sheet">
          <p className="invite-kicker">Votre accord</p>
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
                J’accepte que le Travel Club TBA traite ces informations pour ma demande, selon la{" "}
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
              Revenir
            </button>
            <button type="submit" disabled={loading} className="invite-submit">
              {loading ? "Envoi…" : "Présenter ma demande"}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
