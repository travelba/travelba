import { siteConfig } from "@/lib/site";

/** Notice affichée sur /admin/little-emperors. Aucun secret. */
export const MYLER_SHEET = {
  title: "Intégration MyLER",
  host: "api-staging.littleemperors.com",
  keyNote:
    "La clé de test n’est pas celle du compte de production Little Emperors. travelba.fr n’appelle pas cette API.",
  auth: "Clé API, en-tête Authorization: Bearer.",
  keyOn: "Clé de test : présente.",
  keyOff: "Clé de test : absente.",
  sso: "Le SSO POST /v1/login n’est pas utilisé pour MyLER. La connexion est le compte Travelba.",
  routes: ["GET /v2/hotels/bookings", "GET /v2/hotels/{id}", "DELETE /v2/hotels/bookings/{id}"] as const,
  sync: "Actualiser appelle GET /v2/hotels/bookings sur l’environnement de test et affiche la liste ici. Une liste vide est une réponse réussie. Rien n’est publié au client.",
  idle: "Aucune lecture pour l’instant. Actualiser interroge l’environnement de test.",
  webhook: `${siteConfig.url}/api/webhooks/little-emperors`,
  webhookHeader: "X-Access-Key",
  webhookOn: "Secret webhook : présent. La valeur n’est pas affichée.",
  webhookOff: "Secret webhook : absent sur cet environnement. Actualiser lit les réservations sans webhook.",
  refreshEmpty:
    "L’environnement de test a répondu. Aucune réservation : c’est normal, le staging n’en a pas encore.",
};

/** Phrase après Actualiser. Le nombre vient de la réponse, pas d’un prix inventé. */
export function mylerRefreshNotice(fetched: number) {
  const count = Number.isFinite(fetched) ? Math.max(0, Math.floor(fetched)) : 0;
  if (count === 0) return MYLER_SHEET.refreshEmpty;
  const word = count > 1 ? "réservations" : "réservation";
  return `L’environnement de test a répondu. ${count} ${word}.`;
}
