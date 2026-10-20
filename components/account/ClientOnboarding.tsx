"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";
import { OnboardingFrame } from "@/components/account/OnboardingFrames";
import {
  CLIENT_ONBOARDING_STEPS,
  ONBOARDING_BACK_LABEL,
  ONBOARDING_ENTER_LABEL,
  ONBOARDING_FICTION_NOTE,
  ONBOARDING_NEXT_LABEL,
  ONBOARDING_RESTART_LABEL,
  ONBOARDING_SKIP_LABEL,
} from "@/lib/crm/onboarding";
import { pathAfterPassword } from "@/lib/crm/session";
import { postJson } from "@/lib/crm/client-fetch";

const playfair = { fontFamily: "var(--font-playfair), Georgia, serif" } as const;

export function ClientOnboarding({ previewHref = null }: { previewHref?: string | null }) {
  const router = useRouter();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = CLIENT_ONBOARDING_STEPS[step];
  const last = step === CLIENT_ONBOARDING_STEPS.length - 1;

  useEffect(() => {
    window.scrollTo(0, 0);
    titleRef.current?.focus({ preventScroll: true });
  }, [step]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-onboarding-frame]")) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setStep((value) => Math.min(CLIENT_ONBOARDING_STEPS.length - 1, value + 1));
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setStep((value) => Math.max(0, value - 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  function restart() {
    if (busy || step === 0) return;
    setStep(0);
  }

  return (
    <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-[#faf9f6] text-[#0b192c]" data-onboarding-step={current.id}>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#e8e4dc] px-4 py-3 lg:px-10">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#9e7e51]">Travel Business Agency</p>
        <p className="text-[12px] font-semibold tracking-[0.2em] text-[#c5a880]" aria-hidden>
          {String(step + 1).padStart(2, "0")}
        </p>
        <button
          type="button"
          onClick={finish}
          disabled={busy}
          className="rounded-full px-3 py-2 text-sm font-semibold text-[#5a5c60] hover:text-[#0b192c] disabled:opacity-60"
        >
          {ONBOARDING_SKIP_LABEL}
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-center lg:gap-x-14 lg:px-10 lg:py-8">
        <div className="lg:col-start-1 lg:row-start-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[#c5a880]">{current.kicker}</p>
          <h1
            ref={titleRef}
            tabIndex={-1}
            style={playfair}
            className="mt-3 text-[2rem] font-medium leading-[1.12] tracking-tight text-[#0b192c] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c5a880] sm:text-[2.6rem]"
          >
            {current.title}
          </h1>
        </div>

        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
          <OnboardingFrame stepId={current.id} />
        </div>

        <div className="lg:col-start-1 lg:row-start-2">
          <p className="mb-5 max-w-xl text-[15px] leading-relaxed text-[#5a5c60] lg:mt-4">{current.lead}</p>
          <ol className="max-w-xl space-y-4">
            {current.captions.map((caption, index) => (
              <li key={caption.title} className="grid grid-cols-[2.4rem_minmax(0,1fr)] gap-x-3">
                <span style={playfair} className="text-[1.35rem] font-medium leading-none text-[#c5a880]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>
                  <span className="block text-[15px] font-semibold text-[#0b192c]">{caption.title}</span>
                  <span className="mt-1 block text-sm leading-relaxed text-[#5a5c60]">{caption.body}</span>
                </span>
              </li>
            ))}
          </ol>
          <p style={playfair} className="mt-6 max-w-xl text-[13px] font-medium italic leading-relaxed text-[#9e7e51]">
            {ONBOARDING_FICTION_NOTE}
          </p>
        </div>
      </div>
      </div>

      <footer className="shrink-0 border-t border-[#e8e4dc] bg-[#faf9f6] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3">
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
                className={`h-1 flex-1 rounded-full ${index <= step ? "bg-[#c5a880]" : "bg-[#e5e3dc]"}`}
              />
            ))}
          </div>
          {error ? <p className="text-sm text-[var(--admin-red)]">{error}</p> : null}
          <BusyBar active={busy} label="Enregistrement…" />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center justify-between gap-2 sm:justify-start">
              <button
                type="button"
                onClick={restart}
                disabled={busy || step === 0}
                className="rounded-full px-3 py-2 text-sm font-semibold text-[#5a5c60] hover:text-[#0b192c] disabled:opacity-40"
              >
                {ONBOARDING_RESTART_LABEL}
              </button>
              <button
                type="button"
                onClick={() => setStep((value) => Math.max(0, value - 1))}
                disabled={busy || step === 0}
                className="rounded-full px-3 py-2 text-sm font-semibold text-[#5a5c60] hover:text-[#0b192c] disabled:opacity-40"
              >
                {ONBOARDING_BACK_LABEL}
              </button>
            </div>
            <button
              type="button"
              onClick={last ? finish : () => setStep((value) => value + 1)}
              disabled={busy}
              className="w-full rounded-full bg-[#0b192c] px-5 py-3.5 text-sm font-bold text-white transition hover:opacity-95 disabled:opacity-60 sm:w-auto sm:min-w-56"
            >
              {busy ? "Un instant…" : last ? ONBOARDING_ENTER_LABEL : ONBOARDING_NEXT_LABEL}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
