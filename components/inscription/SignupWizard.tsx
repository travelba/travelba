"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { HotelClubSheet } from "@/components/account/HotelClubSheet";
import { BusyBar } from "@/components/crm/BusyBar";
import { HOTEL_SEARCH_HERO_FALLBACK } from "@/lib/crm/hotel-search-home";
import { TRAVEL_CLUB_OFFER } from "@/lib/crm/signup-options";

const fieldClass =
  "mt-1 w-full rounded-xl border border-[#0B192C]/10 bg-white px-3.5 py-2.5 text-[#0B192C] outline-none focus:border-[#C5A880] focus:ring-2 focus:ring-[#C5A880]/40";

export type SignupPrefill = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  birthDate?: string;
  invitationToken?: string;
  resume?: boolean;
};

export function SignupWizard({ prefill }: { prefill: SignupPrefill }) {
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
      <div className="space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#8A7349]">Cercle privé</p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-[#0B192C]">Vérifiez votre e-mail</h1>
        <p className="text-sm leading-relaxed text-[#0B192C]">
          Un message part pour confirmer l’adresse. Le Travel Club TBA relit ensuite la demande. L’accès reste fermé jusque-là.
        </p>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={step === 0 ? next : submit} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#8A7349]">Cercle privé</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-[#0B192C]">Vous êtes invité</h1>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#8A7349]">Étape {step + 1} sur 2</p>
      </div>
      {step === 0 ? (
        <>
          <div className="hotel-theme -mx-4 overflow-hidden rounded-2xl sm:-mx-5">
            <HotelClubSheet
              embedded
              showPrices={false}
              firstName={firstName}
              lastName={lastName}
              customerId={prefill.invitationToken || phone || "invitation"}
              heroSrc={HOTEL_SEARCH_HERO_FALLBACK}
            />
          </div>
          <p className="text-[13px] leading-snug text-[#0B192C]">{TRAVEL_CLUB_OFFER}</p>
          <label className="block text-[13px] font-semibold text-[#0B192C]">
            Prénom
            <input className={fieldClass} value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" />
          </label>
          <label className="block text-[13px] font-semibold text-[#0B192C]">
            Nom
            <input className={fieldClass} value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" />
          </label>
          <label className="block text-[13px] font-semibold text-[#0B192C]">
            E-mail
            <input className={fieldClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
          </label>
          <label className="block text-[13px] font-semibold text-[#0B192C]">
            Téléphone
            <input className={`${fieldClass} cursor-default bg-[#ebe6dc]`} type="tel" value={phone} readOnly aria-readonly="true" />
          </label>
          <p className="-mt-2 text-xs text-[#5c6570]">Ce numéro est celui de l’invitation.</p>
          <label className="block text-[13px] font-semibold text-[#0B192C]">
            Date de naissance
            <input className={fieldClass} type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} />
          </label>
        </>
      ) : (
        <>
          <label className="flex items-start gap-2 text-sm text-[#0B192C]">
            <input type="checkbox" checked={terms} onChange={(event) => setTerms(event.target.checked)} className="mt-1 accent-[#0B192C]" />
            <span>
              J’accepte les <Link className="underline decoration-[#C5A880]" href="/fr/legal">conditions générales</Link>.
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-[#0B192C]">
            <input type="checkbox" checked={privacy} onChange={(event) => setPrivacy(event.target.checked)} className="mt-1 accent-[#0B192C]" />
            <span>
              J’accepte que le Travel Club TBA utilise ces informations pour traiter ma demande, comme indiqué dans la{" "}
              <Link className="underline decoration-[#C5A880]" href="/fr/confidentialite">politique de confidentialité</Link>.
            </span>
          </label>
          <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
            <label>
              Site
              <input tabIndex={-1} autoComplete="off" value={companyWebsite} onChange={(event) => setCompanyWebsite(event.target.value)} name="company_website" />
            </label>
          </div>
        </>
      )}
      {error ? <p className="text-sm text-[var(--admin-red)]">{error}</p> : null}
      </div>
      <BusyBar active={loading} label="Envoi…" />
      <div className="flex shrink-0 gap-2 bg-[#f6f3ec] pt-2">
        {step > 0 ? (
          <button type="button" className="rounded-full border border-[#0B192C]/35 px-4 py-3 text-sm font-semibold text-[#0B192C]" onClick={() => setStep(0)}>
            Retour
          </button>
        ) : null}
        <button type="submit" disabled={loading} className="flex-1 rounded-full bg-[#0B192C] px-4 py-3.5 text-sm font-bold text-[#C5A880] disabled:opacity-60">
          {step === 0 ? "Continuer" : loading ? "Envoi…" : "Déposer ma demande"}
        </button>
      </div>
    </form>
  );
}
