"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { biometricChoiceOf, shouldOfferBiometric } from "@/lib/crm/biometric-lock";
import { isNativeAppBridge } from "@/lib/native/detect";

const KEY = "tba.biometric";

async function readChoice() {
  const { Preferences } = await import("@capacitor/preferences");
  const stored = await Preferences.get({ key: KEY });
  return biometricChoiceOf(stored.value);
}

async function writeChoice(value: "on" | "off") {
  const { Preferences } = await import("@capacitor/preferences");
  await Preferences.set({ key: KEY, value });
}

/** Propose Face ID après la première entrée, et la case dans Mon compte. */
export function BiometricUnlock({ preview = false }: { preview?: boolean }) {
  const pathname = usePathname() || "";
  const [mode, setMode] = useState<"hidden" | "offer" | "on" | "off">(preview ? "offer" : "hidden");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (preview || !isNativeAppBridge()) return;
    let cancelled = false;
    void (async () => {
      const { biometryAvailable } = await import("@/lib/native/device-lock");
      const [choice, available] = await Promise.all([readChoice(), biometryAvailable()]);
      if (cancelled) return;
      if (choice === "on") setMode("on");
      else if (shouldOfferBiometric(choice, available) && (pathname === "/mon-compte" || pathname.startsWith("/mon-compte/profil"))) {
        setMode("offer");
      } else if (pathname.startsWith("/mon-compte/profil") && available) setMode(choice === "off" ? "off" : "offer");
      else setMode("hidden");
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, preview]);

  async function enable() {
    setError(null);
    if (preview) {
      setMode("on");
      return;
    }
    const response = await fetch("/api/client/device-unlock", { method: "POST", credentials: "same-origin" });
    const body = (await response.json().catch(() => null)) as { token?: string; error?: string } | null;
    if (!response.ok || !body?.token) {
      setError(body?.error || "Le déverrouillage n’a pas pu être activé.");
      return;
    }
    const { saveUnlockToken, clearUnlockToken } = await import("@/lib/native/device-lock");
    const saved = await saveUnlockToken(body.token);
    if (!saved) {
      await fetch("/api/client/device-unlock", { method: "DELETE", credentials: "same-origin" }).catch(() => {});
      await clearUnlockToken();
      setError("Cet appareil n’a pas gardé le déverrouillage. Le mot de passe reste ouvert.");
      return;
    }
    await writeChoice("on");
    setMode("on");
  }

  async function disable() {
    setError(null);
    if (!preview) {
      await fetch("/api/client/device-unlock", { method: "DELETE", credentials: "same-origin" }).catch(() => {});
      const { clearUnlockToken } = await import("@/lib/native/device-lock");
      await clearUnlockToken();
      await writeChoice("off");
    }
    setMode("off");
  }

  if (mode === "hidden") return null;
  const onProfile = preview || pathname.startsWith("/mon-compte/profil");

  return (
    <section className="rounded-xl border border-[#e3e2e0]/70 bg-white px-4 py-3">
      <h2 className="text-sm font-semibold text-[var(--admin-navy)]">Face ID ou Touch ID</h2>
      <p className="mt-1 text-xs text-muted">
        Au retour dans l’application, le visage ou l’empreinte ouvre votre espace. Le mot de passe reste disponible.
      </p>
      {onProfile ? (
        <label className="mt-3 flex items-center justify-between gap-3 text-sm text-[var(--admin-navy)]">
          Déverrouiller l’application
          <input
            type="checkbox"
            checked={mode === "on"}
            aria-label="Déverrouiller l’application"
            onChange={(event) => {
              void (event.target.checked ? enable() : disable());
            }}
            className="h-4 w-4 accent-[var(--admin-navy)]"
          />
        </label>
      ) : null}
      {mode === "offer" ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => void enable()}
            className="inline-flex h-10 items-center rounded-full bg-[var(--admin-navy)] px-4 text-sm font-semibold text-white"
          >
            Activer
          </button>
          <button
            type="button"
            onClick={() => void disable()}
            className="inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold text-[var(--admin-navy)]"
          >
            Plus tard
          </button>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-accent">{error}</p> : null}
    </section>
  );
}
