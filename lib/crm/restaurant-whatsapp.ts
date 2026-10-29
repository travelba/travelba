import { fold } from "./text";
import { formatEveningFr, parseChoice, restaurantDefaultClock, type RestaurantChoice } from "./restaurants";

/** Pré-message, puis un carrousel par restaurant. Vides tant que Meta n’a pas approuvé. */
export const RESTAURANT_INTRO_ENV = "TWILIO_CONTENT_RESTAURANT_INTRO";
export const RESTAURANT_CAROUSEL_ENV = "TWILIO_CONTENT_RESTAURANT_PROPOSITION";
export const RESTAURANT_CAROUSEL_MENU_ENV = "TWILIO_CONTENT_RESTAURANT_PROPOSITION_CARTE";

export const RESTAURANT_INTRO_NAME = "restaurant_selection";
export const RESTAURANT_CAROUSEL_NAME = "restaurant_proposition";
export const RESTAURANT_CAROUSEL_MENU_NAME = "restaurant_proposition_carte";

export const RESTAURANT_SIGNATURE = "La Conciergerie Travel BA";

/** Domaine fixe : Meta n’accepte une variable de média qu’après le domaine. */
export const RESTAURANT_MEDIA_PREFIX = "https://travelba.fr/api/restaurants/media/";
export const RESTAURANT_PLACE_PREFIX = "https://travelba.fr/api/r/";

export const RESTAURANT_SAMPLE_TABLE = "22222222-2222-4222-8222-222222222222";
export const RESTAURANT_SAMPLE_PLACE = "11111111-1111-4111-8111-111111111111";

const SALLE_TITLE = "La salle";
const PLAT_TITLE = "Le plat signature";
const CARTE_TITLE = "La carte";

/**
 * Corps de la carte salle. Le lien tient à la place du bouton URL :
 * un carrousel n’a que deux boutons, déjà pris par J’accepte et Je refuse.
 */
export const SALLE_CARD_BODY = "En salle, {{4}}. Lien https://travelba.fr/api/r/{{6}} ici.";
export const PLAT_CARD_BODY = "Comptez {{8}} par personne, pour deux.";
export const CARTE_CARD_BODY = "La carte du restaurant, à parcourir avant de vous installer.";

const SALLE_FIXED =
  "En salle, . Lien https://travelba.fr/api/r/ ici.".length + RESTAURANT_SAMPLE_PLACE.length + SALLE_TITLE.length;
export const SALLE_PITCH_MAX = 160 - SALLE_FIXED;
const PLAT_FIXED = "Comptez  par personne, pour deux.".length + PLAT_TITLE.length;
export const PLAT_PRICE_MAX = 160 - PLAT_FIXED;

export type RestaurantTemplates = { intro: boolean; carousel: boolean };

export function restaurantTemplateFlags(ready: boolean | RestaurantTemplates): RestaurantTemplates {
  if (typeof ready === "boolean") return { intro: ready, carousel: ready };
  return ready;
}

/** Monsieur ou Madame quand le sexe est connu. Sinon le prénom, sans inventer un titre. */
export function restaurantGreeting(input: {
  sex?: string | null;
  lastName?: string | null;
  firstName?: string | null;
}) {
  const last = plain(input.lastName || "", 80);
  const first = plain(input.firstName || "", 80);
  if (input.sex === "M" && last) return `Monsieur ${last}`;
  if (input.sex === "F" && last) return `Madame ${last}`;
  return first || last || "cher client";
}

