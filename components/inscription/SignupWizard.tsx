"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { BusyBar } from "@/components/crm/BusyBar";
import { HEARD_ABOUT } from "@/lib/crm/signup-options";

const fieldClass =
  "w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-3 text-[var(--admin-navy)] outline-none focus:border-[var(--admin-gold)] focus:bg-white focus:ring-2 focus:ring-[var(--admin-gold)]/30";

export type SignupPrefill = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  invitationToken?: string;
  referralCode?: string;
};

const STEPS = ["Identité", "Voyage", "Validation"] as const;

export function SignupWizard({ prefill }: { prefill?: SignupPrefill }) {
  const [step, setStep] = useState(0);
  const [firstName, setFirstName] = useState(prefill?.firstName || "");
  const [lastName, setLastName] = useState(prefill?.lastName || "");
  const [email, setEmail] = useState(prefill?.email || "");
  const [phone, setPhone] = useState(prefill?.phone || "");
  const [birthDate, setBirthDate] = useState("");
  const [travelPreferences, setTravelPreferences] = useState("");
  const [heardAbout, setHeardAbout] = useState("");
  const [heardAboutDetail, setHeardAboutDetail] = useState("");
  const [referralCode, setReferralCode] = useState(prefill?.referralCode || "");
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  function next(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (step === 0 && (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim() || !birthDate)) {
      setError("Remplissez l’identité, l’e-mail, le téléphone et la date de naissance.");
      return;
    }
    if (step === 1 && !heardAbout) {
      setError("Indiquez comment vous avez connu TravelBA.");
      return;
    }
    setStep((value) => Math.min(value + 1, STEPS.length - 1));
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
        travelPreferences,
        heardAbout,
        heardAboutDetail,
        referralCode,
        terms,
        privacy,
        company_website: companyWebsite,
        invitationToken: prefill?.invitationToken || undefined,
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
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-[var(--admin-navy)]">Vérifiez votre e-mail</h1>
        <p className="text-sm leading-relaxed text-[var(--admin-navy)]">
          Si la demande peut être déposée, un message part pour confirmer l’adresse. L’agence la relit ensuite. Vous n’avez pas
          encore accès à vos séjours.
        </p>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={step < 2 ? next : submit} className="space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#8A7349]">
        Étape {step + 1} sur {STEPS.length} · {STEPS[step]}
      </p>
      {step === 0 ? (
        <>
          <label className="block text-sm font-semibold text-[var(--admin-navy)]">
            Prénom
            <input className={`${fieldClass} mt-1`} value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" />
          </label>
          <label className="block text-sm font-semibold text-[var(--admin-navy)]">
            Nom
            <input className={`${fieldClass} mt-1`} value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" />
          </label>
          <label className="block text-sm font-semibold text-[var(--admin-navy)]">
            E-mail
            <input className={`${fieldClass} mt-1`} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
          </label>
          <label className="block text-sm font-semibold text-[var(--admin-navy)]">
            Téléphone
            <input className={`${fieldClass} mt-1`} type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" />
          </label>
          <label className="block text-sm font-semibold text-[var(--admin-navy)]">
            Date de naissance
            <input className={`${fieldClass} mt-1`} type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} />
          </label>
        </>
      ) : null}
      {step === 1 ? (
        <>
          <label className="block text-sm font-semibold text-[var(--admin-navy)]">
            Préférences de voyage <span className="font-normal text-muted">(facultatif)</span>
            <textarea className={`${fieldClass} mt-1 min-h-24`} value={travelPreferences} onChange={(event) => setTravelPreferences(event.target.value)} maxLength={1000} />
          </label>
          <label className="block text-sm font-semibold text-[var(--admin-navy)]">
            Comment avez-vous connu TravelBA
            <select className={`${fieldClass} mt-1`} value={heardAbout} onChange={(event) => setHeardAbout(event.target.value)}>
              <option value="">Choisir</option>
              {HEARD_ABOUT.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          {heardAbout === "Autre" ? (
            <label className="block text-sm font-semibold text-[var(--admin-navy)]">
              Précisez
              <input className={`${fieldClass} mt-1`} value={heardAboutDetail} onChange={(event) => setHeardAboutDetail(event.target.value)} />
            </label>
          ) : null}
        </>
      ) : null}
      {step === 2 ? (
        <>
          <label className="block text-sm font-semibold text-[var(--admin-navy)]">
            Code de parrainage <span className="font-normal text-muted">(facultatif)</span>
            <input className={`${fieldClass} mt-1`} value={referralCode} onChange={(event) => setReferralCode(event.target.value)} autoComplete="off" />
          </label>
          <label className="flex items-start gap-2 text-sm text-[var(--admin-navy)]">
            <input type="checkbox" checked={terms} onChange={(event) => setTerms(event.target.checked)} className="mt-1" />
            <span>
              J’accepte les <Link className="underline" href="/fr/legal">conditions générales</Link>.
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-[var(--admin-navy)]">
            <input type="checkbox" checked={privacy} onChange={(event) => setPrivacy(event.target.checked)} className="mt-1" />
            <span>
              J’accepte que l’agence utilise ces informations pour traiter ma demande, comme indiqué dans la{" "}
              <Link className="underline" href="/fr/confidentialite">politique de confidentialité</Link>.
            </span>
          </label>
          <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
            <label>
              Site
              <input tabIndex={-1} autoComplete="off" value={companyWebsite} onChange={(event) => setCompanyWebsite(event.target.value)} name="company_website" />
            </label>
          </div>
        </>
      ) : null}
      {error ? <p className="text-sm text-[var(--admin-red)]">{error}</p> : null}
      <BusyBar active={loading} label="Envoi…" />
      <div className="flex gap-2">
        {step > 0 ? (
          <button type="button" className="rounded-full border border-[var(--border)] px-4 py-3 text-sm font-semibold" onClick={() => setStep((value) => value - 1)}>
            Retour
          </button>
        ) : null}
        <button type="submit" disabled={loading} className="flex-1 rounded-full bg-[var(--admin-navy)] px-4 py-3.5 text-sm font-bold text-white disabled:opacity-60">
          {step < 2 ? "Continuer" : loading ? "Envoi…" : "Déposer ma demande"}
        </button>
      </div>
    </form>
  );
}
