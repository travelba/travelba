import { siteConfig } from "../site";
import { CONCIERGE_SIGNATURE, greetingForWhatsapp } from "./whatsapp";
import { EXAMPLE_ACCESS_TOKEN, accessContentVariables } from "./access-resend";

export const HOTEL_OPTION_TEMPLATE_KEY = "option_hotel_activee";
export const HOTEL_OPTION_TEMPLATE_ENV = "TWILIO_CONTENT_OPTION_HOTEL";
export const HOTEL_OPTION_NEXT_PATH = "/mon-compte/hotels";

const TEMPLATE_BODY = [
  "Bonjour {{1}},",
  "",
  "En tant que membre privilégié, nous vous avons ouvert un accès privé à la réservation d’hôtels depuis votre espace client. Vous y trouverez les plus beaux hôtels, avec nos meilleurs prix et des avantages VIP.",
  "",
  CONCIERGE_SIGNATURE,
].join("\n");

export function hotelOptionTemplatePreview(firstName: string | null | undefined) {
  const name = (greetingForWhatsapp(firstName) || "").replace(/[\r\n]+/g, " ").trim().slice(0, 40);
  const text = TEMPLATE_BODY.replace("{{1}}", name);
  if (/\{\{\d+\}\}/.test(text)) return null;
  return text.replace("Bonjour ,", "Bonjour,");
}

export function hotelOptionContentVariables(firstName: string | null | undefined, email: string, token: string) {
  const access = accessContentVariables(firstName, email, token);
  if (!access) return null;
  return { "1": access["1"], "2": access["2"] };
}

export function hotelOptionContentDrafts() {
  return [
    {
      template: HOTEL_OPTION_TEMPLATE_KEY,
      env: HOTEL_OPTION_TEMPLATE_ENV,
      friendlyName: HOTEL_OPTION_TEMPLATE_KEY,
      create: {
        friendly_name: HOTEL_OPTION_TEMPLATE_KEY,
        language: "fr" as const,
        variables: {
          "1": "Camille",
          "2": EXAMPLE_ACCESS_TOKEN,
        },
        types: {
          "twilio/call-to-action": {
            body: TEMPLATE_BODY,
            actions: [
              {
                type: "URL" as const,
                title: "Ouvrir mon espace",
                url: `${siteConfig.url}/acces/{{2}}`,
              },
            ],
          },
        },
      },
    },
  ];
}
