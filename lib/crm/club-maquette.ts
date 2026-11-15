/**
 * Maquette Club Travel BA. Données fictives, en mémoire.
 * Aucune écriture, aucun appel Stripe, Little Emperors, WhatsApp, e-mail ou MB3M.
 * Fermée en production : `exampleSessionEnabled` et le proxy.
 */

export type ClubLane = "parcours" | "cas" | "agence";

export type ClubScreen = {
  id: string;
  href: string;
  title: string;
  summary: string;
  lane: ClubLane;
};

/**
 * Aucun prix de cotisation n’est paramétré dans le CRM
 * (l’accès Hôtels Platinum n’a pas de montant).
 */
export const CLUB_FEE_EXAMPLE = {
  euros: 490,
  label: "490 €",
  period: "par an",
  example: true,
  reason: "Aucun prix de cotisation n’est paramétré dans le CRM.",
} as const;

export const CLUB_MEMBER = {
  firstName: "Léa",
  lastName: "Exemplaire",
  email: "lea.exemplaire@exemple.invalid",
  phone: "+33 6 00 00 00 42",
  code: "CLUB-EXEMPLE",
  card: "•••• 4242",
  relative: "Hugo Exemplaire",
  filleul: "Marc Exemplaire",
} as const;

export type ClubRate = {
  id: string;
  title: string;
  total: number;
  board: string;
  free: boolean;
  badge: string;
  conditions: string;
};

export type ClubRoom = {
  id: string;
  name: string;
  area: string;
  bed: string;
  view: string;
  rates: ClubRate[];
};

export type ClubHotel = {
  slug: string;
  name: string;
  city: string;
  total: number;
  nights: number;
  breakfast: boolean;
  freeCancellation: boolean;
  benefits: string[];
  address: string;
  checkIn: string;
  checkOut: string;
  tone: string;
  photo: string;
  rooms: ClubRoom[];
};

const FLEX = "Annulation sans frais jusqu’au 1 mars 2027, 18 h, heure de l’hôtel.";
const LOCKED = "Tarif non remboursable. En cas d’annulation, le séjour n’est pas remboursé.";

