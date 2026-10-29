import { CONCIERGE_SIGNATURE } from "./whatsapp";
import { formatEveningFr, parseChoice, tableChoiceLine, type RestaurantChoice } from "./restaurants";

/** SID Twilio Content. Vide tant que Meta n’a pas approuvé le modèle. */
export const RESTAURANT_TEMPLATE_ENV = "TWILIO_CONTENT_RESTAURANT_CHOIX";

export const RESTAURANT_TEMPLATE_NAME = "restaurant_choix";

export const RESTAURANT_BUTTONS = [
  { id: "A", title: "A" },
  { id: "B", title: "B" },
  { id: "aucune", title: "Aucune" },
] as const;

/**
 * Corps soumis à Meta (Utility, français).
 * {{1}} prénom, {{2}} soir, {{3}} table A, {{4}} table B.
 * Les boutons sont A, B et Aucune. Aucun prix, aucun numéro de carte.
 */
export function restaurantChoiceBody() {
  return [
    "Bonjour {{1}},",
    "",
    "Pour {{2}}, deux tables sont réservées. Laquelle gardez-vous ?",
    "",
    "A — {{3}}",
    "B — {{4}}",
    "",
    "Répondez avant 18 h, heure locale. Sans réponse, les deux tables sont annulées.",
    "",
    CONCIERGE_SIGNATURE,
  ].join("\n");
}

/** Charge utile à créer dans Twilio Content, puis à soumettre à Meta. Aucun secret. */
export function restaurantChoiceContentCreateBody() {
  return {
    friendly_name: RESTAURANT_TEMPLATE_NAME,
    language: "fr",
    variables: {
      "1": "Camille",
      "2": "mardi 2 juin",
      "3": "Ostuni · 20h30",
      "4": "Da Vittorio · 20h45",
    },
    types: {
      "twilio/quick-reply": {
        body: restaurantChoiceBody(),
        actions: RESTAURANT_BUTTONS.map((button) => ({ title: button.title, id: button.id })),
      },
    },
  };
}

/** Texte à coller dans la demande Meta, boutons compris. */
export function restaurantChoiceSubmission() {
  const draft = restaurantChoiceContentCreateBody();
  const buttons = RESTAURANT_BUTTONS.map((button) => `${button.title} (id ${button.id})`).join(", ");
  return [
    `Nom : ${RESTAURANT_TEMPLATE_NAME}`,
    "Langue : fr",
    "Catégorie : Utility",
    "Variable d’environnement : TWILIO_CONTENT_RESTAURANT_CHOIX",
    "",
    "Corps :",
    draft.types["twilio/quick-reply"].body,
    "",
    `Boutons de réponse rapide : ${buttons}`,
    "",
    "Exemples :",
    "{{1}} Camille",
    "{{2}} mardi 2 juin",
    "{{3}} Ostuni · 20h30",
    "{{4}} Da Vittorio · 20h45",
    "",
    "Tant que Meta n’a pas approuvé le modèle, le message reste en file. Rien ne part.",
  ].join("\n");
}

export function restaurantChoiceVariables(input: {
  firstName: string | null | undefined;
  eveningDate: string;
  tableA: string;
  tableB: string;
}) {
  const clip = (value: string) => value.replace(/[\r\n]+/g, " ").trim().slice(0, 200) || " ";
  return {
    "1": clip(input.firstName || " "),
    "2": clip(formatEveningFr(input.eveningDate)),
    "3": clip(input.tableA),
    "4": clip(input.tableB),
  };
}

export function restaurantOutboundBody(input: {
  firstName: string | null | undefined;
  eveningDate: string;
  tableA: { name: string; time: string | null };
  tableB: { name: string; time: string | null };
}) {
  return restaurantChoiceBody()
    .replace("{{1}}", (input.firstName || "").trim() || " ")
    .replace("{{2}}", formatEveningFr(input.eveningDate))
    .replace("{{3}}", tableChoiceLine(input.tableA.name, input.tableA.time))
    .replace("{{4}}", tableChoiceLine(input.tableB.name, input.tableB.time));
}

/** Bouton WhatsApp, ou un mot exact. Une phrase qui contient « a » n’est pas un choix. */
export function parseRestaurantReply(input: { body?: string | null; buttonPayload?: string | null }): RestaurantChoice | null {
  const payload = parseChoice(input.buttonPayload || "");
  if (payload) return payload;
  return parseChoice(input.body || "");
}

export type DeliveryMode = "skip" | "queue" | "send" | "no_phone";

/** Sans SID approuvé, le message reste en file. Un envoi déjà parti ne repart pas. */
export function deliveryDecision(input: { templateSid: string | null; hasPhone: boolean; alreadySent: boolean }): DeliveryMode {
  if (input.alreadySent) return "skip";
  if (!input.hasPhone) return "no_phone";
  if (!input.templateSid?.trim()) return "queue";
  return "send";
}
