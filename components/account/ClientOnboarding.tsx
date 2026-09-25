"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/crm/ui";
import { Icon } from "@/components/crm/icons";
import { BusyBar } from "@/components/crm/BusyBar";
import {
  CLIENT_ONBOARDING_STEPS,
  PROFILE_ONBOARDING_HINTS,
} from "@/lib/crm/onboarding";
import { CLIENT_PROFILE_NAV } from "@/lib/crm/profile-nav";
import { ONBOARDING_PATH, pathAfterPassword } from "@/lib/crm/session";

const PROFILE_ICONS = {
  Vous: "person",
  Pièces: "id_card",
  Voyageurs: "group",
  Facturation: "account_balance",
} as const;

export function ClientOnboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = CLIENT_ONBOARDING_STEPS[step];
  const last = step === CLIENT_ONBOARDING_STEPS.length - 1;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [step]);

  async function finish() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/client/onboarding", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      setError(json.error || "Impossible d’enregistrer. Réessayez.");
      return;
    }
    router.push(json.next || pathAfterPassword(null));
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col px-4 py-6 sm:px-5">
      <header className="flex items-center justify-between gap-3">
        <BrandMark href={ONBOARDING_PATH} subtitle="Espace client" compact />
        <button
          type="button"
          onClick={finish}
          disabled={busy}
          className="rounded-full px-3 py-2 text-sm font-semibold text-[#5a5c60] hover:text-[var(--admin-navy)] disabled:opacity-60"
          aria-label="Passer l’introduction"
        >
          Passer
        </button>
      </header>

      <div className="mt-8 flex flex-1 flex-col">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">
          {current.kicker}
        </p>
        <h1 className="mt-2 font-display text-[1.75rem] font-bold leading-tight tracking-tight text-[var(--admin-navy)]">
          {current.title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[#44474c]">{current.body}</p>
        <div className="mt-3 h-1 w-12 rounded-full bg-[var(--admin-gold)]" />

        <div className="mt-6">{current.id === "carnet" ? <CarnetPreview /> : null}</div>
        <div className="mt-6">{current.id === "transactions" ? <LedgerPreview /> : null}</div>
        <div className="mt-6">{current.id === "profil" ? <ProfilePreview /> : null}</div>
      </div>

      <div className="sticky bottom-0 mt-8 space-y-4 bg-[#faf9f6]/95 pb-4 pt-3 backdrop-blur">
        <div
          className="flex gap-1.5"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={CLIENT_ONBOARDING_STEPS.length}
          aria-valuenow={step + 1}
          aria-label={`Étape ${step + 1} sur ${CLIENT_ONBOARDING_STEPS.length}`}
        >
          {CLIENT_ONBOARDING_STEPS.map((item, index) => (
            <span
              key={item.id}
              className={`h-1 flex-1 rounded-full ${
                index <= step ? "bg-[var(--admin-gold)]" : "bg-[#e5e3dc]"
              }`}
            />
          ))}
        </div>
        {error ? <p className="text-sm text-[var(--admin-red)]">{error}</p> : null}
        <BusyBar active={busy} label="Enregistrement…" />
        <button
          type="button"
          onClick={last ? finish : () => setStep((value) => value + 1)}
          disabled={busy}
          className="w-full rounded-full bg-[var(--admin-navy)] px-4 py-3.5 text-sm font-bold text-white transition hover:opacity-95 disabled:opacity-60"
        >
          {busy ? "Un instant…" : last ? "Accéder à mon espace" : "Continuer"}
        </button>
      </div>
    </div>
  );
}

function CarnetPreview() {
  return (
    <article className="overflow-hidden rounded-2xl border border-[#e5e3dc] shadow-sm">
      <div className="relative h-40 bg-[var(--admin-navy)]">
        <div className="absolute inset-0 bg-[linear-gradient(160deg,#07111c_0%,#0b192c_55%,#1e3a5f_100%)]" />
        <p className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-[var(--admin-gold)] px-3 py-1 text-[11px] font-bold text-[var(--admin-navy)]">
          Publié
        </p>
        <div className="absolute inset-x-0 bottom-0 p-4">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-gold)]">
            <Icon name="flight_takeoff" className="h-3.5 w-3.5" />
            Réservations
          </p>
          <p className="mt-1 font-display text-xl font-bold text-white">Votre séjour</p>
        </div>
      </div>
      <ul className="divide-y divide-[#e5e3dc] bg-white">
        <li className="flex items-center gap-3 px-4 py-3 text-sm text-[var(--admin-navy)]">
          <Icon name="flight" className="h-5 w-5 text-[var(--admin-gold-dark)]" />
          Vols du séjour
        </li>
        <li className="flex items-center gap-3 px-4 py-3 text-sm text-[var(--admin-navy)]">
          <Icon name="hotel" className="h-5 w-5 text-[var(--admin-gold-dark)]" />
          Hôtels du séjour
        </li>
      </ul>
    </article>
  );
}

function LedgerPreview() {
  return (
    <article className="rounded-2xl border border-[#e5e3dc] bg-white p-4 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Grand livre</p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--admin-peach)]">
            <Icon name="receipt_long" className="h-5 w-5 text-[var(--admin-navy)]" />
          </span>
          <div>
            <p className="text-sm font-semibold text-[var(--admin-navy)]">Écriture comptabilisée</p>
            <p className="text-xs text-muted">Visible dans Transactions</p>
          </div>
        </div>
        <span className="rounded-full bg-[var(--admin-navy)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
          Passée
        </span>
      </div>
    </article>
  );
}

function ProfilePreview() {
  return (
    <ul className="space-y-2">
      {CLIENT_PROFILE_NAV.map((section) => (
        <li
          key={section.href}
          className="flex items-center gap-3 rounded-2xl border border-[#e5e3dc] bg-white px-4 py-3 shadow-sm"
        >
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--admin-navy)] text-white">
            <Icon name={PROFILE_ICONS[section.label]} className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-bold text-[var(--admin-navy)]">{section.label}</p>
            <p className="text-xs text-muted">{PROFILE_ONBOARDING_HINTS[section.label]}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
