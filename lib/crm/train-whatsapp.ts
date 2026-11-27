import { fold } from "./text";
import { restaurantGreeting } from "./restaurant-whatsapp";

/**
 * Parcours WhatsApp des billets de train.
 * Le CRM n’achète rien : il pose les questions, enregistre le choix, et l’agence
 * (ou le bot SNCF) commande ensuite sur SNCF Connect.
 * Modèles Utility, français, sans emoji. Ordre : trains, classe, tarif, récapitulatif
 * avec le prix, puis accord. Rien n’est acheté avant « Je confirme ».
 * « Autres horaires » renvoie la demande au bot. Un délai garde les choix.
 */

export const TRAIN_SIGNATURE = "La Conciergerie Travel BA";

export const TRAIN_LISTE_ENV = "TWILIO_CONTENT_TRAIN_LISTE";
export const TRAIN_CLASSE_ENV = "TWILIO_CONTENT_TRAIN_CLASSE";
export const TRAIN_TARIF_ENV = "TWILIO_CONTENT_TRAIN_TARIF";
export const TRAIN_ACCORD_ENV = "TWILIO_CONTENT_TRAIN_ACCORD";
export const TRAIN_BILLET_ENV = "TWILIO_CONTENT_TRAIN_BILLET";

export const TRAIN_LISTE_NAME = "train_liste";
export const TRAIN_CLASSE_NAME = "train_classe";
export const TRAIN_TARIF_NAME = "train_tarif";
export const TRAIN_ACCORD_NAME = "train_accord";
export const TRAIN_MODIFIER_NAME = "train_modifier";

/** Au moins 3 trains. La liste WhatsApp a 10 lignes : 9 trains et « Autres horaires ». */
export const TRAIN_LIST_MIN = 3;
export const TRAIN_LIST_TRAINS_MAX = 9;
export const TRAIN_LIST_SLOTS = 3;
export const TRAIN_LIST_MAX = 10;

export function trainListTemplateName(count: number) {
  return `${TRAIN_LISTE_NAME}_${count}`;
}

export function trainListTemplateEnv(count: number) {
  return `${TRAIN_LISTE_ENV}_${count}`;
}

export const TRAIN_CLASSE_BUTTONS = [
  { title: "2de classe", id: "train:classe:2de" },
  { title: "1re classe", id: "train:classe:1re" },
] as const;

export const TRAIN_TARIF_BUTTONS = [
  { title: "Non remboursable", id: "train:tarif:non_remboursable" },
  { title: "Flex", id: "train:tarif:flex" },
] as const;

export const TRAIN_ACCORD_BUTTONS = [
  { title: "Je confirme", id: "train:accord:confirme" },
  { title: "Modifier", id: "train:accord:modifier" },
  { title: "Je refuse", id: "train:accord:refuse" },
] as const;

export const TRAIN_MODIFIER_BUTTONS = [
  { title: "Le train", id: "train:modifier:train" },
  { title: "La classe", id: "train:modifier:classe" },
  { title: "Le tarif", id: "train:modifier:tarif" },
] as const;

export const TRAIN_HOURS_ID = "train:horaires";

export type TrainClasse = "2de" | "1re";
export type TrainTarif = "non_remboursable" | "flex";
export type TrainLeg = "aller" | "retour";
export type TrainStep = TrainLeg | "horaires" | "classe" | "tarif" | "accord" | "fait";

export type TrainPrices = {
  non_remboursable?: number | null;
  flex?: number | null;
};

export type TrainOffer = {
  numero: string;
  depart_gare: string;
  arrivee_gare: string;
  date: string;
  heure_depart: string;
  heure_arrivee: string;
  duree?: string | null;
  prix?: { "2de"?: TrainPrices | null; "1re"?: TrainPrices | null } | null;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function trainGreeting(input: { sex?: string | null; lastName?: string | null; firstName?: string | null }) {
  return restaurantGreeting(input);
}

export function trainClock(value: string | null | undefined) {
  const match = String(value || "")
    .trim()
    .match(/^(\d{1,2})\s*[:hH]\s*(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}h${match[2]}`;
}

function minutesOf(value: string) {
  const clock = trainClock(value);
  if (!clock) return null;
  return Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));
}

/** Durée civile entre deux heures. Un arrivée avant le départ passe minuit. Rien si les heures manquent. */
export function trainDuration(depart: string, arrivee: string) {
  const start = minutesOf(depart);
  const end = minutesOf(arrivee);
  if (start == null || end == null) return null;
  let diff = end - start;
  if (diff <= 0) diff += 24 * 60;
  const hours = Math.floor(diff / 60);
  const minutes = diff % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${String(minutes).padStart(2, "0")}`;
}

export function formatTrainDateFr(iso: string) {
  const day = iso.slice(0, 10);
  if (!DAY.test(day)) return "";
  const date = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Paris",
  });
}

