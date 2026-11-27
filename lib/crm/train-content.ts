import { siteConfig } from "../site";
import { BOARDING_PASS_SAMPLE_PATH } from "./boarding-pass-whatsapp";
import {
  TRAIN_ACCORD_ENV,
  TRAIN_ACCORD_NAME,
  TRAIN_BILLET_ENV,
  TRAIN_CLASSE_ENV,
  TRAIN_CLASSE_NAME,
  TRAIN_LISTE_ENV,
  TRAIN_LISTE_NAME,
  TRAIN_MODIFIER_BUTTONS,
  TRAIN_MODIFIER_NAME,
  TRAIN_PROPOSITION_ENV,
  TRAIN_PROPOSITION_NAME,
  TRAIN_SIGNATURE,
  TRAIN_TARIF_ENV,
  TRAIN_TARIF_NAME,
  trainAccordContentCreateBody,
  trainClasseContentCreateBody,
  trainListContentCreateBody,
  trainPropositionContentCreateBody,
  trainTarifContentCreateBody,
} from "./train-whatsapp";

export const TRAIN_BILLET_NAME = "train_billet";
export const TRAIN_MODIFIER_ENV = "TWILIO_CONTENT_TRAIN_MODIFIER";

export function trainModifierContentCreateBody() {
  return {
    friendly_name: TRAIN_MODIFIER_NAME,
    language: "fr",
    types: {
      "twilio/quick-reply": {
        body: ["Que souhaitez-vous modifier ?", "", "Rien n’est acheté tant que vous n’avez pas confirmé le nouveau prix.", "", TRAIN_SIGNATURE].join("\n"),
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
      "1": BOARDING_PASS_SAMPLE_PATH,
      "2": "Camille",
      "3": "TGV 6601",
      "4": "Paris Gare de Lyon → Lyon Part-Dieu",
      "5": "mardi 2 juin à 08h12",
      "6": "voiture 12, place 41",
    },
    types: {
      "twilio/media": {
        body: [
          "Bonjour {{2}},",
          "",
          "Votre billet de train {{3}} est joint à ce message. Trajet {{4}}, départ le {{5}}. Emplacement : {{6}}.",
          "",
          TRAIN_SIGNATURE,
        ].join("\n"),
        media: [`${siteConfig.url}/api/whatsapp/cartes/{{1}}`],
      },
    },
  };
}

export function trainContentDrafts() {
  return [
    { env: TRAIN_PROPOSITION_ENV, friendlyName: TRAIN_PROPOSITION_NAME, create: trainPropositionContentCreateBody() },
    { env: TRAIN_LISTE_ENV, friendlyName: TRAIN_LISTE_NAME, create: trainListContentCreateBody() },
    { env: TRAIN_CLASSE_ENV, friendlyName: TRAIN_CLASSE_NAME, create: trainClasseContentCreateBody() },
    { env: TRAIN_TARIF_ENV, friendlyName: TRAIN_TARIF_NAME, create: trainTarifContentCreateBody() },
    { env: TRAIN_ACCORD_ENV, friendlyName: TRAIN_ACCORD_NAME, create: trainAccordContentCreateBody() },
    { env: TRAIN_MODIFIER_ENV, friendlyName: TRAIN_MODIFIER_NAME, create: trainModifierContentCreateBody() },
    { env: TRAIN_BILLET_ENV, friendlyName: TRAIN_BILLET_NAME, create: trainBilletContentCreateBody() },
  ];
}
