/**
 * Liste d’essai du module Restaurants : `RESTAURANT_ALLOWED_BOOKINGS`, références de dossier séparées par des virgules
 * (`TB-2026-0075`). Fermé par défaut : sans la variable, ou vide, aucun WhatsApp restaurant ne part pour aucun dossier.
 * Le mode test de Benjamin (données `is_test`) n’écrit qu’au numéro de test, jamais au client : il passe sans la liste.
 */
export const RESTAURANT_ALLOWED_BOOKINGS_ENV = "RESTAURANT_ALLOWED_BOOKINGS";

export const RESTAURANT_ALLOWLIST_BLOCK = "Dossier hors de la liste d’essai (RESTAURANT_ALLOWED_BOOKINGS).";

export const RESTAURANT_ALLOWLIST_BADGE = "Hors liste d’essai";

function normalizeReference(value: string | null | undefined) {
  return (value || "").trim().toUpperCase();
}

/** Les références lues dans la variable, normalisées. Vide ou absente : aucune. */
export function parseRestaurantAllowlist(raw: string | null | undefined): Set<string> {
  const refs = new Set<string>();
  for (const part of (raw || "").split(/[,;\s]+/)) {
    const ref = normalizeReference(part);
    if (ref) refs.add(ref);
  }
  return refs;
}

export function restaurantAllowlist(raw: string | null | undefined = process.env[RESTAURANT_ALLOWED_BOOKINGS_ENV]) {
  return parseRestaurantAllowlist(raw);
}

/** Vrai seulement si la référence est dans la liste. Liste vide : faux pour tout le monde. */
export function restaurantBookingAllowed(reference: string | null | undefined, allowlist: Set<string> = restaurantAllowlist()) {
  const ref = normalizeReference(reference);
  if (!ref || !allowlist.size) return false;
  return allowlist.has(ref);
}

/**
 * Un envoi (pré-message, cartes, confirmation) ne part que pour un dossier de la liste,
 * ou pour une donnée de test dont le destinataire est le numéro de test.
 */
export function restaurantSendGate(
  input: { reference: string | null | undefined; test: boolean; phone: string | null; testPhone: string | null },
  allowlist: Set<string> = restaurantAllowlist()
): { ok: true } | { ok: false; reason: string } {
  if (input.test) {
    const digits = (value: string | null) => (value || "").replace(/\D/g, "");
    if (!input.testPhone || !input.phone || digits(input.phone) !== digits(input.testPhone)) {
      return { ok: false, reason: "Mode test : seul le numéro de test reçoit les messages." };
    }
    return { ok: true };
  }
  if (!restaurantBookingAllowed(input.reference, allowlist)) return { ok: false, reason: RESTAURANT_ALLOWLIST_BLOCK };
  return { ok: true };
}
