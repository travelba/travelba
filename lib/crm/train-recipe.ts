import { partyHasChild, seatingPreference, TRAIN_STATUS_LABEL, type TrainStatus } from "./train-request";
import {
  nextTrainTurn,
  planTrainAccord,
  planTrainLegQuestion,
  trainChoiceSummary,
  trainDoneBody,
  trainSuiteBody,
  trainUnavailableBody,
  type TrainChoiceState,
  type TrainOffer,
  type TrainPlan,
} from "./train-whatsapp";

export type RecipeBubble = {
  from: "agence" | "client";
  text: string;
  buttons?: string[];
  cards?: { title: string; body: string; button: string }[];
};

export type RecipeStep = {
  statut: TrainStatus;
  statut_libelle: string;
  bot: string;
  bubbles: RecipeBubble[];
};

export type Recipe = {
  id: string;
  titre: string;
  voyageurs: string;
  placement: string;
  steps: RecipeStep[];
};

const ALLER: TrainOffer[] = [
  {
    numero: "6601",
    depart_gare: "Paris Gare de Lyon",
    arrivee_gare: "Lyon Part-Dieu",
    date: "2026-06-02",
    heure_depart: "08:12",
    heure_arrivee: "10:05",
    prix: { "2de": { non_remboursable: 45, flex: 72 }, "1re": { non_remboursable: 89, flex: 120 } },
  },
  {
    numero: "6615",
    depart_gare: "Paris Gare de Lyon",
    arrivee_gare: "Lyon Part-Dieu",
    date: "2026-06-02",
    heure_depart: "12:18",
    heure_arrivee: "14:11",
    prix: { "2de": { non_remboursable: 39, flex: 68 }, "1re": { non_remboursable: 82, flex: 110 } },
  },
  {
    numero: "6621",
    depart_gare: "Paris Gare de Lyon",
    arrivee_gare: "Lyon Part-Dieu",
    date: "2026-06-02",
    heure_depart: "14:12",
    heure_arrivee: "16:05",
    prix: { "2de": { non_remboursable: 51, flex: 80 }, "1re": { non_remboursable: 95, flex: 125 } },
  },
];

const RETOUR: TrainOffer[] = [
  {
    numero: "6630",
    depart_gare: "Lyon Part-Dieu",
    arrivee_gare: "Paris Gare de Lyon",
    date: "2026-06-03",
    heure_depart: "16:12",
    heure_arrivee: "18:05",
    prix: { "2de": { non_remboursable: 42, flex: 70 }, "1re": { non_remboursable: 86, flex: 115 } },
  },
  {
    numero: "6644",
    depart_gare: "Lyon Part-Dieu",
    arrivee_gare: "Paris Gare de Lyon",
    date: "2026-06-03",
    heure_depart: "18:42",
    heure_arrivee: "20:35",
    prix: { "2de": { non_remboursable: 48, flex: 76 }, "1re": { non_remboursable: 91, flex: 118 } },
  },
  {
    numero: "6652",
    depart_gare: "Lyon Part-Dieu",
    arrivee_gare: "Paris Gare de Lyon",
    date: "2026-06-03",
    heure_depart: "20:12",
    heure_arrivee: "22:05",
    prix: { "2de": { non_remboursable: 55, flex: 84 }, "1re": { non_remboursable: 98, flex: 130 } },
  },
];

function state(partial: Partial<TrainChoiceState> & { aller?: TrainOffer[]; retour?: TrainOffer[] }): TrainChoiceState {
  return {
    status: "propositions",
    step: "aller",
    aller: partial.aller || ALLER,
    retour: partial.retour || [],
    choix_aller: null,
    choix_retour: null,
    classe: null,
    tarif: null,
    ambigu_compte: 0,
    besoin_agence: false,
    ...partial,
  };
}