export function formatEuro(amount: number) {
  const rounded = Math.round(amount * 100) / 100;
  const text = rounded.toLocaleString("fr-FR", {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${text} €`;
}

function knownPrices(offer: TrainOffer) {
  const blocks = [offer.prix?.["2de"], offer.prix?.["1re"]];
  const values: number[] = [];
  for (const block of blocks) {
    if (!block) continue;
    for (const value of [block.non_remboursable, block.flex]) {
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) values.push(value);
    }
  }
  return values;
}

export function trainFloorPrice(offer: TrainOffer) {
  const values = knownPrices(offer);
  if (!values.length) return null;
  return Math.min(...values);
}

function clip(value: string, max: number) {
  const clean = value.replace(/[\r\n\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : clean.slice(0, max).trim();
}

export function trainLocalStamp(date: string, time: string) {
  const clock = trainClock(time);
  if (!DAY.test(date) || !clock) return null;
  return `${date}T${clock.slice(0, 2)}:${clock.slice(3)}:00`;
}

export function trainOfferLabel(offer: TrainOffer) {
  const depart = trainClock(offer.heure_depart) || offer.heure_depart;
  const numero = offer.numero ? `train ${offer.numero}` : "ce train";
  return clip(`${numero} à ${depart}`, 80);
}

export function trainChoiceLine(offer: TrainOffer, index: number) {
  const depart = trainClock(offer.heure_depart) || offer.heure_depart;
  const arrivee = trainClock(offer.heure_arrivee) || offer.heure_arrivee;
  const parts = [`${index + 1}. ${depart} → ${arrivee}`];
  if (offer.numero) parts.push(`train ${offer.numero}`);
  const duree = (offer.duree || "").trim() || trainDuration(offer.heure_depart, offer.heure_arrivee);
  if (duree) parts.push(duree);
  const floor = trainFloorPrice(offer);
  if (floor != null) parts.push(`dès ${formatEuro(floor)}`);
  return parts.join(", ");
}

export function trainChoiceList(offers: TrainOffer[]) {
  return offers.map((offer, index) => trainChoiceLine(offer, index)).join("\n");
}

export function trainRouteLabel(from: string, to: string) {
  return clip(`${from} → ${to}`, 80);
}

function plain(value: string, max: number) {
  return clip(value, max);
}

export function trainListBody() {
  return [
    "Bonjour {{1}},",
    "",
    "Pour {{2}}, le {{3}}, choisissez un train dans la liste. « Autres horaires » y figure aussi. Nous demanderons ensuite la classe, le tarif, puis votre accord sur le prix. Rien n’est acheté avant cet accord.",
    "",
    TRAIN_SIGNATURE,
  ].join("\n");
}

export function trainClasseBody() {
  return [
    "{{1}}, vous avez choisi le {{2}}.",
    "",
    "Souhaitez-vous voyager en 2de classe ou en 1re classe ?",
    "",
    TRAIN_SIGNATURE,
  ].join("\n");
}

export function trainTarifBody() {
  return [
    "{{1}}, en {{2}}.",
    "",
    "Quel tarif préférez-vous ? Le non remboursable ne s’échange pas. Flex est échangeable et remboursable.",
    "",
    TRAIN_SIGNATURE,
  ].join("\n");
}

export function trainAccordBody() {
  return [
    "{{1}}, voici votre choix :",
    "",
    "{{2}}",
    "",
    "Total : {{3}}.",
    "",
    "L’agence n’achète les billets qu’après votre accord.",
    "",
    TRAIN_SIGNATURE,
  ].join("\n");
}

export function trainListItem(offer: TrainOffer, leg: TrainLeg, index: number) {
  const depart = trainClock(offer.heure_depart) || offer.heure_depart;
  const arrivee = trainClock(offer.heure_arrivee) || offer.heure_arrivee;
  const duree = (offer.duree || "").trim() || trainDuration(offer.heure_depart, offer.heure_arrivee) || "";
  const description = clip([duree, offer.numero ? `train ${offer.numero}` : ""].filter(Boolean).join(", "), 72);
  return {
    id: `train:${leg}:${index}`,
    item: clip(`${depart} → ${arrivee}`, 24) || `Train ${index + 1}`,
    description: description || "Horaire proposé",
  };
}

export function trainHoursListItem() {
  return { id: TRAIN_HOURS_ID, item: "Autres horaires", description: "Un autre créneau" };
}

export function trainListVariables(input: {
  greeting: string;
  route: string;
  dateLabel: string;
  leg: TrainLeg;
  offers: TrainOffer[];
}) {
  const variables: Record<string, string> = {
    "1": plain(input.greeting, 80) || "cher client",
    "2": plain(input.route, 80) || "votre trajet",
    "3": plain(input.dateLabel, 40) || "ce jour",
  };
  input.offers.slice(0, TRAIN_LIST_TRAINS_MAX).forEach((offer, index) => {
    const item = trainListItem(offer, input.leg, index);
    const base = 4 + index * 3;
    variables[String(base)] = item.item;
    variables[String(base + 1)] = item.description;
    variables[String(base + 2)] = item.id;
  });
  return variables;
}

function listPicker(count: number) {
  const items = Array.from({ length: count }, (_, index) => {
    const base = 4 + index * 3;
    return {
      item: `{{${base}}}`,
      description: `{{${base + 1}}}`,
      id: `{{${base + 2}}}`,
    };
  });
  items.push({ item: "Autres horaires", description: "Un autre créneau", id: TRAIN_HOURS_ID });
  return {
    body: trainListBody(),
    button: "Voir les trains",
    items,
  };
}

function exampleOffers(count: number): TrainOffer[] {
  return Array.from({ length: count }, (_, index) => ({
    numero: String(6601 + index * 2),
    depart_gare: "Paris Gare de Lyon",
    arrivee_gare: "Lyon Part-Dieu",
    date: "2026-06-02",
    heure_depart: `${String(8 + index).padStart(2, "0")}:12`,
    heure_arrivee: `${String(10 + index).padStart(2, "0")}:05`,
    duree: "1 h 53",
    prix: { "2de": { non_remboursable: 45 + index * 4, flex: 72 + index * 4 } },
  }));
}

/** Modèle liste pour un nombre de trains fixé (3 à 9), plus la ligne Autres horaires. */
export function trainListContentCreateBody(count = TRAIN_LIST_MIN) {
  const trains = Math.min(TRAIN_LIST_TRAINS_MAX, Math.max(TRAIN_LIST_MIN, count));
  return {
    friendly_name: trainListTemplateName(trains),
    language: "fr",
    variables: trainListVariables({
      greeting: "Monsieur Dupont",
      route: "Paris Gare de Lyon → Lyon Part-Dieu",
      dateLabel: "mardi 2 juin",
      leg: "aller",
      offers: exampleOffers(trains),
    }),
    types: {
      "twilio/list-picker": listPicker(trains),
    },
  };
}

/** Liste affichée : les trains, puis la ligne cliquable Autres horaires. */
export function trainSessionListContent(input: { body: string; leg: TrainLeg; offers: TrainOffer[] }) {
  return {
    language: "fr",
    types: {
      "twilio/list-picker": {
        body: input.body,
        button: "Voir les trains",
        items: [
          ...input.offers.slice(0, TRAIN_LIST_TRAINS_MAX).map((offer, index) => trainListItem(offer, input.leg, index)),
          trainHoursListItem(),
        ],
      },
    },
  };
}

export function trainClasseContentCreateBody() {
  return {
    friendly_name: TRAIN_CLASSE_NAME,
    language: "fr",
    variables: { "1": "Monsieur Dupont", "2": "train 6601 à 08h12" },
    types: {
      "twilio/quick-reply": {
        body: trainClasseBody(),
        actions: TRAIN_CLASSE_BUTTONS.map((button) => ({ type: "QUICK_REPLY" as const, title: button.title, id: button.id })),
      },
    },
  };
}

export function trainTarifContentCreateBody() {
  return {
    friendly_name: TRAIN_TARIF_NAME,
    language: "fr",
    variables: { "1": "Monsieur Dupont", "2": "1re classe" },
    types: {
      "twilio/quick-reply": {
        body: trainTarifBody(),
        actions: TRAIN_TARIF_BUTTONS.map((button) => ({ type: "QUICK_REPLY" as const, title: button.title, id: button.id })),
      },
    },
  };
}

export function trainAccordContentCreateBody() {
  return {
    friendly_name: TRAIN_ACCORD_NAME,
    language: "fr",
    variables: {
      "1": "Monsieur Dupont",
      "2": "Aller train 6601 le mardi 2 juin à 08h12, 1re classe, tarif Flex.",
      "3": "90 € pour 2 voyageurs",
    },
    types: {
      "twilio/quick-reply": {
        body: trainAccordBody(),
        actions: TRAIN_ACCORD_BUTTONS.map((button) => ({ type: "QUICK_REPLY" as const, title: button.title, id: button.id })),
      },
    },
  };
}

export function trainTemplateSubmission() {
  const liste = trainListContentCreateBody();
  const classe = trainClasseContentCreateBody();
  const tarif = trainTarifContentCreateBody();
  return [
    "Modèles Utility, français, sans emoji. Le choix du train se fait en cliquant. Le CRM n’achète pas les billets.",
    "",
    "Ordre : train aller, train retour s’il y en a un, classe, tarif, accord.",
    "Liste cliquable train_liste_3 à train_liste_9 : chaque ligne est l’heure de départ, l’arrivée, la durée et le numéro. La dernière ligne est Autres horaires. Un numéro tapé ne choisit pas le train.",
    "",
    `1. ${trainListTemplateName(TRAIN_LIST_MIN)} à ${trainListTemplateName(TRAIN_LIST_TRAINS_MAX)}`,
    `Variables : ${trainListTemplateEnv(TRAIN_LIST_MIN)} à ${trainListTemplateEnv(TRAIN_LIST_TRAINS_MAX)}`,
    "Type : twilio/list-picker",
    "Bouton : Voir les trains",
    "Pour N trains : {{4}} titre, {{5}} description, {{6}} identifiant, puis le même triplet. Dernière ligne fixe : Autres horaires, id train:horaires.",
    "L’identifiant d’un train est train:aller:0 ou train:retour:0.",
    "",
    liste.types["twilio/list-picker"].body,
    "",
    `2. ${TRAIN_CLASSE_NAME}`,
    `Variable : ${TRAIN_CLASSE_ENV}`,
    "Boutons : 2de classe (train:classe:2de), 1re classe (train:classe:1re).",
    "",
    classe.types["twilio/quick-reply"].body,
    "",
    `3. ${TRAIN_TARIF_NAME}`,
    `Variable : ${TRAIN_TARIF_ENV}`,
    "Boutons : Non remboursable (train:tarif:non_remboursable), Flex (train:tarif:flex).",
    "",
    tarif.types["twilio/quick-reply"].body,
    "",
    "Une réponse ambiguë repose la question une fois, puis passe la main à l’agence. Rien n’est inventé : sans prix, la ligne n’affiche pas de montant.",
    "Création : npx tsx scripts/create-train-whatsapp-templates.ts --create",
  ].join("\n");
}

export type TrainPlan = {
  modele:
    | "train_liste"
    | "train_classe"
    | "train_tarif"
    | "train_accord"
    | "train_modifier"
    | "train_horaires"
    | "train_attente"
    | "train_indisponible"
    | "train_billet"
    | "train_suite"
    | "session";
  corps: string;
  variables?: Record<string, string>;
  liste?: ReturnType<typeof trainSessionListContent>;
};

function fill(template: string, variables: Record<string, string>) {
  return template.replace(/\{\{(\d+)\}\}/g, (_, key: string) => variables[key] ?? "");
}

export function planTrainLegQuestion(input: {
  greeting: string;
  route: string;
  date: string;
  leg: TrainLeg;
  offers: TrainOffer[];
  sessionOpen?: boolean;
}): TrainPlan {
  void input.sessionOpen;
  const greeting = plain(input.greeting, 80) || "cher client";
  const route = plain(input.route, 80) || "votre trajet";
  const dateLabel = formatTrainDateFr(input.date) || "ce jour";
  const offers = input.offers.slice(0, TRAIN_LIST_TRAINS_MAX);
  const listBody = fill(trainListBody(), { "1": greeting, "2": route, "3": dateLabel });
  const inRange = offers.length >= TRAIN_LIST_MIN && offers.length <= TRAIN_LIST_TRAINS_MAX;
  return {
    modele: "train_liste" as const,
    corps: listBody,
    ...(inRange ? { variables: trainListVariables({ greeting, route, dateLabel, leg: input.leg, offers }) } : {}),
    liste: trainSessionListContent({ body: listBody, leg: input.leg, offers }),
  };
}

export function planTrainClasseQuestion(input: { greeting: string; offer: TrainOffer }): TrainPlan {
  const variables = {
    "1": plain(input.greeting, 80) || "cher client",
    "2": trainOfferLabel(input.offer),
  };
  return { modele: "train_classe", corps: fill(trainClasseBody(), variables), variables };
}

export function classeLabel(classe: TrainClasse) {
  return classe === "1re" ? "1re classe" : "2de classe";
}

export function tarifLabel(tarif: TrainTarif) {
  return tarif === "flex" ? "Flex" : "Non remboursable";
}

export function planTrainTarifQuestion(input: { greeting: string; classe: TrainClasse }): TrainPlan {
  const variables = {
    "1": plain(input.greeting, 80) || "cher client",
    "2": classeLabel(input.classe),
  };
  return { modele: "train_tarif", corps: fill(trainTarifBody(), variables), variables };
}

export function trainChoiceSummary(input: {
  aller: TrainOffer;
  retour?: TrainOffer | null;
  classe: TrainClasse;
  tarif: TrainTarif;
}) {
  const leg = (offer: TrainOffer) => {
    const depart = trainClock(offer.heure_depart) || offer.heure_depart;
    const when = formatTrainDateFr(offer.date);
    return `${trainRouteLabel(offer.depart_gare, offer.arrivee_gare)}, train ${offer.numero}, ${when} à ${depart}`;
  };
  const back = input.retour ? ` Retour : ${leg(input.retour)}.` : "";
  return `Aller : ${leg(input.aller)}.${back} ${classeLabel(input.classe)}, tarif ${tarifLabel(input.tarif)}.`;
}

export function trainDoneBody(input: { greeting: string; summary: string }) {
  const greeting = plain(input.greeting, 80) || "cher client";
  return [
    `${greeting}, votre choix est enregistré. ${plain(input.summary, 500)}`,
    "",
    "L’agence achète les billets et vous confirme.",
    "",
    TRAIN_SIGNATURE,
  ].join("\n");
}

export function trainRepromptBody(question: string) {
  return [`Je n’ai pas reconnu ce choix. ${question}`, "", TRAIN_SIGNATURE].join("\n");
}

export function trainHandoffBody() {
  return [
    "Je transmets votre message à l’agence. Un conseiller reprend avec vous le choix des trains.",
    "",
    TRAIN_SIGNATURE,
  ].join("\n");
}

export function trainHoursAskBody(leg: TrainLeg) {
  const which = leg === "retour" ? "le retour" : "l’aller";
  return [
    `À partir de quelle heure souhaitez-vous ${which} ?`,
    "",
    "Par exemple : avant 7h, ou après 18h.",
    "",
    TRAIN_SIGNATURE,
  ].join("\n");
}

export function trainWaitBody() {
  return [
    "Nous gardons votre choix. Rien n’est acheté.",
    "",
    "Quand vous reprendrez, le prix sera revérifié avant l’achat.",
    "",
    TRAIN_SIGNATURE,
  ].join("\n");
}

export function trainRepriceNoticeBody() {
  return [
    "Nous vérifions le prix auprès de la SNCF et nous vous le confirmons avant d’acheter.",
    "",
    TRAIN_SIGNATURE,
  ].join("\n");
}

export function trainUnavailableBody(train: string) {
  return [
    `Le train ${train} n’est plus disponible. Nous n’achetons rien.`,
    "",
    "La recherche reprend. Nous vous enverrons d’autres horaires.",
    "",
    TRAIN_SIGNATURE,
  ].join("\n");
}

export function trainRefuseBody() {
  return [
    "Nous n’achetons pas ces billets.",
    "",
    "La demande est annulée. Dites-le à l’agence si vous souhaitez recommencer.",
    "",
    TRAIN_SIGNATURE,
  ].join("\n");
}

export function trainSuiteBody(kind: "echange" | "annulation") {
  const ask = kind === "annulation" ? "annulation" : "échange";
  return [
    `Nous transmettons votre demande d’${ask} à l’agence.`,
    "",
    "Les billets déjà émis ne changent pas tant que l’agence ne vous a pas confirmé les conditions.",
    "",
    TRAIN_SIGNATURE,
  ].join("\n");
}

export function fareAmount(offer: TrainOffer, classe: TrainClasse, tarif: TrainTarif) {
  const value = offer.prix?.[classe]?.[tarif];
  return typeof value === "number" ? value : null;
}

/** Prix du tarif choisi, par personne, multiplié par les voyageurs. Null si un tronçon n’a pas ce prix. */
export function quoteTotal(input: {
  aller: TrainOffer;
  retour?: TrainOffer | null;
  classe: TrainClasse;
  tarif: TrainTarif;
  voyageurs: number;
}) {
  const legs = [fareAmount(input.aller, input.classe, input.tarif)];
  if (input.retour) legs.push(fareAmount(input.retour, input.classe, input.tarif));
  if (legs.some((value) => value == null)) return null;
  const perPerson = (legs as number[]).reduce((sum, value) => sum + value, 0);
  const count = Math.max(1, Math.round(input.voyageurs) || 1);
  const total = Math.round(perPerson * count * 100) / 100;
  const people = count > 1 ? `${formatEuro(perPerson)} par personne, ${formatEuro(total)} pour ${count} voyageurs` : formatEuro(total);
  return { perPerson, total, count, libelle: people };
}

export function trainQuestionPrompt(step: TrainStep) {
  if (step === "aller" || step === "retour") {
    const which = step === "retour" ? "du retour" : "de l’aller";
    return `Choisissez un train ${which} dans la liste, ou Autres horaires.`;
  }
  if (step === "horaires") return "Indiquez l’heure souhaitée, par exemple avant 7h.";
  if (step === "classe") return "Répondez 2de classe ou 1re classe.";
  if (step === "tarif") return "Répondez Non remboursable ou Flex.";
  if (step === "accord") return "Répondez Je confirme, Modifier ou Je refuse.";
  return "";
}

export function planTrainAccord(input: { greeting: string; summary: string; total: string }): TrainPlan {
  const variables = {
    "1": plain(input.greeting, 80) || "cher client",
    "2": plain(input.summary, 500),
    "3": plain(input.total, 80),
  };
  return { modele: "train_accord", corps: fill(trainAccordBody(), variables), variables };
}

function wantsOtherHours(folded: string) {
  return (
    /\bautres? horaires?\b/.test(folded) ||
    /\bplus tot\b/.test(folded) ||
    /\bplus tard\b/.test(folded) ||
    /\b(avant|apres|a partir de|des)\s+\d{1,2}\b/.test(folded)
  );
}

function wantsDelay(folded: string) {
  if (wantsOtherHours(folded)) return false;
  return /\b(je reflechis|je verrai|demain|pas maintenant|pas tout de suite|un delai|attendez|je vous redis|on verra|laissez moi|laisser moi)\b/.test(folded);
}

function wantsResume(folded: string) {
  return /\b(on reprend|je reprends|c est bon|allez y|on y va|je confirme|d accord|oui|ok)\b/.test(folded);
}

function wantsExchange(folded: string) {
  return /\b(echange|echanger|modifier le billet|changer le billet|decaler)\b/.test(folded);
}

function wantsCancelTicket(folded: string) {
  return /\b(annul|rembours)\b/.test(folded);
}

function looksLikeQuestion(folded: string) {
  if (folded.includes("?")) return true;
  return /^(quelle|quel|quels|quelles|quand|comment|pourquoi|ou est|ou sont|ou se|hotel|vol|transfert|passeport)\b/.test(folded);
}

function matchIndex(folded: string, offers: TrainOffer[]) {
  const hits = new Set<number>();
  offers.forEach((offer, index) => {
    const number = fold(offer.numero).replace(/\s+/g, "");
    if (number.length >= 3 && folded.replace(/\s+/g, "").includes(number)) hits.add(index);
    const clock = trainClock(offer.heure_depart);
    if (!clock) return;
    const short = clock.replace(/^0/, "");
    if (folded.includes(clock) || folded.includes(short) || folded.includes(clock.replace("h", ":"))) hits.add(index);
  });
  return [...hits];
}

function matchClasse(folded: string): TrainClasse | "ambigu" | null {
  const seconde = /\b(2de|2e|2eme|seconde|deuxieme)\b/.test(folded) || /\bclasse 2\b/.test(folded) || folded === "2";
  const premiere = /\b(1re|1ere|1er|premiere)\b/.test(folded) || /\bclasse 1\b/.test(folded) || folded === "1";
  if (seconde && premiere) return "ambigu";
  if (seconde) return "2de";
  if (premiere) return "1re";
  return null;
}

function matchTarif(folded: string): TrainTarif | "ambigu" | null {
  const flex = /\bflex/.test(folded) || /\bechange/.test(folded) || /\bmodifiable\b/.test(folded);
  const locked = /non[-\s]?rembours/.test(folded) || /\bprem/.test(folded) || /\bno flex\b/.test(folded);
  const refundable = /\brembours/.test(folded);
  if (locked && (flex || (refundable && !locked))) return "ambigu";
  if (flex && refundable && !locked) return "ambigu";
  if (locked) return "non_remboursable";
  if (flex) return "flex";
  if (refundable) return "flex";
  return null;
}

export type TrainParse =
  | { kind: "index"; index: number }
  | { kind: "classe"; classe: TrainClasse }
  | { kind: "tarif"; tarif: TrainTarif }
  | { kind: "horaires" }
  | { kind: "confirme" }
  | { kind: "modifier" }
  | { kind: "refuse" }
  | { kind: "changer"; cible: "train" | "classe" | "tarif" }
  | { kind: "delai" }
  | { kind: "reprise" }
  | { kind: "contrainte"; texte: string }
  | { kind: "suite"; suite: "echange" | "annulation" }
  | { kind: "ambigu" }
  | { kind: "ignorer" };

export function parseTrainInbound(input: {
  step: TrainStep;
  offers: TrainOffer[];
  body?: string | null;
  buttonPayload?: string | null;
}): TrainParse {
  const payload = (input.buttonPayload || "").trim();
  if (payload.startsWith("train:")) {
    if (payload === TRAIN_HOURS_ID) {
      if (input.step === "aller" || input.step === "retour") return { kind: "horaires" };
      return { kind: "ambigu" };
    }
    if (input.step === "aller" || input.step === "retour") {
      const match = payload.match(/^train:(aller|retour):(\d+)$/);
      if (!match || match[1] !== input.step) return { kind: "ambigu" };
      const index = Number(match[2]);
      if (index < 0 || index >= input.offers.length) return { kind: "ambigu" };
      return { kind: "index", index };
    }
    if (input.step === "classe") {
      if (payload === "train:classe:2de") return { kind: "classe", classe: "2de" };
      if (payload === "train:classe:1re") return { kind: "classe", classe: "1re" };
      return { kind: "ambigu" };
    }
    if (input.step === "tarif") {
      if (payload === "train:tarif:non_remboursable") return { kind: "tarif", tarif: "non_remboursable" };
      if (payload === "train:tarif:flex") return { kind: "tarif", tarif: "flex" };
      return { kind: "ambigu" };
    }
    if (payload === "train:accord:confirme") return { kind: "confirme" };
    if (payload === "train:accord:modifier") return { kind: "modifier" };
    if (payload === "train:accord:refuse") return { kind: "refuse" };
    if (payload === "train:modifier:train") return { kind: "changer", cible: "train" };
    if (payload === "train:modifier:classe") return { kind: "changer", cible: "classe" };
    if (payload === "train:modifier:tarif") return { kind: "changer", cible: "tarif" };
    return { kind: "ignorer" };
  }
  const folded = fold(input.body || "").replace(/['’]/g, " ").replace(/\s+/g, " ").trim();
  if (!folded) return { kind: "ignorer" };
  if (input.step === "fait") {
    if (wantsExchange(folded)) return { kind: "suite", suite: "echange" };
    if (wantsCancelTicket(folded)) return { kind: "suite", suite: "annulation" };
    return { kind: "ignorer" };
  }
  if (input.step === "horaires") {
    if (looksLikeQuestion(folded)) return { kind: "ignorer" };
    if (folded.length < 2 || folded.length > 80) return { kind: "ambigu" };
    return { kind: "contrainte", texte: (input.body || "").replace(/\s+/g, " ").trim().slice(0, 80) };
  }
  if (input.step === "accord") {
    if (/\b(je confirme|confirme|d accord|oui)\b/.test(folded)) return { kind: "confirme" };
    if (/\b(modifier|changer|autre)\b/.test(folded)) return { kind: "modifier" };
    if (/\b(je refuse|non|pas ceux|annuler)\b/.test(folded)) return { kind: "refuse" };
  }
  if (wantsDelay(folded)) return { kind: "delai" };
  if (input.step === "aller" || input.step === "retour") {
    if (wantsOtherHours(folded)) {
      if (/\d/.test(folded)) return { kind: "contrainte", texte: (input.body || "").replace(/\s+/g, " ").trim().slice(0, 80) };
      return { kind: "horaires" };
    }
    const hits = matchIndex(folded, input.offers);
    if (hits.length === 1) return { kind: "index", index: hits[0] };
    if (hits.length > 1) return { kind: "ambigu" };
  } else if (input.step === "classe") {
    const classe = matchClasse(folded);
    if (classe === "ambigu") return { kind: "ambigu" };
    if (classe) return { kind: "classe", classe };
  } else if (input.step === "tarif") {
    const tarif = matchTarif(folded);
    if (tarif === "ambigu") return { kind: "ambigu" };
    if (tarif) return { kind: "tarif", tarif };
  }
  if (looksLikeQuestion(folded) || folded.length > 40) return { kind: "ignorer" };
  return { kind: "ambigu" };
}

export type TrainChoiceState = {
  status: string;
  step: TrainStep;
  aller: TrainOffer[];
  retour: TrainOffer[];
  choix_aller: number | null;
  choix_retour: number | null;
  classe: TrainClasse | null;
  tarif: TrainTarif | null;
  ambigu_compte: number;
  besoin_agence: boolean;
  horaire_leg?: TrainLeg | null;
};

export type TrainTurn =
  | { action: "ignorer" }
  | {
      action: "reposer" | "question" | "choix" | "agence" | "delai" | "reprise" | "refuse" | "suite" | "contrainte";
      patch: Partial<TrainChoiceState> & { status?: string; step: TrainStep };
      plan: TrainPlan;
      contrainte?: string;
      suite?: "echange" | "annulation";
    };

function sessionPlan(corps: string): TrainPlan {
  return { modele: "session", corps };
}

export function nextTrainTurn(input: {
  state: TrainChoiceState;
  greeting: string;
  depart: string;
  arrivee: string;
  body?: string | null;
  buttonPayload?: string | null;
  sessionOpen?: boolean;
  voyageurs?: number;
  placement?: string | null;
}): TrainTurn {
  const state = input.state;
  if (state.status === "commande" || state.step === "fait") {
    const parsed = parseTrainInbound({ step: "fait", offers: [], body: input.body, buttonPayload: input.buttonPayload });
    if (parsed.kind === "suite") {
      return {
        action: "suite",
        suite: parsed.suite,
        patch: { step: "fait", status: "commande" },
        plan: sessionPlan(trainSuiteBody(parsed.suite)),
      };
    }
    return { action: "ignorer" };
  }
  if (state.status === "en_attente") {
    const folded = fold(input.body || "");
    if (wantsResume(folded) || input.buttonPayload === "train:accord:confirme") {
      return {
        action: "reprise",
        patch: { status: "prix_a_reconfirmer", step: state.step },
        plan: sessionPlan(trainRepriceNoticeBody()),
      };
    }
    if (looksLikeQuestion(folded)) return { action: "ignorer" };
    return { action: "delai", patch: { status: "en_attente", step: state.step }, plan: sessionPlan(trainWaitBody()) };
  }
  if ((state.status !== "propositions" && state.status !== "prix_a_reconfirmer") || state.besoin_agence) {
    return { action: "ignorer" };
  }
  const offers = state.step === "retour" ? state.retour : state.aller;
  const parsed = parseTrainInbound({
    step: state.step,
    offers,
    body: input.body,
    buttonPayload: input.buttonPayload,
  });
  if (parsed.kind === "ignorer") return { action: "ignorer" };
  if (parsed.kind === "ambigu") {
    if (state.ambigu_compte >= 1) {
      return {
        action: "agence",
        patch: { besoin_agence: true, step: state.step },
        plan: sessionPlan(trainHandoffBody()),
      };
    }
    return {
      action: "reposer",
      patch: { ambigu_compte: state.ambigu_compte + 1, step: state.step },
      plan: sessionPlan(trainRepromptBody(trainQuestionPrompt(state.step))),
    };
  }
  const greeting = input.greeting;
  const clear = { ambigu_compte: 0, besoin_agence: false };
  const leg: TrainLeg = state.step === "retour" ? "retour" : state.horaire_leg === "retour" ? "retour" : "aller";
  if (parsed.kind === "delai") {
    return { action: "delai", patch: { ...clear, status: "en_attente", step: state.step }, plan: sessionPlan(trainWaitBody()) };
  }
  if (parsed.kind === "horaires") {
    return {
      action: "question",
      patch: { ...clear, step: "horaires", horaire_leg: state.step === "retour" ? "retour" : "aller" },
      plan: sessionPlan(trainHoursAskBody(state.step === "retour" ? "retour" : "aller")),
    };
  }
  if (parsed.kind === "contrainte") {
    return {
      action: "contrainte",
      contrainte: parsed.texte,
      patch: {
        ...clear,
        status: "recherche",
        step: "aller",
        choix_aller: null,
        choix_retour: null,
        classe: null,
        tarif: null,
        horaire_leg: leg,
      },
      plan: sessionPlan(
        [`Nous cherchons d’autres trains pour ${leg === "retour" ? "le retour" : "l’aller"}, ${parsed.texte}.`, "", TRAIN_SIGNATURE].join("\n")
      ),
    };
  }
  if (parsed.kind === "refuse") {
    return { action: "refuse", patch: { ...clear, status: "annulee", step: "fait" }, plan: sessionPlan(trainRefuseBody()) };
  }
  if (parsed.kind === "modifier") {
    return {
      action: "question",
      patch: { ...clear, step: "accord" },
      plan: {
        modele: "train_modifier",
        corps: ["Que souhaitez-vous modifier ?", "", "Le train, la classe ou le tarif. Rien n’est acheté.", "", TRAIN_SIGNATURE].join("\n"),
      },
    };
  }
  if (parsed.kind === "changer") {
    if (parsed.cible === "classe" && state.choix_aller != null) {
      const offer = state.aller[state.choix_aller];
      return { action: "question", patch: { ...clear, step: "classe", classe: null, tarif: null }, plan: planTrainClasseQuestion({ greeting, offer }) };
    }
    if (parsed.cible === "tarif" && state.classe) {
      return { action: "question", patch: { ...clear, step: "tarif", tarif: null }, plan: planTrainTarifQuestion({ greeting, classe: state.classe }) };
    }
    return {
      action: "question",
      patch: { ...clear, step: "aller", choix_aller: null, choix_retour: null, classe: null, tarif: null, status: "propositions" },
      plan: planTrainLegQuestion({
        greeting,
        route: trainRouteLabel(input.depart, input.arrivee),
        date: state.aller[0]?.date || "",
        leg: "aller",
        offers: state.aller,
        sessionOpen: true,
      }),
    };
  }
  if (parsed.kind === "confirme") {
    const aller = state.aller[state.choix_aller ?? -1];
    const retour = state.choix_retour == null ? null : state.retour[state.choix_retour] || null;
    if (!aller || !state.classe || !state.tarif) return { action: "ignorer" };
    return {
      action: "choix",
      patch: { ...clear, status: "choix", step: "fait" },
      plan: sessionPlan(
        trainDoneBody({
          greeting,
          summary: trainChoiceSummary({ aller, retour, classe: state.classe, tarif: state.tarif }),
        })
      ),
    };
  }
  if (state.step === "aller" && parsed.kind === "index") {
    const offer = state.aller[parsed.index];
    if (state.retour.length) {
      return {
        action: "question",
        patch: { ...clear, step: "retour", choix_aller: parsed.index },
        plan: planTrainLegQuestion({
          greeting,
          route: trainRouteLabel(input.arrivee, input.depart),
          date: state.retour[0]?.date || offer.date,
          leg: "retour",
          offers: state.retour,
          sessionOpen: true,
        }),
      };
    }
    return {
      action: "question",
      patch: { ...clear, step: "classe", choix_aller: parsed.index },
      plan: planTrainClasseQuestion({ greeting, offer }),
    };
  }
  if (state.step === "retour" && parsed.kind === "index") {
    const aller = state.aller[state.choix_aller ?? 0] || state.aller[0];
    return {
      action: "question",
      patch: { ...clear, step: "classe", choix_retour: parsed.index },
      plan: planTrainClasseQuestion({ greeting, offer: aller }),
    };
  }
  if (state.step === "classe" && parsed.kind === "classe") {
    return {
      action: "question",
      patch: { ...clear, step: "tarif", classe: parsed.classe },
      plan: planTrainTarifQuestion({ greeting, classe: parsed.classe }),
    };
  }
  if (state.step === "tarif" && parsed.kind === "tarif") {
    const aller = state.aller[state.choix_aller ?? -1];
    const retour = state.choix_retour == null ? null : state.retour[state.choix_retour] || null;
    if (!aller || !state.classe) return { action: "ignorer" };
    const quote = quoteTotal({
      aller,
      retour,
      classe: state.classe,
      tarif: parsed.tarif,
      voyageurs: input.voyageurs || 1,
    });
    if (!quote) {
      return {
        action: "reprise",
        patch: { ...clear, status: "prix_a_reconfirmer", step: "tarif", tarif: parsed.tarif },
        plan: sessionPlan(trainRepriceNoticeBody()),
      };
    }
    const summary = [trainChoiceSummary({ aller, retour, classe: state.classe, tarif: parsed.tarif }), input.placement || ""]
      .filter(Boolean)
      .join(" ");
    return {
      action: "question",
      patch: { ...clear, status: "propositions", step: "accord", tarif: parsed.tarif },
      plan: planTrainAccord({ greeting, summary, total: quote.libelle }),
    };
  }
  return {
    action: "reposer",
    patch: { ambigu_compte: state.ambigu_compte + 1, step: state.step },
    plan: sessionPlan(trainRepromptBody(trainQuestionPrompt(state.step))),
  };
}

export function parseTrainOffer(raw: unknown, label: string): TrainOffer | { error: string } {
  if (!raw || typeof raw !== "object") return { error: `${label} illisible.` };
  const row = raw as Record<string, unknown>;
  const text = (key: string, max: number) => (typeof row[key] === "string" ? clip(row[key] as string, max) : "");
  const numero = text("numero", 20);
  const depart = text("depart_gare", 80);
  const arrivee = text("arrivee_gare", 80);
  const date = text("date", 10);
  const heureDepart = trainClock(text("heure_depart", 8));
  const heureArrivee = trainClock(text("heure_arrivee", 8));
  if (!numero || !depart || !arrivee) return { error: `${label} : gares et numéro requis.` };
  if (!DAY.test(date)) return { error: `${label} : date invalide.` };
  if (!heureDepart || !heureArrivee) return { error: `${label} : heures invalides.` };
  const prix = parsePrix(row.prix);
  if ("error" in prix) return { error: `${label} : ${prix.error}` };
  const duree = text("duree", 20) || trainDuration(heureDepart, heureArrivee);
  return {
    numero,
    depart_gare: depart,
    arrivee_gare: arrivee,
    date,
    heure_depart: heureDepart.replace("h", ":"),
    heure_arrivee: heureArrivee.replace("h", ":"),
    ...(duree ? { duree } : {}),
    ...(prix.prix ? { prix: prix.prix } : {}),
  };
}

function money(value: unknown) {
  if (value == null || value === "") return { ok: true as const, value: null };
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value.replace(",", ".")) : NaN;
  if (!Number.isFinite(number) || number < 0 || number > 100000) return { ok: false as const };
  return { ok: true as const, value: Math.round(number * 100) / 100 };
}

function parsePrix(raw: unknown): { prix?: TrainOffer["prix"] } | { error: string } {
  if (raw == null) return {};
  if (typeof raw !== "object") return { error: "prix illisible." };
  const row = raw as Record<string, unknown>;
  const block = (value: unknown) => {
    if (value == null) return { ok: true as const, prices: null };
    if (typeof value !== "object") return { ok: false as const, prices: null };
    const source = value as Record<string, unknown>;
    const locked = money(source.non_remboursable);
    const flex = money(source.flex);
    if (!locked.ok || !flex.ok) return { ok: false as const, prices: null };
    const prices: TrainPrices = {};
    if (locked.value != null) prices.non_remboursable = locked.value;
    if (flex.value != null) prices.flex = flex.value;
    return { ok: true as const, prices: Object.keys(prices).length ? prices : null };
  };
  const seconde = block(row["2de"]);
  const premiere = block(row["1re"]);
  if (!seconde.ok || !premiere.ok) return { error: "prix illisible." };
  if (!seconde.prices && !premiere.prices) return {};
  return { prix: { ...(seconde.prices ? { "2de": seconde.prices } : {}), ...(premiere.prices ? { "1re": premiere.prices } : {}) } };
}

export function parseTrainOffers(raw: unknown, label: string, bounds: { min: number; max: number }) {
  if (!Array.isArray(raw)) return { error: `${label} : liste attendue.` };
  if (raw.length < bounds.min || raw.length > bounds.max) {
    return { error: `${label} : au moins ${bounds.min} trains, ${bounds.max} au plus. La liste WhatsApp a besoin de ce nombre par sens.` };
  }
  const offers: TrainOffer[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const parsed = parseTrainOffer(raw[index], `${label} ${index + 1}`);
    if ("error" in parsed) return parsed;
    offers.push(parsed);
  }
  return { offers };
}
