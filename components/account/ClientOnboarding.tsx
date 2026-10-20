"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BusyBar } from "@/components/crm/BusyBar";
import {
  CLIENT_ONBOARDING_STEPS,
  ONBOARDING_BACK_LABEL,
  ONBOARDING_NEXT_LABEL,
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
    titleRef.current?.focus({ preventScroll: true });
  }, [step]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
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

  return (
    <div
      className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-[#faf9f6] text-[#0b192c]"
      data-onboarding-step={current.id}
    >
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

      <figure className="flex min-h-0 flex-1 items-center justify-center px-4 py-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- capture locale déjà en WebP */}
        <img
          src={current.image}
          alt={current.title}
          className="max-h-full max-w-full object-contain drop-shadow-[0_16px_36px_rgba(11,25,44,0.14)]"
        />
      </figure>

      <div className="shrink-0 px-5 text-center lg:px-10">
        <h1
          ref={titleRef}
          tabIndex={-1}
          style={playfair}
          className="mx-auto max-w-2xl text-[1.35rem] font-medium leading-tight tracking-tight text-[#0b192c] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c5a880] sm:text-[1.75rem]"
        >
          {current.title}
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-[#5a5c60]">{current.legend}</p>
      </div>

      <footer className="shrink-0 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:px-10">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
          <div
            className="flex gap-1"
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
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setStep((value) => Math.max(0, value - 1))}
              disabled={busy || step === 0}
              className="rounded-full px-4 py-3 text-sm font-semibold text-[#5a5c60] hover:text-[#0b192c] disabled:opacity-40"
            >
              {ONBOARDING_BACK_LABEL}
            </button>
            <button
              type="button"
              onClick={last ? finish : () => setStep((value) => value + 1)}
              disabled={busy}
              className="min-w-40 rounded-full bg-[#0b192c] px-5 py-3.5 text-sm font-bold text-white transition hover:opacity-95 disabled:opacity-60"
            >
              {busy ? "Un instant…" : ONBOARDING_NEXT_LABEL}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
