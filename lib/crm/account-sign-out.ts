import { browserAuthCookieNames, browserCookieDeletion, signOutRedirectPath } from "@/lib/crm/sign-out";
import { clearClientShellCache } from "@/lib/client/stay-cache";

/**
 * Déconnexion agence et client.
 * Le cookie client est HttpOnly : seul le serveur peut l’effacer.
 * Le cookie agence est lisible : on l’expire ici aussi, juste avant la navigation,
 * pour qu’un rafraîchissement du navigateur ne le repose pas.
 */
export async function signOutAccount(
  scope: "local" | "global" = "local",
  next?: string,
  options?: { keepUnlock?: boolean }
) {
  if (typeof window !== "undefined") {
    await clearClientShellCache().catch(() => {});
    const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (cap?.isNativePlatform?.()) {
      const mod = await import("@/lib/native/push-client");
      await mod.unregisterNativePush(scope === "global").catch(() => {});
      if (!options?.keepUnlock) {
        await fetch("/api/client/device-unlock", { method: "DELETE", credentials: "same-origin" }).catch(() => {});
        const lock = await import("@/lib/native/device-lock");
        await lock.clearUnlockToken().catch(() => {});
        const docs = await import("@/lib/native/offline-docs");
        await docs.clearOfflineDocuments().catch(() => {});
      }
    }
  }
  const response = await fetch("/api/auth/sign-out", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(next ? { scope, next } : { scope }),
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) return { ok: false as const };
  const data = (await response.json().catch(() => null)) as { redirect?: unknown } | null;
  const redirect = signOutRedirectPath({
    requested: typeof data?.redirect === "string" ? data.redirect : next || null,
    audience: "unknown",
  });
  clearVisibleAuthCookies();
  if (typeof window !== "undefined") window.location.replace(redirect);
  return { ok: true as const, redirect };
}

function clearVisibleAuthCookies() {
  if (typeof document === "undefined") return;
  for (const name of browserAuthCookieNames(document.cookie)) {
    const deletion = browserCookieDeletion(name);
    if (deletion) document.cookie = deletion;
  }
}
