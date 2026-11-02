import { AGENCY_GOOGLE_DOMAIN } from "@/lib/crm/agency-access";

/** Message de `/admin/login?error=` : accès coupé, ou connexion Google refusée côté serveur. */
export function loginErrorMessage(code: string | null | undefined) {
  if (code === "desactive" || code === "google-desactive") return "Cet accès est désactivé.";
  if (code === "google-domaine") return `Utilisez votre compte Google ${AGENCY_GOOGLE_DOMAIN}.`;
  if (code === "google-inconnu") {
    return "Ce compte Google n’est pas encore invité dans l’Équipe. Connectez-vous d’abord avec le lien reçu ou votre mot de passe.";
  }
  if (code === "auth") return "La connexion n’a pas abouti. Réessayez.";
  return null;
}