export const CLUB_HOTELS: ClubHotel[] = [
  {
    slug: "riad-lina",
    name: "Hôtel Exemple Riad Lina",
    city: "Marrakech",
    total: 1240,
    nights: 3,
    breakfast: true,
    freeCancellation: true,
    benefits: [
      "Petit-déjeuner inclus",
      "Surclassement selon disponibilité",
      "Départ tardif selon disponibilité",
      "Crédit hôtel de 100 €",
      "Accueil par le concierge",
    ],
    address: "12 derb Exemple, Marrakech",
    checkIn: "15 h",
    checkOut: "12 h",
    tone: "linear-gradient(160deg, #1a3358 0%, #0B192C 55%, #8c7352 140%)",
    photo: "https://images.unsplash.com/photo-1677837488142-a85ffbffe408?q=75&w=1200&auto=format&fit=crop",
    rooms: [
      {
        id: "patio",
        name: "Chambre Patio",
        area: "32 m²",
        bed: "Lit king size",
        view: "Patio",
        rates: [
          {
            id: "patio-flex",
            title: "Tarif flexible",
            total: 1240,
            board: "Petit-déjeuner inclus",
            free: true,
            badge: "Annulation gratuite",
            conditions: FLEX,
          },
          {
            id: "patio-nr",
            title: "Tarif non remboursable",
            total: 1090,
            board: "Petit-déjeuner inclus",
            free: false,
            badge: "Non remboursable",
            conditions: LOCKED,
          },
        ],
      },
      {
        id: "jardin",
        name: "Suite Jardin",
        area: "48 m²",
        bed: "Lit king size",
        view: "Jardin",
        rates: [
          {
            id: "jardin-flex",
            title: "Tarif flexible",
            total: 1680,
            board: "Petit-déjeuner inclus",
            free: true,
            badge: "Annulation gratuite",
            conditions: FLEX,
          },
        ],
      },
    ],
  },
  {
    slug: "palais-serein",
    name: "Hôtel Exemple Palais Serein",
    city: "Rome",
    total: 980,
    nights: 2,
    breakfast: true,
    freeCancellation: false,
    benefits: ["Petit-déjeuner inclus", "Surclassement selon disponibilité", "Accueil par le concierge"],
    address: "8 via Esempio, Rome",
    checkIn: "15 h",
    checkOut: "11 h",
    tone: "linear-gradient(160deg, #3d3428 0%, #0B192C 60%, #C5A880 150%)",
    photo: "https://images.unsplash.com/photo-1552832230-c0197dd311b5?q=75&w=1200&auto=format&fit=crop",
    rooms: [
      {
        id: "piazza",
        name: "Chambre Piazza",
        area: "28 m²",
        bed: "Lit queen size",
        view: "Cour",
        rates: [
          {
            id: "piazza-nr",
            title: "Tarif non remboursable",
            total: 980,
            board: "Petit-déjeuner inclus",
            free: false,
            badge: "Non remboursable",
            conditions: LOCKED,
          },
        ],
      },
    ],
  },
  {
    slug: "villa-brume",
    name: "Hôtel Exemple Villa Brume",
    city: "Lisbonne",
    total: 860,
    nights: 2,
    breakfast: false,
    freeCancellation: true,
    benefits: ["Surclassement selon disponibilité", "Départ tardif selon disponibilité", "Accueil par le concierge"],
    address: "3 rua Exemplo, Lisbonne",
    checkIn: "16 h",
    checkOut: "12 h",
    tone: "linear-gradient(165deg, #16324a 0%, #0B192C 50%, #6d675f 130%)",
    photo: "https://images.unsplash.com/photo-1585208798174-6cedd86e019a?q=75&w=1200&auto=format&fit=crop",
    rooms: [
      {
        id: "tejo",
        name: "Chambre Tejo",
        area: "30 m²",
        bed: "Lit king size",
        view: "Ville",
        rates: [
          {
            id: "tejo-flex",
            title: "Tarif flexible",
            total: 860,
            board: "Hébergement seul",
            free: true,
            badge: "Annulation gratuite",
            conditions: FLEX,
          },
        ],
      },
    ],
  },
];

export const CLUB_STAY = {
  hotel: CLUB_HOTELS[0],
  room: "Chambre Patio",
  rate: "Tarif flexible",
  total: 1240,
  when: "12–15 mars 2027",
  confirmation: "EX-CLUB-2041",
  dossier: "TB-EXEMPLE-2041",
  guest: CLUB_MEMBER.firstName + " " + CLUB_MEMBER.lastName,
} as const;

