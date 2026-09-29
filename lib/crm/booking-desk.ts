/** Présentations du dossier réservation, côté agence. */

export const BOOKING_VUE_KEY = "travelba-booking-vue";

export const BOOKING_VUES = [
  {
    id: "bureau",
    label: "Bureau",
    line: "Une étape à la fois. Pour traiter le dossier sans se perdre.",
  },
  {
    id: "histoire",
    label: "Histoire",
    line: "Le voyage se lit de haut en bas, du départ à l’espace client.",
  },
  {
    id: "tableau",
    label: "Tableau",
    line: "Toutes les cases d’un coup d’œil. On ouvre celle qui cloche.",
  },
] as const;

export type BookingVue = (typeof BOOKING_VUES)[number]["id"];

export const DESK_SECTIONS = [
  "aujourd",
  "programme",
  "voyageurs",
  "formalites",
  "hotel",
  "argent",
  "papiers",
  "client",
  "dossier",
] as const;

export type DeskSectionId = (typeof DESK_SECTIONS)[number];

export const BUREAU_ORDER: DeskSectionId[] = [
  "aujourd",
  "programme",
  "voyageurs",
  "formalites",
  "hotel",
  "argent",
  "papiers",
  "client",
  "dossier",
];

export const HISTOIRE_ORDER: DeskSectionId[] = [
  "dossier",
  "programme",
  "voyageurs",
  "formalites",
  "hotel",
  "papiers",
  "argent",
  "client",
];

export const TABLEAU_ORDER: DeskSectionId[] = [
  "programme",
  "voyageurs",
  "formalites",
  "hotel",
  "argent",
  "papiers",
  "client",
  "dossier",
];

export const DESK_COPY: Record<DeskSectionId, { label: string; title: string; lead: string }> = {
  aujourd: {
    label: "Aujourd’hui",
    title: "Par où commencer",
    lead: "Ce qui demande une action. Le reste peut attendre.",
  },
  programme: {
    label: "Programme",
    title: "Le programme du séjour",
    lead: "Vols, trains, hôtels, transferts. Déposez un document, relisez l’étape, puis enregistrez.",
  },
  voyageurs: {
    label: "Voyageurs",
    title: "Qui part",
    lead: "Ajoutez chaque personne. Le passeport se reprend sur la fiche du client.",
  },
  formalites: {
    label: "Formalités",
    title: "Entrée dans le pays",
    lead: "Autorisation ou visa, seulement quand le vol le demande.",
  },
  hotel: {
    label: "Hôtel",
    title: "Arrivée à l’hôtel",
    lead: "Heure d’arrivée et messages à envoyer à l’établissement.",
  },
  argent: {
    label: "Règlement",
    title: "Ce qui est facturé",
    lead: "Le montant du séjour, la devise, qui paie, et les frais en plus.",
  },
  papiers: {
    label: "Papiers",
    title: "Documents du dossier",
    lead: "Billets, vouchers, devis. Le client les voit après la publication.",
  },
  client: {
    label: "Espace client",
    title: "Ce que voit le client",
    lead: "Le message, le lien à partager, puis le carnet. Rien n’est visible tant que vous ne publiez pas.",
  },
  dossier: {
    label: "Dossier",
    title: "Le dossier",
    lead: "Titre, dates, client, statut. Enregistrer garde ces informations. Cela ne montre pas le voyage.",
  },
};

const VUE_ORDER: Record<BookingVue, DeskSectionId[]> = {
  bureau: BUREAU_ORDER,
  histoire: HISTOIRE_ORDER,
  tableau: TABLEAU_ORDER,
};

export type DeskFacts = {
  published: boolean;
  pendingCards: number;
  needsReview: boolean;
  travelers: number;
  missingPassport: boolean;
  programCards: number;
  documents: number;
  hotelAttention: number;
  hasFormalities: boolean;
  formalitiesOpen: boolean;
  amountLabel: string;
};

export type DeskStep = {
  section: DeskSectionId;
  tone: "wait" | "ready";
  title: string;
  detail: string;
};

export function parseBookingVue(value: string | null | undefined): BookingVue | null {
  if (value === "bureau" || value === "histoire" || value === "tableau") return value;
  return null;
}

export function deskOrder(vue: BookingVue, available: readonly DeskSectionId[]) {
  return VUE_ORDER[vue].filter((id) => available.includes(id));
}

export function deskOpening(vue: BookingVue, facts: DeskFacts, available: DeskSectionId[]): DeskSectionId {
  const order = deskOrder(vue, available);
  if (vue === "bureau" && order.includes("aujourd")) return "aujourd";
  const waiting = deskNextSteps(facts).find((step) => step.tone === "wait" && order.includes(step.section));
  if (waiting) return waiting.section;
  return order[0] || "programme";
}

function persons(count: number) {
  return count > 1 ? `${count} personnes` : count === 1 ? "1 personne" : "Personne";
}

function steps(count: number) {
  return count > 1 ? `${count} étapes` : count === 1 ? "1 étape" : "Vide";
}

function files(count: number) {
  return count > 1 ? `${count} fichiers` : count === 1 ? "1 fichier" : "Aucun fichier";
}

