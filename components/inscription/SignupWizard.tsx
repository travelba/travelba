"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { BusyBar } from "@/components/crm/BusyBar";
import { TRAVEL_CLUB_OFFER } from "@/lib/crm/signup-options";

const fieldClass =
  "w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-3 text-[var(--admin-navy)] outline-none focus:border-[var(--admin-gold)] focus:bg-white focus:ring-2 focus:ring-[var(--admin-gold)]/30";

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
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-[var(--admin-navy)]">Vérifiez votre e-mail</h1>
        <p className="text-sm leading-relaxed text-[var(--admin-navy)]">
          Un message part pour confirmer l’adresse. Le Travel Club TBA relit ensuite la demande. L’accès reste fermé jusque-là.
        </p>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={step === 0 ? next : submit} className="space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#8A7349]">Étape {step + 1} sur 2</p>
      {step === 0 ? (
        <>
          <p className="text-sm leading-relaxed text-[var(--admin-navy)]">{TRAVEL_CLUB_OFFER}</p>
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
            <input className={`${fieldClass} mt-1`} type="tel" value={phone} readOnly aria-readonly="true" />
          </label>
          <p className="text-xs text-muted">Ce numéro est celui de l’invitation.</p>
          <label className="block text-sm font-semibold text-[var(--admin-navy)]">
            Date de naissance
            <input className={`${fieldClass} mt-1`} type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} />
          </label>
        </>
      ) : (
        <>
          <label className="flex items-start gap-2 text-sm text-[var(--admin-navy)]">
            <input type="checkbox" checked={terms} onChange={(event) => setTerms(event.target.checked)} className="mt-1" />
            <span>
              J’accepte les <Link className="underline" href="/fr/legal">conditions générales</Link>.
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-[var(--admin-navy)]">
            <input type="checkbox" checked={privacy} onChange={(event) => setPrivacy(event.target.checked)} className="mt-1" />
            <span>
              J’accepte que le Travel Club TBA utilise ces informations pour traiter ma demande, comme indiqué dans la{" "}
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
      )}
      {error ? <p className="text-sm text-[var(--admin-red)]">{error}</p> : null}
      <BusyBar active={loading} label="Envoi…" />
      <div className="flex gap-2">
        {step > 0 ? (
          <button type="button" className="rounded-full border border-[var(--border)] px-4 py-3 text-sm font-semibold" onClick={() => setStep(0)}>
            Retour
          </button>
        ) : null}
        <button type="submit" disabled={loading} className="flex-1 rounded-full bg-[var(--admin-navy)] px-4 py-3.5 text-sm font-bold text-white disabled:opacity-60">
          {step === 0 ? "Continuer" : loading ? "Envoi…" : "Déposer ma demande"}
        </button>
      </div>
    </form>
  );
}
