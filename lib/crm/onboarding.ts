import { CLIENT_PROFILE_NAV } from "./profile-nav";

export const PROFILE_ONBOARDING_HINTS: Record<
  (typeof CLIENT_PROFILE_NAV)[number]["label"],
  string
> = {
  Vous: "Votre identité et votre téléphone.",
  Pièces: "Passeports et documents de voyage.",
  Voyageurs: "Les personnes qui partent avec vous.",
  Facturation: "La société, lorsqu’elle règle le séjour.",
};

export const CLIENT_ONBOARDING_STEPS = [
  {
    id: "carnet",
    kicker: "Réservations",
    title: "Le carnet publié",
    body: "L’agence publie votre séjour lorsqu’il est prêt. Vous le retrouvez dans Réservations : le fil des jours, les vols, les hôtels. Tant que le dossier n’est pas publié, il reste à l’agence.",
  },
  {
    id: "transactions",
    kicker: "Transactions",
    title: "Ce qui est comptabilisé",
    body: "Transactions n’affiche que les écritures déjà passées au grand livre. L’encours suit ces montants. Une opération qui n’est pas encore comptabilisée n’apparaît pas.",
  },
  {
    id: "profil",
    kicker: "Mon compte",
    title: "Votre fiche",
    body: "Mon compte réunit quatre onglets.",
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