export function sectionHint(id: DeskSectionId, facts: DeskFacts) {
  switch (id) {
    case "aujourd": {
      const waiting = deskNextSteps(facts).filter((step) => step.tone === "wait").length;
      return waiting > 1 ? `${waiting} à faire` : waiting === 1 ? "1 à faire" : "Calme";
    }
    case "programme": {
      const base = steps(facts.programCards);
      if (facts.needsReview) return `${base} · à relire`;
      if (facts.pendingCards > 0) return `${base} · à montrer`;
      return base;
    }
    case "voyageurs":
      return facts.missingPassport && facts.travelers > 0 ? `${persons(facts.travelers)} · passeport` : persons(facts.travelers);
    case "formalites":
      if (facts.formalitiesOpen) return "À lancer";
      return facts.hasFormalities ? "Suivi" : "Rien à faire";
    case "hotel":
      if (facts.hotelAttention > 1) return `${facts.hotelAttention} à traiter`;
      if (facts.hotelAttention === 1) return "1 à traiter";
      return "Rien à envoyer";
    case "argent":
      return facts.amountLabel;
    case "papiers":
      return files(facts.documents);
    case "client":
      if (!facts.published) return "Masqué";
      return facts.pendingCards > 0 ? "Mises à jour" : "Visible";
    case "dossier":
      return "Titre et dates";
    default:
      return "";
  }
}

export function sectionNeedsAttention(id: DeskSectionId, facts: DeskFacts) {
  switch (id) {
    case "aujourd":
      return deskNextSteps(facts).some((step) => step.tone === "wait");
    case "programme":
      return facts.programCards === 0 || facts.needsReview || facts.pendingCards > 0;
    case "voyageurs":
      return facts.travelers === 0 || facts.missingPassport;
    case "formalites":
      return facts.formalitiesOpen;
    case "hotel":
      return facts.hotelAttention > 0;
    case "client":
      return !facts.published || facts.pendingCards > 0;
    default:
      return false;
  }
}

export function deskNextSteps(facts: DeskFacts): DeskStep[] {
  const wait: DeskStep[] = [];
  const ready: DeskStep[] = [];

  if (!facts.published) {
    wait.push({
      section: "client",
      tone: "wait",
      title: "Le client ne voit pas encore ce voyage",
      detail: "Relisez le programme, puis publiez. Enregistrer ne suffit pas.",
    });
  } else if (facts.pendingCards > 0) {
    wait.push({
      section: "programme",
      tone: "wait",
      title:
        facts.pendingCards > 1
          ? `${facts.pendingCards} nouvelles étapes ne sont pas encore montrées`
          : "Une nouvelle étape n’est pas encore montrée",
      detail: "Publiez les mises à jour quand la relecture est juste.",
    });
  } else {
    ready.push({
      section: "client",
      tone: "ready",
      title: "Le client voit ce voyage",
      detail: "L’espace est à jour.",
    });
  }

  if (facts.needsReview) {
    wait.push({
      section: "programme",
      tone: "wait",
      title: "Une étape est à relire",
      detail: "Le texte lu sur le document est douteux. Ouvrez l’étape et corrigez.",
    });
  }

  if (facts.programCards === 0) {
    wait.push({
      section: "programme",
      tone: "wait",
      title: "Le programme est vide",
      detail: "Déposez un billet, un voucher ou une confirmation.",
    });
  }

  if (facts.travelers === 0) {
    wait.push({
      section: "voyageurs",
      tone: "wait",
      title: "Personne n’est inscrite sur ce voyage",
      detail: "Ajoutez le client, puis les personnes qui l’accompagnent.",
    });
  } else if (facts.missingPassport) {
    wait.push({
      section: "voyageurs",
      tone: "wait",
      title: "Un passeport manque",
      detail: "La pièce n’est pas au coffre de la fiche, ou elle n’est pas reliée à ce voyageur.",
    });
  }

  if (facts.hotelAttention > 0) {
    wait.push({
      section: "hotel",
      tone: "wait",
      title: facts.hotelAttention > 1 ? `${facts.hotelAttention} hôtels à traiter` : "Un hôtel à traiter",
      detail: "Prévenez l’établissement : arrivée, demande, ou relance.",
    });
  }

  if (facts.formalitiesOpen) {
    wait.push({
      section: "formalites",
      tone: "wait",
      title: "Une formalité d’entrée est à lancer",
      detail: "Le vol demande une autorisation ou un visa avant le départ.",
    });
  }

  if (facts.travelers > 0 && !facts.missingPassport) {
    ready.push({
      section: "voyageurs",
      tone: "ready",
      title: persons(facts.travelers),
      detail: "Les personnes du dossier sont posées.",
    });
  }

  if (!wait.length && !ready.length) {
    ready.push({
      section: "programme",
      tone: "ready",
      title: "Rien n’attend",
      detail: "Le dossier est calme. Ouvrez le programme pour vérifier le séjour.",
    });
  }

  return [...wait, ...ready.slice(0, wait.length ? 1 : 3)];
}
