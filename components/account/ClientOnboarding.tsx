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
import { HIDDEN_PRICE_LABEL } from "@/lib/crm/carnet";
import { ONBOARDING_PATH, pathAfterPassword } from "@/lib/crm/session";
import { postJson } from "@/lib/crm/client-fetch";

type ProfileLabel = (typeof CLIENT_PROFILE_NAV)[number]["label"];

export function ClientOnboarding({ previewHref = null }: { previewHref?: string | null }) {
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
    if (previewHref) {
      router.push(previewHref);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await postJson<{ next?: string }>("/api/client/onboarding", {});
      if (!result.ok) {
        setError(result.error || "Impossible d’enregistrer. Réessayez.");
        return;
      }
      router.push(result.data?.next || pathAfterPassword(null));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col px-4 py-6 sm:px-5">
      <header className="flex items-center justify-between gap-3">
        <BrandMark href={previewHref || ONBOARDING_PATH} subtitle="Espace client" compact />
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

        <div className="mt-6">
          {current.id === "carnet" ? <CarnetPreview /> : null}
          {current.id === "transactions" ? <LedgerPreview /> : null}
          {current.id === "profil" ? <ProfilePreview /> : null}
        </div>
      </div>

      <div className="sticky bottom-0 mt-6 space-y-3 bg-[#faf9f6]/95 pb-3 pt-2 backdrop-blur">
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
    <div className="space-y-3" aria-hidden="true">
      <article className="overflow-hidden rounded-xl border border-[#c5c6cd]/35 bg-white shadow-sm">
        <div className="relative h-32 bg-[var(--admin-navy)]">
          <div className="absolute inset-0 bg-[linear-gradient(165deg,#07111c_0%,#0b192c_46%,#1a3354_100%)]" />
          <div className="absolute -right-6 top-6 h-28 w-40 rounded-full bg-[var(--admin-gold)]/25 blur-2xl" />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[var(--admin-navy)] via-[var(--admin-navy)]/45 to-transparent" />
          <div className="absolute left-3 right-3 top-3 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--admin-gold)]/30 bg-[#faf9f6]/95 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--admin-navy)] shadow-sm">
              <Icon name="timer" className="h-[14px] w-[14px] text-[#b89768]" />
              À venir
            </span>
          </div>
          <div className="absolute bottom-3 left-3 right-3 text-white">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--admin-gold)]">
              <Icon name="flight_takeoff" className="h-3.5 w-3.5" />
              Dates du séjour
            </p>
            <p className="font-display text-2xl font-bold leading-tight">Votre séjour</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 bg-white p-3.5">
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-[#c5c6cd]/25 bg-[#f4f3f0] p-2.5">
            <div className="flex flex-col">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#44474c]">
                Référence
              </span>
              <span className="text-[16px] font-bold tracking-wide text-[var(--admin-navy)]">TB-····</span>
            </div>
            <div className="flex flex-col items-end text-right">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#44474c]">
                Montant
              </span>
              <span className="text-[13px] font-bold leading-snug text-[var(--admin-navy)]">
                {HIDDEN_PRICE_LABEL}
              </span>
            </div>
          </div>
          <span className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[var(--admin-navy)] px-3 text-sm font-semibold text-white">
            Accéder à ma réservation
          </span>
        </div>
      </article>

      <section className="space-y-2">
        <h2 className="font-display text-base font-bold text-[var(--admin-navy)]">Itinéraire</h2>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
          Jour du séjour
        </p>
        <ItineraryLine icon="flight" kicker="Vol" title="Vols du séjour" />
        <ItineraryLine icon="hotel" kicker="Hôtel" title="Hôtels du séjour" />
      </section>
    </div>
  );
}

