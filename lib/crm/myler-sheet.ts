import { siteConfig } from "@/lib/site";

const ROUTES = ["GET /v2/hotels/bookings", "GET /v2/hotels/{id}", "DELETE /v2/hotels/bookings/{id}"] as const;
const WEBHOOK = `${siteConfig.url}/api/webhooks/little-emperors`;
const ENDPOINTS = ROUTES.join(", ");

function lines(...parts: string[]) {
  return parts;
}

/** Notice agence sur /admin/little-emperors. Production, sans secret ni hôte de test. */
export const MYLER_SHEET = {
  title: "Little Emperors",
  host: "Compte de production",
  introTitle: "Back-office interne",
  intro: lines(
    "Ceci est le back-office interne de Travel BA, le CRM des agents. Ce n’est pas un site public. Le CTO de Little Emperors l’a confirmé le 24 septembre.",
    "Les agents et les assistants lisent les réservations Little Emperors, les rattachent aux clients, les consultent et les annulent.",
    "travelba.fr appelle l’API de production Little Emperors. La revue de staging appelle l’API de staging avec la clé de test.",
    `Points d’accès appelés : ${ENDPOINTS}.`,
    `Webhook : ${WEBHOOK}. En-tête X-Access-Key.`
  ),
  keyNote:
    "Les réservations hôtel se lisent sur le compte de production. La production appelle l’API de production Little Emperors. La revue de staging appelle l’API de staging avec la clé de test. Rien n’est publié au client.",
  auth: "Clé du compte de production.",
  authLabel: "Clé",
  keyOn: "Clé de production : présente. La valeur n’est pas affichée.",
  keyOff: "Clé de production : absente sur cet environnement.",
  keyPending:
    "Clé de production : absente sur cet environnement. La production appelle l’API de production Little Emperors.",
  sso: "La connexion est le compte de l’agence.",
  routesLabel: "Lecture",
  routes: ROUTES,
  syncLabel: "Lecture",
  sync: "Actualiser lit les réservations et les affiche ici. Une liste vide est une réponse réussie. Rien n’est publié au client.",
  idle: "Aucune lecture pour l’instant.",
  webhookLabel: "Webhook",
  webhook: WEBHOOK,
  headerLabel: "En-tête",
  webhookHeader: "X-Access-Key",
  webhookOn: "Secret webhook : présent. La valeur n’est pas affichée.",
  webhookOff: "Secret webhook : absent. La valeur n’est pas affichée.",
  refresh: "Actualiser",
  lastRead: "Dernière lecture",
  refreshEmpty: "Lecture réussie. Aucune réservation à afficher.",
  blocked:
    "La clé de production est absente sur cet environnement. La production appelle l’API de production Little Emperors.",
  storage: "La table des réservations Little Emperors n’est pas encore en place.",
  emptyOk: "Aucune réservation à afficher.",
  emptyIdle: "Aucune réservation Little Emperors pour le moment.",
  failed: "Opération impossible.",
  hotelUnknown: "Hôtel non indiqué",
  stateBooked: "Réservée",
  bookedOn: "Date de réservation",
  sortNewest: "Date de réservation, plus récentes",
  sortOldest: "Date de réservation, plus anciennes",
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
  introTitle: "Travel BA internal back office",
  intro: lines(
    "This screen is the internal back office of Travel BA, the CRM its agents use. It is not a public website. Little Emperors' CTO confirmed that on 24 September.",
    "Agents and AI assistants list Little Emperors bookings, match them to Travel BA clients, and view or cancel those bookings.",
    "This staging deployment calls the Little Emperors staging API with the test key. Production (travelba.fr) calls the Little Emperors production API.",
    `Endpoints called: ${ENDPOINTS}.`,
    `Webhook: ${WEBHOOK}. Header X-Access-Key.`
  ),
  keyNote:
    "This staging deployment calls the Little Emperors staging API with the test key. Production calls the Little Emperors production API.",
  auth: "API key, Authorization: Bearer header.",
  authLabel: "Authentication",
  keyOn: "Test key: present.",
  keyOff: "Test key: not on this staging deployment yet. Once it is present, this deployment calls the staging API.",
  keyPending:
    "Production calls the Little Emperors production API.",
  sso: "SSO POST /v1/login is not used for MyLER. Sign-in is the Travelba account.",
  routesLabel: "v2 routes",
  routes: ROUTES,
  syncLabel: "Read",
  sync: "Refresh calls GET /v2/hotels/bookings on the staging API and shows the list here. An empty list is a successful response. Nothing is published to a traveller.",
  idle: "No read yet. Refresh calls the staging API.",
  webhookLabel: "Webhook",
  webhook: WEBHOOK,
  headerLabel: "Header",
  webhookHeader: "X-Access-Key",
  webhookOn: "Webhook secret: present. The value is not shown.",
  webhookOff: "Webhook secret: absent on this environment. Refresh reads reservations without a webhook.",
  refresh: "Refresh",
  lastRead: "Last read",
  refreshEmpty: "The staging API answered. No reservations yet: that is expected, staging has none.",
  blocked:
    "The key for this environment is not in place yet. This staging deployment calls the Little Emperors staging API with the test key. Production calls the Little Emperors production API.",
  storage: "The Little Emperors reservation table is not ready yet.",
  emptyOk: "No reservations to show. The staging API answered.",
  emptyIdle: "No Little Emperors reservations yet.",
  failed: "This could not be completed.",
  hotelUnknown: "Hotel name not provided",
  stateBooked: "Booked",
  bookedOn: "Booking date",
  sortNewest: "Booking date, newest",
  sortOldest: "Booking date, oldest",
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
    return `The staging API answered. ${count} ${word}.`;
  }
  const word = count > 1 ? "réservations" : "réservation";
  return `Lecture du compte de production. ${count} ${word}.`;
}

/** A stored probe line must not show French to a partner, and never a secret. */
export function partnerVisibleProbeError(message: string) {
  const text = message.trim().slice(0, 400);
  if (!text) return MYLER_PARTNER.failed;
  if (text.includes("bookings() on null")) {
    return "Little Emperors has not attached an account to the test key. No reservation was created.";
  }
  if (/[àâäéèêëïîôùûüçœ]/i.test(text)) return "The staging API could not be read. Use Refresh to try again.";
  return text;
}