function buttonsOf(plan: TrainPlan) {
  if (plan.modele === "train_classe") return ["2de classe", "1re classe"];
  if (plan.modele === "train_tarif") return ["Non remboursable", "Flex"];
  if (plan.modele === "train_accord") return ["Je confirme", "Modifier", "Je refuse"];
  if (plan.modele === "train_modifier") return ["Le train", "La classe", "Le tarif"];
  return undefined;
}

function cardsOf(plan: TrainPlan) {
  const cards = plan.carrousel?.types["twilio/carousel"].cards;
  return cards?.map((card) => ({ title: card.title, body: card.body, button: card.actions[0]?.title || "Choisir ce train" }));
}

function agency(plan: TrainPlan): RecipeBubble {
  return { from: "agence", text: plan.corps, ...(buttonsOf(plan) ? { buttons: buttonsOf(plan) } : {}), ...(cardsOf(plan) ? { cards: cardsOf(plan) } : {}) };
}

function client(text: string): RecipeBubble {
  return { from: "client", text };
}

function step(statut: TrainStatus, bot: string, bubbles: RecipeBubble[]): RecipeStep {
  return { statut, statut_libelle: TRAIN_STATUS_LABEL[statut], bot, bubbles };
}

function open(input: { greeting: string; retour: boolean; session?: boolean }) {
  return planTrainLegQuestion({
    greeting: input.greeting,
    route: "Paris Gare de Lyon → Lyon Part-Dieu",
    date: "2026-06-02",
    leg: "aller",
    offers: ALLER,
    sessionOpen: input.session === true,
  });
}

function walk(input: {
  current: TrainChoiceState;
  greeting: string;
  voyageurs: number;
  placement: string;
  clientText?: string;
  payload?: string;
}) {
  const turn = nextTrainTurn({
    state: input.current,
    greeting: input.greeting,
    depart: "Paris Gare de Lyon",
    arrivee: "Lyon Part-Dieu",
    body: input.clientText,
    buttonPayload: input.payload,
    sessionOpen: true,
    voyageurs: input.voyageurs,
    placement: input.placement,
  });
  if (turn.action === "ignorer") throw new Error("réponse ignorée");
  return { turn, next: { ...input.current, ...turn.patch }, plan: turn.plan };
}

