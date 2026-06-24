export const siteConfig = {
  name: "Travel Business Agency",
  shortName: "TBA",
  url: "https://travelba.fr",
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
    // À compléter : immatriculation Atout France (IM0xxxxxxxx) et garantie
    // financière, obligatoires pour l'exercice de l'activité de voyagiste.
    atoutFrance: "",
  },
} as const;

export const SERVICE_KEYS = [
  "jet",
  "seminars",
  "events",
  "hotels",
  "chauffeur",
  "vip",
  "bespoke",
] as const;

export type ServiceKey = (typeof SERVICE_KEYS)[number];
