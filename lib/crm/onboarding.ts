import { CLIENT_PROFILE_NAV } from "./profile-nav";

export const PROFILE_ONBOARDING_HINTS: Record<
  (typeof CLIENT_PROFILE_NAV)[number]["label"],
  string
> = {
  Vous: "Votre identité et votre téléphone.",
  Pièces: "Passeports et documents de voyage. Une photo ou un PDF suffit.",
  Voyageurs: "Les personnes qui partent avec vous. Pas de compte à créer.",
  Facturation: "La société, lorsqu’elle règle le séjour.",
};

export const CLIENT_ONBOARDING_STEPS = [
  {
    id: "accueil",
    kicker: "Accueil",
    title: "Votre prochain séjour, en un regard",
    body: "L’accueil ouvre sur le séjour que l’agence a publié pour vous : le compte à rebours, la météo sur place, et votre prochain vol. L’encours y figure aussi. Pour nous écrire, WhatsApp reste ouvert jour et nuit, en haut à droite.",
  },
  {
    id: "carnet",
    kicker: "Réservations",
    title: "Le carnet, jour après jour",
    body: "Quand l’agence publie un séjour, il apparaît ici : le fil des jours, les vols, les hôtels, les transferts et le reste du programme. Vous ouvrez les confirmations, vous ajoutez le séjour à l’agenda, et, si une formalité est demandée, vous la suivez sur le même dossier. Tant que le séjour n’est pas publié, il reste à l’agence. Les listes À venir et Passés séparent les dossiers.",
  },
  {
    id: "transactions",
    kicker: "Transactions",
    title: "L’encours, au réel",
    body: "Ici figurent seulement les montants déjà comptabilisés. Un avoir s’affiche en positif, un reste à payer en négatif. Vous pouvez demander un relevé à l’agence. Une opération qui n’est pas encore passée n’apparaît pas.",
  },
  {
    id: "profil",
    kicker: "Mon compte",
    title: "Votre fiche, et celle de vos voyageurs",
    body: "Quatre onglets, les mêmes que dans Mon compte. Le téléphone dans Vous permet à l’agence de vous écrire. Les voyageurs n’ont pas de compte à créer.",
  },
] as const;

export function onboardingCopyBlob() {
  const hints = CLIENT_PROFILE_NAV.map(
    (section) => `${section.label} ${PROFILE_ONBOARDING_HINTS[section.label]}`
  );
  return [...CLIENT_ONBOARDING_STEPS.map((step) => `${step.title} ${step.body}`), ...hints].join(
    "\n"
  );
}
