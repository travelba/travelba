/** Identifiant marchand Apple Pay de l’application. Ce n’est pas un secret. */
export const APPLE_PAY_MERCHANT_ID = "merchant.fr.travelba.client";

/**
 * Prestations de voyage consommées hors de l’application : Apple Pay et la carte
 * passent par Stripe. Pas d’achat intégré (guideline 3.1.3(e) et 3.1.5).
 */
export function applePayTravelAllowed() {
  return true;
}

/** Corps du fichier de vérification de domaine. Vide ou une clé privée : on ne le publie pas. */
export function applePayAssociationBody(raw: string | null | undefined) {
  const text = (raw || "").replace(/\r/g, "").trim();
  if (text.length < 32 || text.length > 20_000) return null;
  if (/PRIVATE KEY|BEGIN /.test(text)) return null;
  return text;
}
