import { foldCityName } from "./city-names";
import { countryCodeForPlace, isCountryName } from "./cover-catalog";
import { stayAtPhrase, stayDestinationNames, stayDestinationPhrase } from "./stay-phrase";
import type { TripStep } from "./layover";

/** Définitions Utility. Elles ne sont pas soumises à Meta et ne sont pas armées. */

export type ConciergeTemplate = {
  key: "concierge_reprise" | "concierge_depart" | "concierge_retour";
  category: "utility";
  status: "draft_not_submitted";
  variables: ["prenom"] | ["prenom", "destination"];
  bodies: { fr: string; en: string; he: string };
};

export const CONCIERGE_TEMPLATES: ConciergeTemplate[] = [
  {
    key: "concierge_reprise",
    category: "utility",
    status: "draft_not_submitted",
    variables: ["prenom"],
    bodies: {
      fr: "Bonjour {{prenom}}, merci pour votre message. Nous l’avons bien reçu et un membre de notre équipe revient vers vous très vite. Belle journée !",
      en: "Hello {{prenom}}, thank you for your message. We have received it, and a member of our team will be in touch very shortly. Wishing you a lovely day.",
      he: "שלום {{prenom}}, תודה על הודעתכם. קיבלנו אותה, וחבר מצוותנו ישוב אליכם בהקדם. יום נפלא.",
    },
  },
  {
    key: "concierge_depart",
    category: "utility",
    status: "draft_not_submitted",
    variables: ["prenom", "destination"],
    bodies: {
      fr: "Bonjour {{prenom}}, votre séjour {{destination}} approche ! Tout est prêt de notre côté. Une question, une envie de dernière minute ? Écrivez-nous ici, nous sommes à vos côtés.",
      en: "Hello {{prenom}}, your stay {{destination}} is drawing near. Everything is ready on our side. A question, a last-minute wish? Write to us here. We are right beside you.",
      he: "שלום {{prenom}}, השהות שלכם {{destination}} מתקרבת. הכל מוכן מצדנו. שאלה, או משאלה של הרגע האחרון? כתבו לנו כאן. אנחנו לצדכם.",
    },
  },
  {
    key: "concierge_retour",
    category: "utility",
    status: "draft_not_submitted",
    variables: ["prenom", "destination"],
    bodies: {
      fr: "Bonjour {{prenom}}, nous espérons que votre séjour {{destination}} a été à la hauteur de vos attentes. Votre avis nous est précieux et nous serions ravis de préparer votre prochaine escapade.",
      en: "Hello {{prenom}}, we hope your stay {{destination}} was everything you wished for. Your impression means a great deal to us, and we would be delighted to arrange your next escape.",
      he: "שלום {{prenom}}, אנו מקווים שהשהות שלכם {{destination}} עמדה בציפיותיכם. דעתכם יקרה לנו, ונשמח להכין את הבריחה הבאה שלכם.",
    },
  },
];

export function templateIsArmed(template: ConciergeTemplate) {
  return template.status !== "draft_not_submitted";
}

export function conciergeTemplate(key: string) {
  return CONCIERGE_TEMPLATES.find((template) => template.key === key) || null;
}

const THE_COUNTRY = new Set(["sc", "mv", "us", "nl", "ph", "ae", "bs", "km", "fj", "sb"]);
const ENGLISH_COUNTRY: Record<string, string> = {
  sc: "Seychelles",
  mv: "Maldives",
  us: "United States",
  nl: "Netherlands",
  ph: "Philippines",
  ae: "United Arab Emirates",
  bs: "Bahamas",
  km: "Comoros",
  fj: "Fiji",
  sb: "Solomon Islands",
};
const HEBREW_PLACE: Record<string, string> = {
  "tel aviv": "בתל אביב",
  seychelles: "באיי סיישל",
  maldives: "במלדיביים",
  "etats unis": "בארצות הברית",
  "pays bas": "בהולנד",
  philippines: "בפיליפינים",
  marrakech: "במרקש",
  avoriaz: "באבוריאז",
};

export type StayPhraseInput = {
  title?: string | null;
  destination?: string | null;
  items?: TripStep[] | null;
};

/** FR : « à Tel Aviv et aux Seychelles ». EN : « in Tel Aviv and the Seychelles ». HE sans préposition française. */
export function templateDestination(input: StayPhraseInput, lang: "fr" | "en" | "he") {
  const names = stayDestinationNames(input);
  if (!names.length) return "";
  if (lang === "fr") return stayDestinationPhrase(input) || stayAtPhrase(names);
  if (lang === "en") return englishStay(names);
  return hebrewStay(names);
}

function englishPlace(name: string) {
  const key = foldCityName(name);
  if (!isCountryName(key)) return name;
  const code = countryCodeForPlace(key) || "";
  const label = ENGLISH_COUNTRY[code] || name;
  return THE_COUNTRY.has(code) ? `the ${label}` : label;
}

function englishStay(names: string[]) {
  const parts = names.map(englishPlace);
  if (parts.length === 1) return `in ${parts[0]}`;
  if (parts.length === 2) return `in ${parts[0]} and ${parts[1]}`;
  return `in ${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function hebrewPlace(name: string) {
  const key = foldCityName(name);
  return HEBREW_PLACE[key] || `ב${name}`;
}

function hebrewStay(names: string[]) {
  const parts = names.map(hebrewPlace);
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} ו${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} ו${parts[parts.length - 1]}`;
}

/** Remplit {{prenom}} et {{destination}}. Un prénom vide laisse « Bonjour, ». */
export function renderConciergeTemplate(
  key: string,
  lang: "fr" | "en" | "he",
  vars: { prenom?: string | null; destination?: string | null }
) {
  const template = conciergeTemplate(key);
  if (!template) return "";
  const name = (vars.prenom || "").replace(/[\r\n]+/g, " ").trim();
  const destination = (vars.destination || "").replace(/[\r\n]+/g, " ").trim();
  return template.bodies[lang]
    .replace(/\{\{\s*prenom\s*\}\}/g, name)
    .replace(/\{\{\s*destination\s*\}\}/g, destination)
    .replace(/\s+,/g, ",")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
