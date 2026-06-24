export const siteConfig = {
  name: "Travel Business Agency",
  shortName: "TBA",
  url: "https://travelba.com",
  // Adresse e-mail qui reçoit les demandes du formulaire de contact.
  contactEmail: "contact@travelba.com",
  // Numéro WhatsApp Business au format international SANS le "+" ni espaces.
  // Remplacez par le vrai numéro. Placeholder pour l'instant.
  whatsappNumber: "33600000000",
  whatsappDisplay: "+33 6 00 00 00 00",
  phoneDisplay: "+33 1 00 00 00 00",
  social: {
    instagram: "https://instagram.com/",
    linkedin: "https://linkedin.com/",
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