/** Ordre du parcours. L’index `/maquette/club` les liste ainsi. */
export const CLUB_SCREENS: ClubScreen[] = [
  { id: "public", href: "/maquette/club/accueil", title: "Page publique", summary: "Marque Travel BA, inscription, e-mails gratuits acceptés.", lane: "parcours" },
  { id: "signup", href: "/maquette/club/inscription", title: "Inscription", summary: "Code de parrainage et identité.", lane: "parcours" },
  { id: "phone", href: "/maquette/club/inscription/telephone", title: "Téléphone vérifié", summary: "Code reçu par SMS, maquette.", lane: "parcours" },
  { id: "password", href: "/maquette/club/inscription/mot-de-passe", title: "Mot de passe", summary: "Connexion par mot de passe.", lane: "parcours" },
  { id: "relatives", href: "/maquette/club/inscription/proches", title: "Proches", summary: "Noms enregistrés, facultatif.", lane: "parcours" },
  { id: "card", href: "/maquette/club/garantie", title: "Carte de garantie", summary: "Formulaire seulement. Aucun débit. No-show et frais d’annulation.", lane: "parcours" },
  { id: "wait", href: "/maquette/club/attente", title: "Validation", summary: "Sous 24 h. Aucun accès à la recherche.", lane: "parcours" },
  { id: "refuse", href: "/maquette/club/refus", title: "Refus", summary: "Message neutre et WhatsApp de l’agence.", lane: "parcours" },
  { id: "existing", href: "/maquette/club/deja-client", title: "Déjà client", summary: "Accès direct, sans nouvelle validation.", lane: "parcours" },
  { id: "login", href: "/maquette/club/connexion", title: "Connexion", summary: "Obligatoire avant de chercher.", lane: "parcours" },
  { id: "search-wait", href: "/maquette/club/recherche/attente", title: "Recherche en cours", summary: "Attente animée, messages VIP.", lane: "parcours" },
  { id: "search", href: "/maquette/club/recherche", title: "Recherche", summary: "Tri et filtres. Little Emperors, TTC, euros. Pas d’avis.", lane: "parcours" },
  { id: "hotel", href: "/maquette/club/hotel", title: "Fiche hôtel", summary: "Avantages, chambres, 5 chambres maximum.", lane: "parcours" },
  { id: "rate", href: "/maquette/club/tarif", title: "Chambre et tarif", summary: "Rond coché, bordure dorée. Suivant grisé tant que rien n’est choisi.", lane: "parcours" },
  { id: "group", href: "/maquette/club/groupe", title: "Devis groupe", summary: "Au-delà de 5 chambres.", lane: "parcours" },
  { id: "guest", href: "/maquette/club/voyageur", title: "Voyageur", summary: "Soi, un proche, ou un nom libre. Demandes spéciales.", lane: "parcours" },
  { id: "pay", href: "/maquette/club/paiement", title: "Paiement", summary: "Formulaire Little Emperors intégré, maquette.", lane: "parcours" },
  { id: "price", href: "/maquette/club/paiement/prix", title: "Prix modifié", summary: "Nouveau prix, le membre confirme.", lane: "cas" },
  { id: "soldout", href: "/maquette/club/paiement/complet", title: "Plus de chambre", summary: "Hôtels similaires.", lane: "cas" },
  { id: "expired", href: "/maquette/club/paiement/carte", title: "Carte expirée", summary: "Réservation bloquée jusqu’à mise à jour.", lane: "cas" },
  { id: "dues", href: "/maquette/club/paiement/cotisation", title: "Cotisation non payée", summary: "Après 6 mois, impossible de finaliser.", lane: "cas" },
  { id: "confirm", href: "/maquette/club/confirmation", title: "Confirmation", summary: "Visible tout de suite dans l’app.", lane: "parcours" },
  { id: "email", href: "/maquette/club/confirmation/email", title: "E-mail de confirmation", summary: "Aperçu. Rien n’est envoyé.", lane: "parcours" },
  { id: "whatsapp", href: "/maquette/club/confirmation/whatsapp", title: "WhatsApp de confirmation", summary: "Aperçu. Rien n’est envoyé.", lane: "parcours" },
  { id: "reminder", href: "/maquette/club/rappel", title: "Rappel la veille", summary: "Aperçu WhatsApp.", lane: "parcours" },
  { id: "stays", href: "/maquette/club/sejours", title: "Mes séjours", summary: "Le séjour confirmé.", lane: "parcours" },
  { id: "stay", href: "/maquette/club/sejours/riad-lina", title: "Détail du séjour", summary: "Avantages, annulation, modification.", lane: "parcours" },
  { id: "cancel", href: "/maquette/club/sejours/riad-lina/annuler", title: "Annuler", summary: "Le membre annule seul. Remboursement automatique.", lane: "parcours" },
  { id: "fee", href: "/maquette/club/cotisation", title: "Cotisation", summary: "Gratuite 6 mois, puis le montant d’exemple.", lane: "parcours" },
  { id: "fee-pay", href: "/maquette/club/cotisation/paiement", title: "Payer la cotisation", summary: "Le membre paie lui-même.", lane: "parcours" },
  { id: "referral", href: "/maquette/club/parrainage", title: "Parrainage", summary: "Code, filleuls illimités, cotisation offerte.", lane: "parcours" },
  { id: "concierge", href: "/maquette/club/concierge", title: "Concierge", summary: "Proposition à valider.", lane: "parcours" },
  { id: "account", href: "/maquette/club/compte", title: "Mon compte", summary: "Identité d’exemple et suppression.", lane: "parcours" },
  { id: "delete", href: "/maquette/club/compte/supprimer", title: "Supprimer le compte", summary: "Le membre le fait lui-même.", lane: "parcours" },
  { id: "admin-members", href: "/admin/maquette-club", title: "Membres", summary: "Onglet Club. Suspendre.", lane: "agence" },
  { id: "admin-queue", href: "/admin/maquette-club/inscriptions", title: "Inscriptions à valider", summary: "Parrainage, téléphone, carte. Valider ou refuser.", lane: "agence" },
  { id: "admin-file", href: "/admin/maquette-club/membres/lea-exemplaire", title: "Fiche membre", summary: "Dossier CRM, cotisation, parrainage.", lane: "agence" },
  { id: "admin-charge", href: "/admin/maquette-club/membres/lea-exemplaire/prelever", title: "Prélever", summary: "Toujours une confirmation de Raphael.", lane: "agence" },
  { id: "admin-alerts", href: "/admin/maquette-club/alertes", title: "Alertes dans le CRM", summary: "Inscription et réservation.", lane: "agence" },
  { id: "admin-email", href: "/admin/maquette-club/alertes/email", title: "Alerte e-mail", summary: "Aperçu. Rien n’est envoyé.", lane: "agence" },
  { id: "admin-dashboard", href: "/admin/maquette-club/tableau", title: "Tableau de bord", summary: "Indicateur principal : réservations par mois.", lane: "agence" },
];