export function trainRecipes(): Recipe[] {
  const solo = seatingPreference({ count: 1, child: false });
  const pair = seatingPreference({ count: 2, child: false });
  const family = seatingPreference({ count: 4, child: partyHasChild([40, 38, 8, 5]) });

  const oneWay = (() => {
    let current = state({ retour: [] });
    const steps: RecipeStep[] = [
      step("propositions", "Le bot a déposé deux trains aller. Il attend.", [agency(open({ greeting: "Camille Martin", retour: false }))]),
    ];
    let moved = walk({ current, greeting: "Camille Martin", voyageurs: 1, placement: solo, clientText: "08h12 → 10h05", payload: "train:aller:0" });
    current = moved.next;
    steps.push(step(current.status as TrainStatus, "Rien. Le client choisit encore.", [client("08h12 → 10h05"), agency(moved.plan)]));
    moved = walk({ current, greeting: "Camille Martin", voyageurs: 1, placement: solo, payload: "train:classe:1re" });
    current = moved.next;
    steps.push(step(current.status as TrainStatus, "Rien.", [client("1re classe"), agency(moved.plan)]));
    moved = walk({ current, greeting: "Camille Martin", voyageurs: 1, placement: solo, payload: "train:tarif:flex" });
    current = moved.next;
    steps.push(step(current.status as TrainStatus, "Rien. L’achat attend l’accord.", [client("Flex"), agency(moved.plan)]));
    moved = walk({ current, greeting: "Camille Martin", voyageurs: 1, placement: solo, payload: "train:accord:confirme" });
    current = moved.next;
    steps.push(step(current.status as TrainStatus, "Le bot achète le 6601 en 1re Flex, carte Pliant du dossier, sans 3DS.", [client("Je confirme"), agency(moved.plan)]));
    return {
      id: "aller-simple",
      titre: "Aller simple, 1 voyageur",
      voyageurs: "Camille Martin",
      placement: solo,
      steps,
    };
  })();

  const round = buildRoundTrip({
    id: "aller-retour",
    titre: "Aller-retour, 2 voyageurs",
    greeting: "Monsieur Bernard",
    voyageurs: 2,
    placement: pair,
    who: "Hugo Bernard et Inès Bernard",
  });

  const home = buildRoundTrip({
    id: "famille",
    titre: "Famille de 4, avec enfants",
    greeting: "Madame Morel",
    voyageurs: 4,
    placement: family,
    who: "Claire Morel, Marc Morel, Léa Morel (8 ans), Tom Morel (5 ans)",
  });

  const earlier = (() => {
    const current = state({ retour: RETOUR });
    const clicked = walk({
      current,
      greeting: "Camille Martin",
      voyageurs: 1,
      placement: solo,
      clientText: "Autres horaires",
      payload: "train:horaires",
    });
    const typed = walk({
      current: clicked.next,
      greeting: "Camille Martin",
      voyageurs: 1,
      placement: solo,
      clientText: "avant 7h",
    });
    return {
      id: "autres-horaires",
      titre: "Autres horaires, plus tôt ou plus tard",
      voyageurs: "Camille Martin",
      placement: solo,
      steps: [
        step("propositions", "Le bot a déposé les trains à partir de 8h et 16h.", [agency(open({ greeting: "Camille Martin", retour: true, session: true }))]),
        step(clicked.next.status as TrainStatus, "La ligne Autres horaires est cliquée. Le CRM demande le créneau, sans recherche encore.", [
          client("Autres horaires"),
          agency(clicked.plan),
        ]),
        step(typed.next.status as TrainStatus, "Le bot relance une recherche aller avant 7h. Il ne commande pas.", [
          client("avant 7h"),
          agency(typed.plan),
        ]),
        step("recherche", "Même geste pour le retour : la ligne Autres horaires, puis « après 19h ».", []),
      ],
    };
  })();

  const change = (() => {
    let current = state({ retour: [] });
    const steps: RecipeStep[] = [];
    const first = open({ greeting: "Camille Martin", retour: false });
    steps.push(step("propositions", "Trains déposés.", [agency(first)]));
    for (const reply of [
      { text: "08h12 → 10h05", payload: "train:aller:0" },
      { text: "1re classe", payload: "train:classe:1re" },
      { text: "Flex", payload: "train:tarif:flex" },
    ]) {
      const moved = walk({ current, greeting: "Camille Martin", voyageurs: 1, placement: solo, clientText: reply.text, payload: reply.payload });
      current = moved.next;
      steps.push(step(current.status as TrainStatus, "Pas d’achat.", [client(reply.text), agency(moved.plan)]));
    }
    let moved = walk({ current, greeting: "Camille Martin", voyageurs: 1, placement: solo, payload: "train:accord:modifier" });
    current = moved.next;
    steps.push(step(current.status as TrainStatus, "Le bot n’achète pas. Le client change la classe.", [client("Modifier"), agency(moved.plan)]));
    moved = walk({ current, greeting: "Camille Martin", voyageurs: 1, placement: solo, payload: "train:modifier:classe" });
    current = moved.next;
    steps.push(step(current.status as TrainStatus, "Rien.", [client("La classe"), agency(moved.plan)]));
    moved = walk({ current, greeting: "Camille Martin", voyageurs: 1, placement: solo, payload: "train:classe:2de" });
    current = moved.next;
    steps.push(step(current.status as TrainStatus, "Rien.", [client("2de classe"), agency(moved.plan)]));
    moved = walk({ current, greeting: "Camille Martin", voyageurs: 1, placement: solo, clientText: "Non remboursable" });
    current = moved.next;
    steps.push(step(current.status as TrainStatus, "Nouveau récapitulatif. L’achat attend encore l’accord.", [client("Non remboursable"), agency(moved.plan)]));
    return {
      id: "modifier-classe",
      titre: "Le client change de classe ou de tarif au récapitulatif",
      voyageurs: "Camille Martin",
      placement: solo,
      steps,
    };
  })();

  const unclear = (() => {
    let current = state({ retour: [] });
    const steps: RecipeStep[] = [step("propositions", "Trains déposés.", [agency(open({ greeting: "Camille Martin", retour: false }))])];
    let moved = walk({ current, greeting: "Camille Martin", voyageurs: 1, placement: solo, clientText: "bof le truc" });
    current = moved.next;
    steps.push(step(current.status as TrainStatus, "Rien. La question est reposée.", [client("bof le truc"), agency(moved.plan)]));
    moved = walk({ current, greeting: "Camille Martin", voyageurs: 1, placement: solo, clientText: "heu" });
    current = moved.next;
    steps.push(step("propositions", "La main passe à l’agence. Le bot n’achète pas.", [client("heu"), agency(moved.plan)]));
    return {
      id: "texte-libre",
      titre: "Texte libre ou réponse incompréhensible",
      voyageurs: "Camille Martin",
      placement: solo,
      steps,
    };
  })();

  const later = (() => {
    let current = state({
      retour: [],
      choix_aller: 0,
      classe: "1re",
      tarif: "flex",
      step: "accord",
    });
    const quote = planTrainAccord({
      greeting: "Camille Martin",
      summary: `${trainChoiceSummary({ aller: ALLER[0], classe: "1re", tarif: "flex" })} ${solo}`,
      total: "120 €",
    });
    const steps: RecipeStep[] = [step("propositions", "Récapitulatif envoyé. Pas de réponse : la demande reste en propositions, les choix restent.", [agency(quote)])];
    let moved = walk({ current, greeting: "Camille Martin", voyageurs: 1, placement: solo, clientText: "Je réfléchis, demain" });
    current = moved.next;
    steps.push(step(current.status as TrainStatus, "Le bot n’achète pas. Les choix restent enregistrés.", [client("Je réfléchis, demain"), agency(moved.plan)]));
    moved = walk({ current, greeting: "Camille Martin", voyageurs: 1, placement: solo, clientText: "On reprend" });
    current = moved.next;
    steps.push(step(current.status as TrainStatus, "Le bot refait une simulation SNCF.", [client("On reprend"), agency(moved.plan)]));
    const raised = ALLER.map((offer, index) => (index === 0 ? { ...offer, prix: { ...offer.prix, "1re": { non_remboursable: 99, flex: 135 } } } : offer));
    const again = planTrainAccord({
      greeting: "Camille Martin",
      summary: trainChoiceSummary({ aller: raised[0], classe: "1re", tarif: "flex" }),
      total: "135 € (auparavant 120 €)",
    });
    steps.push(step("propositions", "Le bot a renvoyé le prix augmenté. Le CRM redemande l’accord. Sans « Je confirme », pas d’achat.", [agency(again)]));
    return {
      id: "relance-prix",
      titre: "Aucune réponse, puis relance avec un prix plus élevé",
      voyageurs: "Camille Martin",
      placement: solo,
      steps,
    };
  })();

  const gone = {
    id: "complet",
    titre: "Train complet ou plus disponible au moment d’acheter",
    voyageurs: "Camille Martin",
    placement: solo,
    steps: [
      step("choix", "Le bot tente l’achat et voit que le 6601 est complet.", [agency({ modele: "session", corps: trainDoneBody({ greeting: "Camille Martin", summary: "Aller train 6601." }) })]),
      step("recherche", "Le bot prévient le CRM. Le CRM écrit au client et redemande une recherche. Rien n’est débité.", [
        agency({ modele: "session", corps: trainUnavailableBody("6601") }),
      ]),
    ],
  };

  const refuse = (() => {
    const current = state({ retour: [], choix_aller: 0, classe: "1re", tarif: "flex", step: "accord" });
    const moved = walk({ current, greeting: "Camille Martin", voyageurs: 1, placement: solo, payload: "train:accord:refuse" });
    return {
      id: "refus",
      titre: "Le client refuse au récapitulatif",
      voyageurs: "Camille Martin",
      placement: solo,
      steps: [
        step("propositions", "Récapitulatif en attente d’accord.", [
          agency(planTrainAccord({ greeting: "Camille Martin", summary: trainChoiceSummary({ aller: ALLER[0], classe: "1re", tarif: "flex" }), total: "120 €" })),
        ]),
        step(moved.next.status as TrainStatus, "Le bot n’achète pas. La demande est annulée.", [client("Je refuse"), agency(moved.plan)]),
      ],
    };
  })();

  const billet = {
    id: "billet-depart",
    titre: "Envoi des billets le jour du départ",
    voyageurs: "Camille Martin",
    placement: solo,
    steps: [
      step("commande", "Le bot a déjà acheté. Le cron du matin envoie le PDF, sans changer la visibilité de la carte.", [
        agency({
          modele: "train_billet",
          corps: [
            "Bonjour Camille,",
            "",
            "Votre billet de train TGV 6601 est joint à ce message. Trajet Paris Gare de Lyon → Lyon Part-Dieu, départ le mardi 2 juin à 08h12. Emplacement : voiture 12, place 41.",
            "",
            "La Conciergerie Travel BA",
          ].join("\n"),
        }),
      ]),
    ],
  };

  const after = {
    id: "apres-achat",
    titre: "Échange ou annulation après achat",
    voyageurs: "Camille Martin",
    placement: solo,
    steps: [
      step("commande", "Le client écrit après l’émission. Le bot reçoit la demande d’échange. Les billets ne sont pas modifiés seuls.", [
        client("Je voudrais échanger mon billet"),
        agency({ modele: "session", corps: trainSuiteBody("echange") }),
      ]),
      step("commande", "Même geste pour une annulation. Le bot vérifie les conditions. Le CRM n’annule pas le billet SNCF.", [
        client("Je souhaite annuler"),
        agency({ modele: "session", corps: trainSuiteBody("annulation") }),
      ]),
    ],
  };

  return [oneWay, round, home, earlier, change, unclear, later, gone, refuse, billet, after];
}

