export const CLIENT_ONBOARDING_STEPS = [
  {
    id: "passeport",
    kicker: "Pièces",
    title: "Votre passeport, au coffre",
    body: "Une photo ou un PDF. L’agence lit le document et le range. Plusieurs passeports peuvent tenir sur le même fichier.",
  },
  {
    id: "carnet",
    kicker: "Réservations",
    title: "L’itinéraire du séjour",
    body: "Quand l’agence publie le voyage, le fil des jours s’ouvre : vols, hôtels, le détail de chaque étape.",
  },
  {
    id: "services",
    kicker: "Sur le séjour",
    title: "Chauffeur et VIP Airport",
    body: "Depuis l’itinéraire, lorsqu’un vol est prévu : un transfert, ou un accueil VIP Airport — sortie, enregistrement, sûreté, porte ou salon.",
  },
  {
    id: "depenses",
    kicker: "Transactions",
    title: "Vos dépenses à l’agence",
    body: "Le grand livre ne montre que ce qui est déjà comptabilisé. L’encours suit ces écritures.",
  },
  {
    id: "formalites",
    kicker: "Formalités",
    title: "ESTA, ETA, ETA-IL",
    body: "États-Unis, Royaume-Uni, Israël. L’agence s’en charge : vous suivez la demande sur le séjour.",
  },
] as const;

export function onboardingCopyBlob() {
  return CLIENT_ONBOARDING_STEPS.map((step) => `${step.kicker} ${step.title} ${step.body}`).join("\n");
}
