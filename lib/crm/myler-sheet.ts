import { siteConfig } from "@/lib/site";

/** Notice affichée sur /admin/little-emperors. Aucun secret. */
export const MYLER_SHEET = {
  title: "Intégration MyLER",
  host: "api-staging.littleemperors.com",
  keyNote:
    "La clé de test n’est pas celle du compte de production Little Emperors. travelba.fr n’appelle pas cette API.",
  auth: "Clé API, en-tête Authorization: Bearer.",
  keyOn: "Clé configurée sur cet environnement.",
  keyOff: "Clé absente sur cet environnement.",
  sso: "Le SSO POST /v1/login n’est pas utilisé pour MyLER.",
  routes: ["GET /v2/hotels/bookings", "GET /v2/hotels/{id}", "DELETE /v2/hotels/bookings/{id}"] as const,
  webhook: `${siteConfig.url}/api/webhooks/little-emperors`,
  webhookHeader: "X-Access-Key",
};
