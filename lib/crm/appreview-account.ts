/** Compte de revue App Store. is_test. Jamais un compte d’agence. */

export const APPREVIEW_EMAIL = "appreview@travelba.fr";
export const APPREVIEW_FIRST_NAME = "Revue";
export const APPREVIEW_LAST_NAME = "Apple";
/** Numéro fictif, pour passer le mur téléphone de l’espace. Pas un client. */
export const APPREVIEW_PHONE = "+33700000000";

export type AppreviewDecision =
  | { action: "refuse" }
  | { action: "refresh"; customerId: string; authUserId: string | null }
  | { action: "create"; authUserId: string | null };

/**
 * Fiche encore ouverte : on repose le mot de passe.
 * Fiche déjà supprimée, ou absente : une fiche neuve. L’ancienne anonymisée reste pour les dossiers.
 * Un auth user encore là (suppression interrompue) est réutilisé, pas doublé.
 */
export function appreviewAccountDecision(input: {
  staff: boolean;
  customer: { id: string; authUserId: string | null; deleted: boolean } | null;
  authUserId: string | null;
}): AppreviewDecision {
  if (input.staff) return { action: "refuse" };
  if (input.customer && !input.customer.deleted) {
    return {
      action: "refresh",
      customerId: input.customer.id,
      authUserId: input.customer.authUserId || input.authUserId,
    };
  }
  return { action: "create", authUserId: input.authUserId };
}

export function appreviewPasswordAccepted(password: string) {
  return password.trim().length >= 12 && !/\s/.test(password);
}