function plain(value: string, max: number) {
  return value
    .replace(/[\r\n\u0000-\u001f]+/g, " ")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function restaurantIntroBody() {
  return [
    "Bonsoir {{1}}, nous vous avons préparé une sélection de tables pour votre soirée du {{2}}. Toutes sont déjà réservées à votre nom. Nous vous remercions de bien vouloir accepter celle de votre choix et de refuser les autres ; sans réponse de votre part, elles seront automatiquement annulées à 18 h.",
    "",
    RESTAURANT_SIGNATURE,
  ].join("\n");
}

/** L’heure de 18 h est dans le pré-message. Le carrousel ne la répète pas. */
export function restaurantCarouselBody() {
  return [
    "Bonsoir {{1}}, pour votre soirée, nous nous sommes permis de vous réserver une table pour deux chez {{2}}, à {{3}}. La fiche de la maison suit.",
    "",
    RESTAURANT_SIGNATURE,
  ].join("\n");
}

function replyActions() {
  return [
    { type: "QUICK_REPLY" as const, title: "J'accepte", id: `accepte:{{7}}` },
    { type: "QUICK_REPLY" as const, title: "Je refuse", id: `refuse:{{7}}` },
  ];
}

function carouselCards(withMenu: boolean) {
  const cards = [
    {
      title: SALLE_TITLE,
      body: SALLE_CARD_BODY,
      media: `${RESTAURANT_MEDIA_PREFIX}{{5}}`,
      actions: replyActions(),
    },
    {
      title: PLAT_TITLE,
      body: PLAT_CARD_BODY,
      media: `${RESTAURANT_MEDIA_PREFIX}{{9}}`,
      actions: replyActions(),
    },
  ];
  if (withMenu) {
    cards.push({
      title: CARTE_TITLE,
      body: CARTE_CARD_BODY,
      media: `${RESTAURANT_MEDIA_PREFIX}{{10}}`,
      actions: replyActions(),
    });
  }
  return cards;
}

function carouselVariables(withMenu: boolean) {
  const variables: Record<string, string> = {
    "1": "Monsieur Dupont",
    "2": "Ostuni",
    "3": restaurantDefaultClock(),
    "4": "Une salle calme, lumière basse.",
    "5": "exemple.salle",
    "6": RESTAURANT_SAMPLE_PLACE,
    "7": RESTAURANT_SAMPLE_TABLE,
    "8": "90 à 140 €",
    "9": "exemple.plat",
  };
  if (withMenu) variables["10"] = "exemple.carte";
  return variables;
}

export function restaurantIntroContentCreateBody() {
  return {
    friendly_name: RESTAURANT_INTRO_NAME,
    language: "fr",
    variables: {
      "1": "Monsieur Dupont",
      "2": "mardi 2 juin",
    },
    types: {
      "twilio/text": {
        body: restaurantIntroBody(),
      },
    },
  };
}

export function restaurantCarouselContentCreateBody(withMenu = false) {
  return {
    friendly_name: withMenu ? RESTAURANT_CAROUSEL_MENU_NAME : RESTAURANT_CAROUSEL_NAME,
    language: "fr",
    variables: carouselVariables(withMenu),
    types: {
      "twilio/carousel": {
        body: restaurantCarouselBody(),
        cards: carouselCards(withMenu),
      },
    },
  };
}

/**
 * Texte à coller pour Meta, et raison de l’adaptation des boutons.
 * Aucun secret.
 */
export function restaurantTemplateSubmission() {
  const intro = restaurantIntroContentCreateBody();
  const cards = restaurantCarouselContentCreateBody(false);
  const menu = restaurantCarouselContentCreateBody(true);
  return [
    "Trois modèles Utility, français, sans emoji. Le CRM crée la proposition et enregistre le clic. WhatsApp ne fait qu’afficher.",
    "",
    "Ordre d’envoi, à 16 h heure locale : le pré-message, puis un carrousel par restaurant (deux le même soir).",
    "",
    `1. ${RESTAURANT_INTRO_NAME}`,
    `Variable : ${RESTAURANT_INTRO_ENV}`,
    "Type : twilio/text",
    "Catégorie : Utility",
    "",
    intro.types["twilio/text"].body,
    "",
    "{{1}} Monsieur Dupont (Monsieur, Madame, ou le prénom si le titre n’est pas connu)",
    "{{2}} mardi 2 juin",
    "",
    `2. ${RESTAURANT_CAROUSEL_NAME} — salle et plat, sans photo de carte`,
    `Variable : ${RESTAURANT_CAROUSEL_ENV}`,
    "Type : twilio/carousel",
    "",
    cards.types["twilio/carousel"].body,
    "",
    `3. ${menu.friendly_name} — les deux mêmes cartes, plus la carte du restaurant`,
    `Variable : ${RESTAURANT_CAROUSEL_MENU_ENV}`,
    "Sans photo de carte, le modèle à deux cartes part. Sans ce SID non plus, la fiche reste en file.",
    "",
    "Adaptation Meta. Un carrousel a deux boutons au plus, et chaque carte doit porter les mêmes types dans le même ordre. « Découvrir l’adresse », « J’accepte » et « Je refuse » feraient trois boutons. Les deux boutons sont donc « J’accepte » (id accepte:{{7}}) et « Je refuse » (id refuse:{{7}}) sur chaque carte. {{7}} est l’identifiant de la table dans le CRM. Le lien du site ou de la page Google est dans le corps de la carte salle (https://travelba.fr/api/r/{{6}}), pas un bouton : le préfixe est fixe, la variable est après le domaine. L’heure de 18 h n’est pas répétée dans le carrousel.",
    "",
    "Photos. Le média est https://travelba.fr/api/restaurants/media/{{jeton}}. Le jeton d’exemple est exemple.salle, exemple.plat ou exemple.carte (le logo public, le temps de l’approbation). Soumettre les modèles une fois cette adresse en production, sinon Meta ne peut pas lire l’exemple.",
    "",
    "Carte salle : " + SALLE_CARD_BODY,
    "Carte plat : " + PLAT_CARD_BODY,
    "Carte menu : " + CARTE_CARD_BODY,
    "",
    "Tant que le SID n’est pas approuvé, le message correspondant reste en file. Rien ne part.",
    "",
    "Fichiers : scripts/whatsapp/restaurant-selection.json, restaurant-proposition.json, restaurant-proposition-carte.json.",
    "Création : npx tsx scripts/create-restaurant-whatsapp-templates.ts --create",
  ].join("\n");
}

export function restaurantIntroVariables(input: { greeting: string; eveningDate: string }) {
  return {
    "1": plain(input.greeting, 80) || "cher client",
    "2": plain(formatEveningFr(input.eveningDate), 40) || "ce soir",
  };
}

export function restaurantIntroText(input: { greeting: string; eveningDate: string }) {
  const variables = restaurantIntroVariables(input);
  return restaurantIntroBody().replace("{{1}}", variables["1"]).replace("{{2}}", variables["2"]);
}

/** Lien « Découvrir l’adresse » d’un restaurant : la même redirection que la carte salle. */
export function restaurantPlaceLink(restaurantId: string) {
  return /^[0-9a-f-]{36}$/i.test(restaurantId) ? `${RESTAURANT_PLACE_PREFIX}${restaurantId}` : "";
}

/**
 * Texte de la confirmation après « J’accepte » (bouton WhatsApp ou Accepter de l’espace client).
 * Le même texte sert à l’aperçu et à l’envoi réel : restaurant, date, heure, deux personnes, lien de l’adresse.
 * Sans `other`, la phrase d’annulation n’apparaît pas.
 */
export function restaurantAcceptAck(input: {
  greeting: string;
  restaurant: string;
  eveningDate: string;
  timeLabel: string;
  other: string;
  placeUrl?: string | null;
}) {
  const greeting = plain(input.greeting, 80) || "cher client";
  const restaurant = plain(input.restaurant, 80) || "la maison";
  const other = plain(input.other, 80);
  const when = plain(formatEveningFr(input.eveningDate), 40) || "ce soir";
  const time = plain(input.timeLabel, 20) || restaurantDefaultClock();
  const link = (input.placeUrl || "").trim();
  const lines = [
    `${greeting}, votre table pour 2 personnes est retenue chez ${restaurant}, ${when}, à ${time}.${other ? ` Nous annulons la table chez ${other}.` : ""}`,
  ];
  if (link.startsWith("https://")) lines.push(`Adresse : ${link}`);
  lines.push("", RESTAURANT_SIGNATURE);
  return lines.join("\n");
}

export type CarouselDraft = {
  content: ReturnType<typeof restaurantCarouselContentCreateBody>;
  variables: Record<string, string>;
  text: string;
  withMenu: boolean;
};

/** Photos https déjà en catalogue. Sans salle ou sans plat, le carrousel ne part pas. */
export function restaurantCarouselDraft(input: {
  greeting: string;
  restaurantName: string;
  timeLabel: string;
  pitch: string;
  priceBand: string;
  restaurantId: string;
  tableId: string;
  menuPhoto: boolean;
}): CarouselDraft | { error: string } {
  if (!/^[0-9a-f-]{36}$/i.test(input.restaurantId) || !/^[0-9a-f-]{36}$/i.test(input.tableId)) {
    return { error: "Table introuvable." };
  }
  const sliced = (plain(input.pitch, SALLE_PITCH_MAX) || "une table tenue pour vous").replace(/[.!?]+$/u, "");
  const space = sliced.lastIndexOf(" ");
  const pitch = sliced.length >= SALLE_PITCH_MAX && space > 24 ? sliced.slice(0, space).replace(/[,;:]+$/u, "") : sliced;
  const price = plain(input.priceBand, PLAT_PRICE_MAX) || "selon la carte";
  const renderedSalle =
    SALLE_TITLE.length +
    SALLE_CARD_BODY.replace("{{4}}", pitch).replace("{{6}}", input.restaurantId).length;
  if (renderedSalle > 160) return { error: "La description de la salle est trop longue pour la fiche." };
  const withMenu = input.menuPhoto;
  const variables: Record<string, string> = {
    "1": plain(input.greeting, 80) || "cher client",
    "2": plain(input.restaurantName, 80) || "la maison",
    "3": plain(input.timeLabel, 20) || restaurantDefaultClock(),
    "4": pitch,
    "5": `${input.restaurantId}.salle`,
    "6": input.restaurantId,
    "7": input.tableId,
    "8": price,
    "9": `${input.restaurantId}.plat`,
  };
  if (withMenu) variables["10"] = `${input.restaurantId}.carte`;
  const text = restaurantCarouselBody()
    .replace("{{1}}", variables["1"])
    .replace("{{2}}", variables["2"])
    .replace("{{3}}", variables["3"]);
  return {
    content: restaurantCarouselContentCreateBody(withMenu),
    variables,
    text,
    withMenu,
  };
}

const TABLE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RestaurantButton =
  | { reply: "accepte" | "refuse"; tableId: string | null }
  | { legacy: RestaurantChoice };

/** Bouton du carrousel, ou l’ancien choix A / B / Aucune. Une phrase libre n’est pas un choix. */
export function parseRestaurantButton(input: { body?: string | null; buttonPayload?: string | null }): RestaurantButton | null {
  const payload = (input.buttonPayload || "").trim();
  const coded = payload.match(/^(accepte|refuse):([0-9a-f-]{36})$/i);
  if (coded && TABLE_ID.test(coded[2])) {
    return { reply: coded[1].toLowerCase() as "accepte" | "refuse", tableId: coded[2] };
  }
  if (/^accepte$/i.test(payload)) return { reply: "accepte", tableId: null };
  if (/^refuse$/i.test(payload)) return { reply: "refuse", tableId: null };
  const body = fold(input.body || "")
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (body === "j'accepte") return { reply: "accepte", tableId: null };
  if (body === "je refuse") return { reply: "refuse", tableId: null };
  const legacy = parseChoice(payload) || parseChoice(body);
  if (legacy) return { legacy };
  return null;
}

export type DeskPreviewCard = {
  kind: "salle" | "plat" | "carte";
  title: string;
  body: string;
};

export type DeskPreviewRestaurant = {
  seat: "A" | "B";
  name: string;
  time: string;
  intro: string;
  cards: DeskPreviewCard[];
};

/** Aperçu admin. Madame Morel et les deux maisons sont fictives. Rien n’est envoyé. */
export function restaurantDeskPreview(): {
  caption: string;
  intro: string;
  restaurants: DeskPreviewRestaurant[];
} {
  const greeting = restaurantGreeting({ sex: "F", lastName: "Morel", firstName: "Camille" });
  const eveningDate = "2026-06-02";
  const houses = [
    {
      seat: "A" as const,
      name: "Ostuni",
      time: restaurantDefaultClock(),
      pitch: "Une salle calme, lumière basse.",
      price: "90 à 140 €",
      id: "11111111-1111-4111-8111-111111111111",
      tableId: "22222222-2222-4222-8222-222222222222",
      menu: true,
    },
    {
      seat: "B" as const,
      name: "Da Vittorio",
      time: "20h45",
      pitch: "Une table près de la verrière.",
      price: "70 à 110 €",
      id: "33333333-3333-4333-8333-333333333333",
      tableId: "44444444-4444-4444-8444-444444444444",
      menu: false,
    },
  ];
  return {
    caption: "Exemple fictif : Madame Morel, mardi 2 juin. Rien n’est envoyé.",
    intro: restaurantIntroText({ greeting, eveningDate }),
    restaurants: houses.map((house) => {
      const draft = restaurantCarouselDraft({
        greeting,
        restaurantName: house.name,
        timeLabel: house.time,
        pitch: house.pitch,
        priceBand: house.price,
        restaurantId: house.id,
        tableId: house.tableId,
        menuPhoto: house.menu,
      });
      if ("error" in draft) {
        return { seat: house.seat, name: house.name, time: house.time, intro: draft.error, cards: [] };
      }
      const cards: DeskPreviewCard[] = [
        {
          kind: "salle",
          title: "La salle",
          body: SALLE_CARD_BODY.replace("{{4}}", draft.variables["4"]).replace("{{6}}", draft.variables["6"]),
        },
        {
          kind: "plat",
          title: "Le plat signature",
          body: PLAT_CARD_BODY.replace("{{8}}", draft.variables["8"]),
        },
      ];
      if (house.menu) cards.push({ kind: "carte", title: "La carte", body: CARTE_CARD_BODY });
      return { seat: house.seat, name: house.name, time: house.time, intro: draft.text, cards };
    }),
  };
}

export type DeliveryMode = "skip" | "queue" | "send" | "no_phone";

/** Sans SID approuvé, le message reste en file. Un envoi déjà parti ne repart pas. */
export function deliveryDecision(input: { templateSid: string | null; hasPhone: boolean; alreadySent: boolean }): DeliveryMode {
  if (input.alreadySent) return "skip";
  if (!input.hasPhone) return "no_phone";
  if (!input.templateSid?.trim()) return "queue";
  return "send";
}
