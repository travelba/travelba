"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/crm/ui";
import { BusyBar } from "@/components/crm/BusyBar";
import { OnboardingScene } from "@/components/account/OnboardingScenes";
import { CLIENT_ONBOARDING_STEPS } from "@/lib/crm/onboarding";
import { ONBOARDING_PATH, pathAfterPassword } from "@/lib/crm/session";

const ease = [0.22, 1, 0.36, 1] as const;

/** Faux au premier rendu (serveur et hydratation identiques), puis vrai si le mouvement est permis. */
function useOnboardingPlay() {
  const prefersReduced = useReducedMotion();
  const [play, setPlay] = useState(false);
  useLayoutEffect(() => {
    setPlay(prefersReduced !== true);
  }, [prefersReduced]);
  return play;
}

export function ClientOnboarding() {
  const router = useRouter();
  const play = useOnboardingPlay();
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

      <motion.div
        key={`${current.id}-${play ? "play" : "still"}`}
        className="mt-8 flex flex-1 flex-col"
        initial={play ? { opacity: 0, y: 12 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={play ? { duration: 0.45, ease } : { duration: 0 }}
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">
          {current.kicker}
        </p>
        <h1 className="mt-2 font-display text-[1.75rem] font-bold leading-tight tracking-tight text-[var(--admin-navy)]">
          {current.title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[#44474c]">{current.body}</p>
        <motion.div
          className="mt-3 h-1 rounded-full bg-[var(--admin-gold)]"
          initial={play ? { width: 0 } : false}
          animate={{ width: 48 }}
          transition={play ? { duration: 0.5, delay: 0.12, ease } : { duration: 0 }}
        />
        <div className="mt-6">
          <OnboardingScene id={current.id} play={play} />
        </div>
      </motion.div>

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
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
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
