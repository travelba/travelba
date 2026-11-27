import { siteConfig } from "../site";
import {
  TRAIN_ACCORD_ENV,
  TRAIN_ACCORD_NAME,
  TRAIN_BILLET_ENV,
  TRAIN_CLASSE_ENV,
  TRAIN_CLASSE_NAME,
  TRAIN_LIST_MIN,
  TRAIN_LIST_TRAINS_MAX,
  TRAIN_MODIFIER_BUTTONS,
  TRAIN_MODIFIER_NAME,
  TRAIN_TARIF_ENV,
  TRAIN_TARIF_NAME,
  trainAccordContentCreateBody,
  trainAccrocheContentCreateBody,
  TRAIN_ACCROCHE_ENV,
  TRAIN_ACCROCHE_NAME,
  trainHorairesContentCreateBody,
  trainHorairesTemplateEnv,
  trainHorairesTemplateName,
  trainClasseContentCreateBody,
  trainTarifContentCreateBody,
} from "./train-whatsapp";

export const TRAIN_BILLET_NAME = "train_billet";
export const TRAIN_MODIFIER_ENV = "TWILIO_CONTENT_TRAIN_MODIFIER";
export const TRAIN_BILLET_SAMPLE_FILE = "billet-train-exemple.pdf";
export const TRAIN_BILLET_SAMPLE_PATH = `exemple/${TRAIN_BILLET_SAMPLE_FILE}`;

export function trainModifierContentCreateBody() {
  return {
    friendly_name: TRAIN_MODIFIER_NAME,
    language: "fr",
    types: {
      "twilio/quick-reply": {
        body: "Tu veux changer quoi ?",
        actions: TRAIN_MODIFIER_BUTTONS.map((button) => ({ type: "QUICK_REPLY" as const, title: button.title, id: button.id })),
      },
    },
  };
}

export function trainBilletContentCreateBody() {
  return {
    friendly_name: TRAIN_BILLET_NAME,
    language: "fr",
    variables: {
      "1": "Camille",
      "2": "TGV 6601",
      "3": "Paris Gare de Lyon → Lyon Part-Dieu",
      "4": "mardi 2 juin à 08h12",
      "5": "voiture 12, place 41",
      "6": TRAIN_BILLET_SAMPLE_PATH,
    },
    types: {
      "twilio/media": {
        body: [
          "Bonjour {{1}},",
          "",
          "Ton billet {{2}} est là.",
          "Trajet : {{3}}, départ {{4}}.",
          "Place : {{5}}.",
          "On te l’envoie pour le départ.",
        ].join("\n"),
        media: [`${siteConfig.url}/api/whatsapp/autorisations/{{6}}`],
      },
    },
  };
}

export function trainContentDrafts() {
  const lists = (["aller", "retour"] as const).flatMap((leg) =>
    Array.from({ length: TRAIN_LIST_TRAINS_MAX - TRAIN_LIST_MIN + 1 }, (_, index) => {
      const count = TRAIN_LIST_MIN + index;
      return {
        env: trainHorairesTemplateEnv(count, leg),
        friendlyName: trainHorairesTemplateName(count, leg),
        create: trainHorairesContentCreateBody(count, leg),
        approuver: false,
      };
    })
  );
  return [
    ...lists,
    { env: TRAIN_ACCROCHE_ENV, friendlyName: TRAIN_ACCROCHE_NAME, create: trainAccrocheContentCreateBody(), approuver: true },
    { env: TRAIN_CLASSE_ENV, friendlyName: TRAIN_CLASSE_NAME, create: trainClasseContentCreateBody(), approuver: true },
    { env: TRAIN_TARIF_ENV, friendlyName: TRAIN_TARIF_NAME, create: trainTarifContentCreateBody(), approuver: true },
    { env: TRAIN_ACCORD_ENV, friendlyName: TRAIN_ACCORD_NAME, create: trainAccordContentCreateBody(), approuver: true },
    { env: TRAIN_MODIFIER_ENV, friendlyName: TRAIN_MODIFIER_NAME, create: trainModifierContentCreateBody(), approuver: true },
    { env: TRAIN_BILLET_ENV, friendlyName: TRAIN_BILLET_NAME, create: trainBilletContentCreateBody(), approuver: true },
  ];
}
