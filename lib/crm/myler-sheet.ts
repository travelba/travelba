import { siteConfig } from "@/lib/site";

const ROUTES = ["GET /v2/hotels/bookings", "GET /v2/hotels/{id}", "DELETE /v2/hotels/bookings/{id}"] as const;
const WEBHOOK = `${siteConfig.url}/api/webhooks/little-emperors`;
const ENDPOINTS = ROUTES.join(", ");

function lines(...parts: string[]) {
  return parts;
}

/** Notice agence sur /admin/little-emperors. Aucun secret. */
export const MYLER_SHEET = {
  title: "Intégration MyLER",
  host: "api-staging.littleemperors.com",
  introTitle: "Back-office interne",
  intro: lines(
    "Ceci est le back-office interne de Travel BA, le CRM des agents. Ce n’est pas un site public. Le CTO de Little Emperors l’a confirmé le 24 septembre.",
    "Les agents et les assistants lisent les réservations Little Emperors, les rattachent aux clients, les consultent et les annulent.",
    "Cette revue appelle l’API de staging Little Emperors avec la clé de test. La production (travelba.fr) appellera l’API de production dès que la clé sera émise.",
    `Points d’accès appelés : ${ENDPOINTS}.`,
    `Webhook : ${WEBHOOK}. En-tête X-Access-Key.`
  ),
  keyNote:
    "Cette revue appelle l’API de staging Little Emperors avec la clé de test. La production appellera l’API de production dès que la clé sera émise.",
  auth: "Clé API, en-tête Authorization: Bearer.",
  authLabel: "Authentification",
  keyOn: "Clé de test : présente.",
  keyOff: "Clé de test non posée sur cette revue. Une fois posée, cette revue appelle l’API de staging.",
  keyPending:
    "Clé de production : pas encore émise. La production appellera l’API de production Little Emperors dès qu’elle sera remise.",
  sso: "Le SSO POST /v1/login n’est pas utilisé pour MyLER. La connexion est le compte Travelba.",
  routesLabel: "Routes v2",
  routes: ROUTES,
  syncLabel: "Lecture",
  sync: "Actualiser appelle GET /v2/hotels/bookings sur l’API de staging et affiche la liste ici. Une liste vide est une réponse réussie. Rien n’est publié au client.",
  idle: "Aucune lecture pour l’instant. Actualiser interroge l’API de staging.",
  webhookLabel: "Webhook",
  webhook: WEBHOOK,
  headerLabel: "En-tête",
  webhookHeader: "X-Access-Key",
  webhookOn: "Secret webhook : présent. La valeur n’est pas affichée.",
  webhookOff: "Secret webhook : absent sur cet environnement. Actualiser lit les réservations sans webhook.",
  refresh: "Actualiser",
  lastRead: "Dernière lecture",
  refreshEmpty:
    "L’API de staging a répondu. Aucune réservation : c’est normal, le staging n’en a pas encore.",
  blocked:
    "La clé n’est pas posée sur cet environnement. Cette revue appelle l’API de staging avec la clé de test. La production appellera l’API de production dès que la clé sera émise.",
  storage: "La table des réservations Little Emperors n’est pas encore en place.",
  emptyOk: "Aucune réservation à afficher. L’API de staging a répondu.",
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

/** Same facts, English only. This is what a MyLER partner reads on the staging review. */
export const MYLER_PARTNER = {
  title: "MyLER integration",
  host: "api-staging.littleemperors.com",
  introTitle: "Travel BA internal back office",
  intro: lines(
    "This screen is the internal back office of Travel BA, the CRM its agents use. It is not a public website. Little Emperors' CTO confirmed that on 24 September.",
    "Agents and AI assistants list Little Emperors bookings, match them to Travel BA clients, and view or cancel those bookings.",
    "This staging deployment calls the Little Emperors staging API with the test key. Production (travelba.fr) will call the Little Emperors production API once that key is issued.",
    `Endpoints called: ${ENDPOINTS}.`,
    `Webhook: ${WEBHOOK}. Header X-Access-Key.`
  ),
  keyNote:
    "This staging deployment calls the Little Emperors staging API with the test key. Production will call the Little Emperors production API once that key is issued.",
  auth: "API key, Authorization: Bearer header.",
  authLabel: "Authentication",
  keyOn: "Test key: present.",
  keyOff: "Test key: not on this staging deployment yet. Once it is present, this deployment calls the staging API.",
  keyPending:
    "Production key: not issued yet. Production will call the Little Emperors production API once that key is issued.",
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
    "The key for this environment is not in place yet. This staging deployment calls the Little Emperors staging API with the test key. Production will call the production API once that key is issued.",
  storage: "The Little Emperors reservation table is not ready yet.",
  emptyOk: "No reservations to show. The staging API answered.",
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
    return `The staging API answered. ${count} ${word}.`;
  }
  const word = count > 1 ? "réservations" : "réservation";
  return `L’API de staging a répondu. ${count} ${word}.`;
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