function buildRoundTrip(input: { id: string; titre: string; greeting: string; voyageurs: number; placement: string; who: string }): Recipe {
  let current = state({ retour: RETOUR });
  const steps: RecipeStep[] = [
    step("propositions", `Le bot a déposé l’aller et le retour pour ${input.who}. Placement transmis : ${input.placement}`, [
      agency(open({ greeting: input.greeting, retour: true, session: true })),
    ]),
  ];
  const replies = [
    { text: "08h12 → 10h05", payload: "train:aller:0" },
    { text: "16h12 → 18h05", payload: "train:retour:0" },
    { text: "2de classe", payload: "train:classe:2de" },
    { text: "Non remboursable", payload: "train:tarif:non_remboursable" },
    { text: "Je confirme", payload: "train:accord:confirme" },
  ];
  for (const reply of replies) {
    const moved = walk({
      current,
      greeting: input.greeting,
      voyageurs: input.voyageurs,
      placement: input.placement,
      clientText: reply.text,
      payload: reply.payload,
    });
    current = moved.next;
    const bot =
      current.status === "choix"
        ? "Le bot achète les deux trains, carte Pliant du dossier, sans 3DS, places selon la préférence."
        : "Pas d’achat.";
    steps.push(step(current.status as TrainStatus, bot, [client(reply.text), agency(moved.plan)]));
  }
  return { id: input.id, titre: input.titre, voyageurs: input.who, placement: input.placement, steps };
}

