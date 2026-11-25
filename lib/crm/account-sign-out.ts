import type { SignOutScope } from "@/lib/crm/sign-out";
import { clearClientShellCache } from "@/lib/client/stay-cache";

/** Au-delà, la page part quand même. Un plugin qui ne répond pas ne bloque plus le bouton. */
export const SIGN_OUT_NATIVE_DEADLINE_MS = 1200;

let started = false;

/**
 * Déconnexion agence et client.
 * Le cookie client est HttpOnly : seul le serveur peut l’effacer.
 * On envoie un formulaire. La réponse 303 retire le cookie puis ouvre la connexion.
 * Un fetch suivi d’un changement de page laisse parfois le cookie dans la webview iOS,
 * et le site renvoie alors dans le compte.
 */
export async function signOutAccount(
  scope: SignOutScope = "local",
  next?: string,
  options?: { keepUnlock?: boolean }
) {
  if (typeof window === "undefined") return { ok: false as const };
  if (started) return { ok: true as const, redirect: next || "/connexion" };
  started = true;
  await Promise.race([
    prepareSignOut(scope, options).catch(() => {}),
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, SIGN_OUT_NATIVE_DEADLINE_MS);
    }),
  ]);
  try {
    submitSignOutForm(scope, next);
  } catch {
    started = false;
    return { ok: false as const };
  }
  return { ok: true as const, redirect: next || "/connexion" };
}

async function prepareSignOut(scope: SignOutScope, options?: { keepUnlock?: boolean }) {
  await clearClientShellCache().catch(() => {});
  const native = await import("@/lib/native/end-session");
  await native.endNativeSession(scope, options);
}

/** Navigation réelle. Le serveur répond 303 et efface le cookie dans cette réponse. */
export function submitSignOutForm(scope: SignOutScope, next?: string) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/api/auth/sign-out";
  form.hidden = true;
  append(form, "scope", scope);
  if (next) append(form, "next", next);
  document.body.appendChild(form);
  form.submit();
}

function append(form: HTMLFormElement, name: string, value: string) {
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = name;
  input.value = value;
  form.appendChild(input);
}

