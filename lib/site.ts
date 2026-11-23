export const siteConfig = {
  name: "Travel Business Agency",
  shortName: "TBA",
  url: "https://travelba.fr",
  logoSrc: "/brand/logo-tba.png",
  // Adresse e-mail qui reçoit les demandes du formulaire de contact.
  contactEmail: "contact@travelba.fr",
  // Numéro WhatsApp Business au format international SANS le "+" ni espaces.
  whatsappNumber: "33756841315",
  whatsappDisplay: "+33 7 56 84 13 15",
  phoneDisplay: "+33 7 56 84 13 15",
  address: {
    line1: "9 rue Greffulhe",
    postalCode: "92300",
    city: "Levallois-Perret",
    country: "France",
    full: "9 rue Greffulhe, 92300 Levallois-Perret, France",
  },
  social: {
    instagram: "https://instagram.com/",
    linkedin: "https://linkedin.com/",
  },
  // Données légales officielles (source : RCS Nanterre / RNE / INSEE).
  legal: {
    legalName: "TRAVEL BUSINESS AGENCY",
    legalForm: "SASU (société par actions simplifiée unipersonnelle)",
    capital: "20 000 €",
    siren: "991 614 694",
    siret: "991 614 694 00016",
    vat: "FR79991614694",
    rcs: "991 614 694 R.C.S. Nanterre",
    ape: "79.12Z — Activités des voyagistes",
    president: "RZ INVEST",
    accreditation: "IATA (International Air Transport Association)",
    /** Numéro IATA de l’agence, imprimé sur la facture. */
    iata: "20291655",
    garantieFinanciere:
      "APST — Association Professionnelle de Solidarité du Tourisme, 15 avenue Carnot, 75017 Paris",
    /** Numéro d’adhérent APST. */
    apstNumber: "43865",
    /** Immatriculation Atout France. */
    atoutFrance: "IM092260002",
    /** Téléphone imprimé sur la facture. Le WhatsApp public reste `whatsappDisplay`. */
    invoicePhone: "07 72 15 82 57",
  },
} as const;

/** Aperçu partagé (WhatsApp, Facebook). Logo seul : aucun nom, aucun dossier. */
export const CONCIERGE_SHARE_TITLE = "Le Concierge";
export const CONCIERGE_SHARE_DESCRIPTION = "Votre espace personnel vous attend.";

export const BRAND_OG_IMAGE = "/og.png";
export const BRAND_OG_IMAGE_WIDTH = 1200;
export const BRAND_OG_IMAGE_HEIGHT = 630;
export const BRAND_OG_SQUARE = "/og-square.png";
export const BRAND_OG_SQUARE_SIZE = 600;
export const BRAND_ICON = "/icon.png";
export const BRAND_APPLE_TOUCH_ICON = "/apple-touch-icon.png";

export function brandShareImages(alt: string) {
  return [
    {
      url: BRAND_OG_IMAGE,
      width: BRAND_OG_IMAGE_WIDTH,
      height: BRAND_OG_IMAGE_HEIGHT,
      alt,
      type: "image/png" as const,
    },
    {
      url: BRAND_OG_SQUARE,
      width: BRAND_OG_SQUARE_SIZE,
      height: BRAND_OG_SQUARE_SIZE,
      alt,
      type: "image/png" as const,
    },
  ];
}

export const SERVICE_KEYS = [
  "jet",
  "seminars",
  "events",
  "prestige",
  "hotels",
  "restaurants",
  "clubs",
  "chauffeur",
  "vip",
  "bespoke",
] as const;

export type ServiceKey = (typeof SERVICE_KEYS)[number];

/** Photos Unsplash (licence Unsplash). next/image les sert recadrées. */
const UNSPLASH = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1800&q=75`;

export const SERVICE_IMAGES: Record<ServiceKey, string> = {
  jet: UNSPLASH("photo-1540962351504-03099e0a754b"),
  seminars: UNSPLASH("photo-1511578314322-379afb476865"),
  events: UNSPLASH("photo-1464366400600-7168b8af9bc3"),
  prestige: UNSPLASH("photo-1554068865-24cecd4e34b8"),
  hotels: UNSPLASH("photo-1551882547-ff40c63fe5fa"),
  restaurants: UNSPLASH("photo-1414235077428-338989a2e8c0"),
  clubs: UNSPLASH("photo-1514933651103-005eec06c04b"),
  chauffeur: UNSPLASH("photo-1563720223185-11003d516935"),
  vip: UNSPLASH("photo-1556388158-158ea5ccacbd"),
  bespoke: UNSPLASH("photo-1476514525535-07fb3b4ae5f1"),
};