const BY_HREF = new Map(CLUB_SCREENS.map((screen) => [screen.href, screen]));
const BY_ID = new Map(CLUB_SCREENS.map((screen) => [screen.id, screen]));

export function clubScreenById(id: string) {
  return BY_ID.get(id) || null;
}

export function clubHotel(slug?: string | null) {
  if (!slug) return CLUB_HOTELS[0];
  return CLUB_HOTELS.find((hotel) => hotel.slug === slug) || null;
}

export function memberPath(slug?: string[]) {
  return "/maquette/club" + (slug?.length ? `/${slug.join("/")}` : "");
}

export function adminPublicPath(slug?: string[]) {
  return "/admin/maquette-club" + (slug?.length ? `/${slug.join("/")}` : "");
}

const HOTEL_STEP = /^\/maquette\/club\/(hotel|tarif|voyageur)\/([a-z0-9-]+)$/;

export function findMember(path: string): { id: string; hotelSlug: string } | null {
  if (path === "/maquette/club") return { id: "index", hotelSlug: CLUB_HOTELS[0].slug };
  const listed = BY_HREF.get(path);
  if (listed && listed.lane !== "agence") return { id: listed.id, hotelSlug: CLUB_HOTELS[0].slug };
  const step = HOTEL_STEP.exec(path);
  if (!step) return null;
  const hotel = clubHotel(step[2]);
  if (!hotel) return null;
  const id = step[1] === "hotel" ? "hotel" : step[1] === "tarif" ? "rate" : "guest";
  return { id, hotelSlug: hotel.slug };
}

export function findAdmin(path: string) {
  const listed = BY_HREF.get(path);
  if (!listed || listed.lane !== "agence") return null;
  return listed;
}

/** Décision du proxy. `ignore` : la requête suit le routage habituel. */
export function clubMaquetteRequest(path: string, vercelEnv: string | undefined) {
  const club =
    path === "/maquette" ||
    path.startsWith("/maquette/") ||
    path === "/admin/maquette-club" ||
    path.startsWith("/admin/maquette-club/");
  if (!club) return "ignore" as const;
  if (vercelEnv === "production") return "redirect" as const;
  return "next" as const;
}

export function clubAdminInternalPath(path: string) {
  return path.replace("/admin/maquette-club", "/maquette/admin-club");
}

export const CLUB_MONTHS = [
  { label: "Juin", count: 2 },
  { label: "Juil.", count: 3 },
  { label: "Août", count: 5 },
  { label: "Sept.", count: 4 },
  { label: "Oct.", count: 8 },
  { label: "Nov.", count: 6 },
] as const;