function ItineraryLine({
  icon,
  kicker,
  title,
}: {
  icon: "flight" | "hotel";
  kicker: string;
  title: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#e5e3dc] bg-white px-3.5 py-2.5">
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--admin-peach)] text-[var(--admin-navy)]">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] font-bold uppercase tracking-wide text-[var(--aura-blue)]">
          {kicker}
        </span>
        <span className="block text-sm font-semibold leading-snug text-[var(--admin-navy)]">{title}</span>
      </span>
    </div>
  );
}

function LedgerPreview() {
  return (
    <div className="space-y-5" aria-hidden="true">
      <section className="rounded-xl border border-[#e9e8e5]/60 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--admin-gold)]/15 text-[#9c7c4e]">
            <Icon name="verified_user" className="h-4 w-4" />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#9c7c4e]">Grand livre</span>
        </div>
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9c7c4e]">Encours</p>
          <p className="mt-1 text-sm text-muted">Selon les écritures déjà passées.</p>
        </div>
        <div className="mt-3">
          <div className="h-2.5 overflow-hidden rounded-full bg-[#e9e8e5]">
            <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-[var(--admin-navy)] to-[var(--admin-gold)]" />
          </div>
        </div>
        <span className="mt-3 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-full border border-[var(--admin-gold)]/30 bg-[var(--admin-gold)]/15 text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--admin-navy)]">
          <Icon name="account_balance" className="h-[18px] w-[18px] text-[#9c7c4e]" />
          Facturation
        </span>
      </section>

      <div className="flex items-center gap-1.5">
        <Icon name="account_balance_wallet" className="h-5 w-5 text-[var(--admin-navy)]" />
        <h2 className="font-display text-xl font-semibold text-[var(--admin-navy)]">Mouvements</h2>
      </div>
      <ul className="space-y-2">
        <LedgerLine title="Séjour" meta="Écriture du dossier" credit={false} />
        <LedgerLine title="Règlement reçu" meta="Écriture du dossier" credit />
      </ul>
    </div>
  );
}

function LedgerLine({ title, meta, credit }: { title: string; meta: string; credit: boolean }) {
  return (
    <li className="rounded-xl border border-[#e9e8e5]/60 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 p-4">
        <span className="flex min-w-0 items-start gap-3">
          <span
            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              credit
                ? "bg-[var(--admin-gold)]/15 text-[var(--admin-navy)]"
                : "bg-[#efeeeb] text-[var(--admin-navy)]"
            }`}
          >
            <Icon name={credit ? "south_west" : "receipt_long"} className="h-[22px] w-[22px]" />
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold leading-snug text-[var(--admin-navy)]">
              {title}
            </span>
            <span className="mt-0.5 block text-[13px] leading-snug text-muted">{meta}</span>
          </span>
        </span>
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${
            credit
              ? "border-[var(--admin-gold)]/30 bg-[var(--admin-gold)]/15 text-[var(--admin-navy)]"
              : "border-[#e5e3dc] bg-[#efeeeb] text-[#44474c]"
          }`}
        >
          {credit ? "Encaissé" : "Posté"}
        </span>
      </div>
    </li>
  );
}

function ProfilePreview() {
  const [label, setLabel] = useState<ProfileLabel>("Vous");
  const hint = PROFILE_ONBOARDING_HINTS[label];

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-[#e5e3dc] bg-white p-4 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">{label}</p>
        <p className="mt-1 font-display text-lg font-bold tracking-tight text-[var(--admin-navy)]">{hint}</p>
      </section>
      <div
        className="flex rounded-full bg-[#efeeeb] p-1 shadow-[0_1px_2px_rgba(11,25,44,0.04)]"
        role="tablist"
        aria-label="Sections du compte"
      >
        {CLIENT_PROFILE_NAV.map((section) => {
          const active = section.label === label;
          return (
            <button
              key={section.href}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setLabel(section.label)}
              className={`flex-1 rounded-full px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.04em] transition ${
                active
                  ? "bg-[var(--admin-navy)] text-white shadow-sm"
                  : "text-[#5a5c60] hover:text-[var(--admin-navy)]"
              }`}
            >
              {section.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
