import { CLIENT_PROFILE_NAV } from "./profile-nav";
import { stayAtPhrase } from "./stay-phrase";

/** Séjour inventé, le même univers que l’aperçu local. Aucune ville de départ. */
export const ONBOARDING_FIXTURE = {
  givenName: "Camille",
  fullName: "Camille Morel",
  initials: "CM",
  email: "camille.morel@exemple.invalid",
  phone: "06 00 00 00 00",
  companion: "Inès Morel",
  companionRole: "Enfant",
  company: "Atelier Exemple",
  reference: "TB-EXEMPLE",
  hotel: "Maison Horizon",
  stayCities: ["New York"] as const,
  start: "2026-11-12",
  end: "2026-11-14",
  countdown: "J-23",
  weather: "18°",
  weatherLabel: "Doux",
  flight: "Exemple Air",
  flightNumber: "EX 100",
  flightTime: "11h40",
  balance: -1240,
  stayAmount: 4800,
  receivedAmount: 3560,
  passportUntil: "1 juin 2031",
} as const;

export const ONBOARDING_SKIP_LABEL = "Passer";
export const ONBOARDING_RESTART_LABEL = "Recommencer";
export const ONBOARDING_BACK_LABEL = "Retour";
export const ONBOARDING_NEXT_LABEL = "Continuer";
export const ONBOARDING_ENTER_LABEL = "Accéder à mon espace";
export const ONBOARDING_REPLAY_LABEL = "Revoir la visite";
export const ONBOARDING_FICTION_NOTE =
  "Exemple fictif : séjour et voyageurs inventés pour la démonstration.";

export function onboardingStayPhrase() {
  return stayAtPhrase([...ONBOARDING_FIXTURE.stayCities]);
}

export const PROFILE_ONBOARDING_HINTS: Record<
  (typeof CLIENT_PROFILE_NAV)[number]["label"],
  string
> = {
  Vous: "Votre identité et votre téléphone, pour que l’agence vous joigne.",
  Pièces: "Passeports et documents de voyage, rangés au coffre.",
  Voyageurs: "Les personnes qui partent avec vous.",
  Facturation: "La société, lorsqu’elle règle le séjour.",
};

const stay = onboardingStayPhrase();

export const CLIENT_ONBOARDING_STEPS = [
  {
    id: "accueil",
    tab: "Accueil",
    kicker: "Accueil",
    title: "Le prochain voyage, en tête",
    lead: "Dès que vous ouvrez votre espace, le séjour publié par l’agence vous accueille. L’équipe reste joignable sur WhatsApp, depuis chaque écran.",
    captions: [
      {
        title: "Compte à rebours",
        body: `Les jours qui restent avant l’envol, et la météo ${stay}.`,
      },
      {
        title: "Le séjour publié",
        body: "L’agence publie le carnet lorsqu’il est prêt. Vous y trouvez la dernière version.",
      },
      {
        title: "L’encours",
        body: "S’il reste un montant à régler, il est rappelé dès l’accueil.",
      },
    ],
  },
  {
    id: "carnet",
    tab: "Réservations",
    kicker: "Réservations",
    title: "Chaque étape, dans l’ordre",
    lead: `Vol, hôtel et transfert se suivent dans le carnet du séjour ${stay}, avec les pièces au bon endroit.`,
    captions: [
      {
        title: "L’itinéraire",
        body: `Les jours du séjour ${stay}, de l’arrivée jusqu’au retour.`,
      },
      {
        title: "Les pièces",
        body: "Billets et confirmations d’hôtel se consultent depuis l’étape concernée.",
      },
      {
        title: "Votre agenda",
        body: "Chaque étape s’ajoute au calendrier du téléphone.",
      },
    ],
  },
  {
    id: "transactions",
    tab: "Transactions",
    kicker: "Transactions",
    title: "Ce qui est comptabilisé",
    lead: "Transactions n’affiche que les écritures déjà passées au grand livre. L’encours suit ces montants.",
    captions: [
      {
        title: "Le solde",
        body: "Un montant négatif est un reste à régler. Un montant positif est un avoir.",
      },
      {
        title: "Les mouvements",
        body: `Le séjour ${stay} et les règlements reçus, ligne par ligne.`,
      },
      {
        title: "Le relevé",
        body: "Vous pouvez demander un relevé de ces écritures, quand vous le souhaitez.",
      },
    ],
  },
  {
    id: "profil",
    tab: "Mon compte",
    kicker: "Mon compte",
    title: "Votre fiche",
    lead: "Mon compte réunit quatre onglets. Chacun dit à l’agence ce qu’il faut pour préparer le séjour.",
    captions: CLIENT_PROFILE_NAV.map((section) => ({
      title: section.label,
      body: PROFILE_ONBOARDING_HINTS[section.label],
    })),
  },
] as const;

export type OnboardingStepId = (typeof CLIENT_ONBOARDING_STEPS)[number]["id"];

/** Libellés visibles dans les captures, en plus des légendes. */
export const ONBOARDING_FRAME = {
  brand: "Travel Business Agency",
  member: "Espace membre",
  hello: "Bonjour",
  encours: "Encours",
  openStay: "Accéder à ma réservation",
  nextFlight: "Prochain vol",
  hour: "Heure",
  towardStay: `Vers ${ONBOARDING_FIXTURE.stayCities[0]}`,
  calendar: "Ajouter au calendrier",
  itinerary: "Itinéraire",
  hotel: "Hôtel",
  transfer: "Transfert",
  transferTitle: "Vers l’hôtel",
  transferMeta: "Le jour de l’arrivée",
  flightKind: "Vol",
  piece: "Confirmation d’hôtel",
  beforeFlight: "avant l’envol",
  ledger: "Grand livre",
  movements: "Mouvements",
  stayLine: `Séjour ${stay}`,
  paymentLine: "Règlement reçu",
  posted: "Posté",
  received: "Encaissé",
  reference: "Référence",
  amount: "Montant",
  priceHidden: "Prix à la publication",
  paidBy: `Réglé par ${ONBOARDING_FIXTURE.company}`,
  passport: "Passeport",
  passportUntil: `Valable jusqu’au ${ONBOARDING_FIXTURE.passportUntil}`,
  phoneLabel: "Téléphone",
  companyKind: "Société",
  stayWhen: "12 novembre 2026",
  receivedWhen: "8 novembre 2026",
} as const;

export function onboardingCopyBlob() {
  const steps = CLIENT_ONBOARDING_STEPS.flatMap((step) => [
    step.kicker,
    step.title,
    step.lead,
    ...step.captions.flatMap((caption) => [caption.title, caption.body]),
  ]);
  return [
    ...steps,
    ...Object.values(ONBOARDING_FRAME),
    ONBOARDING_SKIP_LABEL,
    ONBOARDING_RESTART_LABEL,
    ONBOARDING_BACK_LABEL,
    ONBOARDING_NEXT_LABEL,
    ONBOARDING_ENTER_LABEL,
    ONBOARDING_REPLAY_LABEL,
    ONBOARDING_FICTION_NOTE,
    ONBOARDING_FIXTURE.fullName,
    ONBOARDING_FIXTURE.companion,
    ONBOARDING_FIXTURE.hotel,
    ONBOARDING_FIXTURE.reference,
  ].join("\n");
}
