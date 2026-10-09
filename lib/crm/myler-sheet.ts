import { siteConfig } from "@/lib/site";

const ROUTES = ["GET /v2/hotels/bookings", "GET /v2/hotels/{id}", "DELETE /v2/hotels/bookings/{id}"] as const;
const WEBHOOK = `${siteConfig.url}/api/webhooks/little-emperors`;

/** Notice agence sur /admin/little-emperors. Aucun secret. */
export const MYLER_SHEET = {
  title: "Intégration MyLER",
  host: "api-staging.littleemperors.com",
  keyNote:
    "La clé de test n’est pas celle du compte de production Little Emperors. travelba.fr n’appelle pas cette API.",
  auth: "Clé API, en-tête Authorization: Bearer.",
  authLabel: "Authentification",
  keyOn: "Clé de test : présente.",
  keyOff: "Clé de test : absente.",
  sso: "Le SSO POST /v1/login n’est pas utilisé pour MyLER. La connexion est le compte Travelba.",
  routesLabel: "Routes v2",
  routes: ROUTES,
  syncLabel: "Lecture",
  sync: "Actualiser appelle GET /v2/hotels/bookings sur l’environnement de test et affiche la liste ici. Une liste vide est une réponse réussie. Rien n’est publié au client.",
  idle: "Aucune lecture pour l’instant. Actualiser interroge l’environnement de test.",
  webhookLabel: "Webhook",
  webhook: WEBHOOK,
  headerLabel: "En-tête",
  webhookHeader: "X-Access-Key",
  webhookOn: "Secret webhook : présent. La valeur n’est pas affichée.",
  webhookOff: "Secret webhook : absent sur cet environnement. Actualiser lit les réservations sans webhook.",
  refresh: "Actualiser",
  lastRead: "Dernière lecture",
  refreshEmpty:
    "L’environnement de test a répondu. Aucune réservation : c’est normal, le staging n’en a pas encore.",
  blocked: "Cet environnement n’appelle pas Little Emperors.",
  storage: "La table des réservations Little Emperors n’est pas encore en place.",
  emptyOk: "Aucune réservation à afficher. L’environnement de test a répondu.",
  emptyIdle: "Aucune réservation Little Emperors pour le moment.",
  failed: "Opération impossible.",
  hotelUnknown: "Hôtel non indiqué",
  stateBooked: "Réservée",
  stateCancelled: "Annulée",
  stateMissing: "État non indiqué",
  address: "Adresse",
  city: "Ville",
  site: "Site",
  stay: "Séjour",
  guests: "Voyageurs",
  total: "Total Little Emperors",
  deadline: "Limite",
  lateCancel:
    "La date limite d’annulation est passée. Écrivez à bookings@littleemperors.com : la politique d’annulation s’applique.",
};

/** Same facts, English only. This is what a MyLER partner reads. */
export const MYLER_PARTNER = {
  title: "MyLER integration",
  host: "api-staging.littleemperors.com",
  keyNote: "This test key is not the Little Emperors production key. travelba.fr does not call this API.",
  auth: "API key, Authorization: Bearer header.",
  authLabel: "Authentication",
  keyOn: "Test key: present.",
  keyOff: "Test key: absent.",
  sso: "SSO POST /v1/login is not used for MyLER. Sign-in is the Travelba account.",
  routesLabel: "v2 routes",
  routes: ROUTES,
  syncLabel: "Read",
  sync: "Refresh calls GET /v2/hotels/bookings on the test environment and shows the list here. An empty list is a successful response. Nothing is published to a traveller.",
  idle: "No read yet. Refresh calls the test environment.",
  webhookLabel: "Webhook",
  webhook: WEBHOOK,
  headerLabel: "Header",
  webhookHeader: "X-Access-Key",
  webhookOn: "Webhook secret: present. The value is not shown.",
  webhookOff: "Webhook secret: absent on this environment. Refresh reads reservations without a webhook.",
  refresh: "Refresh",
  lastRead: "Last read",
  refreshEmpty: "The test environment answered. No reservations yet: that is expected, staging has none.",
  blocked: "This environment does not call Little Emperors.",
  storage: "The Little Emperors reservation table is not ready yet.",
  emptyOk: "No reservations to show. The test environment answered.",
  emptyIdle: "No Little Emperors reservations yet.",
  failed: "This could not be completed.",
  hotelUnknown: "Hotel name not provided",
  stateBooked: "Booked",
  stateCancelled: "Cancelled",
  stateMissing: "Status not provided",
  address: "Address",
  city: "City",
  site: "Website",
  stay: "Stay",
  guests: "Guests",
  total: "Little Emperors total",
  deadline: "Deadline",
  lateCancel:
    "The cancellation deadline has passed. Write to bookings@littleemperors.com: the cancellation policy applies.",
};

export type MylerSheet = typeof MYLER_SHEET;

export function mylerSheet(partner: boolean): MylerSheet {
  return partner ? MYLER_PARTNER : MYLER_SHEET;
}

/** Phrase après Actualiser / Refresh. Le nombre vient de la réponse, pas d’un prix inventé. */
export function mylerRefreshNotice(fetched: number, partner = false) {
  const sheet = mylerSheet(partner);
  const count = Number.isFinite(fetched) ? Math.max(0, Math.floor(fetched)) : 0;
  if (count === 0) return sheet.refreshEmpty;
  if (partner) {
    const word = count === 1 ? "reservation" : "reservations";
    return `The test environment answered. ${count} ${word}.`;
  }
  const word = count > 1 ? "réservations" : "réservation";
  return `L’environnement de test a répondu. ${count} ${word}.`;
}

/** A stored probe line must not show French to a partner, and never a secret. */
export function partnerVisibleProbeError(message: string) {
  const text = message.trim().slice(0, 400);
  if (!text) return MYLER_PARTNER.failed;
  if (text.includes("bookings() on null")) {
    return "Little Emperors has not attached an account to the test key. No reservation was created.";
  }
  if (/[àâäéèêëïîôùûüçœ]/i.test(text)) return "The test environment could not be read. Use Refresh to try again.";
  return text;
}