export function trainRecipeMarkdown(recipes = trainRecipes()) {
  const lines = [
    "# Recette — billets de train WhatsApp",
    "",
    "Parcours fictif. Aucun envoi réel. Les textes sont ceux du CRM, variables remplies.",
    "",
    "Ordre : trains (aller, puis retour), classe, tarif, récapitulatif avec le prix, accord. Rien n’est acheté avant « Je confirme ».",
    "Horaires proposés par défaut : aller à partir de 8h, retour à partir de 16h. Dates déduites de l’hôtel (lundi → mardi : aller lundi, retour mardi), modifiables.",
    "Paiement : `creer_carte_pliant` sur le dossier, `trois_ds` faux. Le numéro n’est pas dans ces messages.",
    "Le train se choisit en faisant défiler un carrousel : une carte par train (heure de départ → arrivée, gares, date, durée, numéro, bouton Choisir ce train). La dernière carte est Autres horaires. L’aller part d’abord, le retour ensuite. Un numéro tapé ne choisit pas le train. Le texte libre reste un secours.",
    "Au moins 3 trains par sens, 9 au plus (10 cartes avec Autres horaires). L’envoi utilise le content SID `TWILIO_CONTENT_TRAIN_CARROUSEL_N`, puis les modèles des étapes et `TWILIO_CONTENT_TRAIN_BILLET` le matin.",
    "",
    "## Lancer la demande dans le CRM",
    "",
    "Même bouton que la fiche dossier, et un point d’insertion entre les cartes (avant ou après, comme un transfert). Aperçu local, données fictives, sans écriture en base : `/apercu/demande-train`.",
    "",
    "![Demande avant l’hôtel](recette-billets-train/crm-avant.png)",
    "",
    "![Demande après l’hôtel](recette-billets-train/crm-apres.png)",
    "",
    "![Carte Demande de train dans le fil](recette-billets-train/crm-fil.png)",
    "",
    "![La demande devenue le train](recette-billets-train/crm-billet.png)",
    "",
    "![Fiche avec le bouton Demande de train](recette-billets-train/crm-bouton.png)",
    "",
    "![Formulaire prérempli](recette-billets-train/crm-formulaire.png)",
    "",
    "![Ville de départ inconnue](recette-billets-train/crm-depart-inconnu.png)",
    "",
    "![Demande créée, statut Nouvelle](recette-billets-train/crm-suivi.png)",
    "",
    "## Modèles",
    "",
    "| Nom | Rôle |",
    "| --- | --- |",
    "| `train_carrousel_3` à `train_carrousel_9` | Carrousel, une carte par train, plus Autres horaires |",
    "| `train_classe` | Boutons 2de classe / 1re classe |",
    "| `train_tarif` | Boutons Non remboursable / Flex |",
    "| `train_accord` | Récapitulatif, Je confirme / Modifier / Je refuse |",
    "| `train_modifier` | Le train / La classe / Le tarif |",
    "| `train_billet` | PDF le matin du départ |",
    "",
    "Une réponse incompréhensible repose la question une fois, puis la main passe à l’agence.",
    "« Autres horaires », « plus tôt » ou « plus tard » renvoie la contrainte au bot SNCF.",
    "Un délai (« je réfléchis ») garde les choix. À la relance, le bot resimule et le client confirme le nouveau prix.",
    "",
  ];
  for (const recipe of recipes) {
    lines.push(`## ${recipe.titre}`, "", `Voyageurs : ${recipe.voyageurs}`, "", `Placement : ${recipe.placement}`, "");
    recipe.steps.forEach((row, index) => {
      lines.push(`### ${index + 1}. ${row.statut_libelle}`, "", `Bot SNCF : ${row.bot}`, "");
      if (!row.bubbles.length) return;
      for (const bubble of row.bubbles) {
        lines.push(`**${bubble.from === "agence" ? "Agence" : "Client"}**`, "", bubble.text, "");
        if (bubble.buttons?.length) lines.push(`Boutons : ${bubble.buttons.join(" · ")}`, "");
        if (bubble.cards?.length) {
          lines.push("Carrousel :", "");
          for (const card of bubble.cards) lines.push(`- **${card.title}** — ${card.body} — bouton ${card.button}`);
          lines.push("");
        }
      }
    });
  }
  return lines.join("\n");
}
