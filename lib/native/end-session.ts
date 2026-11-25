import { isNativeAppBridge } from "@/lib/native/detect";

/** Préférence lue au lancement. « off » : Face ID ne rouvre pas la session. */
export const BIOMETRIC_PREF_KEY = "tba.biometric";

export type NativeEndStep = "biometric-off" | "push" | "unlock" | "offline";

/** Ce que la déconnexion retire sur l’appareil. Le repli mot de passe garde Face ID pour la fois suivante. */
export function nativeEndSessionSteps(keepUnlock: boolean): NativeEndStep[] {
  if (keepUnlock) return ["push"];
  return ["biometric-off", "push", "unlock", "offline"];
}

/** Face ID, jetons d’appareil et pièces hors ligne. Chaque étape est isolée : une qui échoue n’empêche pas les autres. */
export async function endNativeSession(scope: "local" | "global", options?: { keepUnlock?: boolean }) {
  if (!isNativeAppBridge()) return;
  const steps = nativeEndSessionSteps(Boolean(options?.keepUnlock));
  for (const step of steps) {
    try {
      if (step === "biometric-off") {
        const { Preferences } = await import("@capacitor/preferences");
        await Preferences.set({ key: BIOMETRIC_PREF_KEY, value: "off" });
      } else if (step === "push") {
        const { unregisterNativePush } = await import("@/lib/native/push-client");
        await unregisterNativePush(scope === "global");
      } else if (step === "unlock") {
        await fetch("/api/client/device-unlock", { method: "DELETE", credentials: "same-origin" });
        const { clearUnlockToken } = await import("@/lib/native/device-lock");
        await clearUnlockToken();
      } else {
        const { clearOfflineDocuments } = await import("@/lib/native/offline-docs");
        await clearOfflineDocuments();
      }
    } catch {
      /* l’étape suivante part quand même */
    }
  }
}
