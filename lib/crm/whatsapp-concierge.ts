import {
  detailList,
  detailStr,
  documentLabel,
  hotelCityLine,
  hotelDisplayName,
  hotelStayLabel,
  itemClock,
} from "./carnet";
import { unsplashKeywordMatch } from "./covers";
import { countryName } from "./countries";
import { greetingGivenName } from "./identity";
import { encoursCaption, formatDateFr, formatMoney } from "./money";
import { siteConfig } from "../site";
import {
  BOOKING_ITEM_LABELS,
  DOC_TYPE_LABELS,
  TX_KIND_LABELS,
  type BookingItemKind,
  type CrmBooking,
  type CrmBookingDocument,
  type CrmBookingItem,
  type CrmTransaction,
  type CrmTravelDocument,
  type TransactionKind,
  type TravelDocType,
} from "./types";
import { clientVisaStepCopy, type ClientVisaStep } from "./visa-flow";
import { CONCIERGE_SIGNATURE, withConciergeSignature } from "./whatsapp";

export const UNKNOWN_NUMBER_REPLY = "L’espace s’ouvre sur invitation.";
export const HANDOFF_SENTENCE = "Je transmets à l’agence.";
/** Ton du retour, dans la même réponse, seulement si l’agence doit revenir. */
export const FOLLOW_UP_TONE = "Je regarde, je vous fais un retour rapide";
export const MISSING_FACT = "Je n’ai pas cette information dans votre dossier.";
export const MISSING_CLOCK = "Je n’ai pas l’horaire dans votre dossier.";
export const MISSING_INCLUDED = "Je n’ai pas le détail des inclus dans votre dossier.";
export const MISSING_PRICE = "Je n’ai pas ce prix dans votre dossier.";
export const MISSING_DRIVER = "Je n’ai pas de chauffeur dans votre dossier.";
export const MISSING_FORMALITY = "Je n’ai pas de formalité déposée dans votre dossier.";

export const HANDOFF_KINDS = ["change", "cancel", "payment", "formality", "chauffeur", "complaint"] as const;
export type HandoffKind = (typeof HANDOFF_KINDS)[number];

export const HANDOFF_LABELS: Record<HandoffKind, string> = {
  change: "Changement de voyage",
  cancel: "Annulation",
  payment: "Rapprochement d’un paiement",
  formality: "Dépôt d’une formalité",
  chauffeur: "Chauffeur",
  complaint: "Plainte",
};

/** Ces cinq demandes partent à l’agent. Le ton du retour ne sert qu’à elles. */
const AGENCY_HANDOFF = new Set<HandoffKind>(["change", "cancel", "payment", "formality", "chauffeur"]);

export type ReplyLang = "fr" | "en";

const VISA_STEPS = new Set<ClientVisaStep>([
  "preparation",
  "remplissage",
  "validation",
  "paiement",
  "piece",
]);

export type ConciergeCover =
  | { kind: "file"; path: string }
  | { kind: "catalog"; photoId: string };

export type ConciergeItem = {
  kind: string;
  label: string;
  lines: string[];
  clock: string;
  included: string[];
  amount: number | null;
};

export type ConciergeFormality = {
  country: string;
  name: string;
  status: string;
  copy: string;
};

export type ConciergeStay = {
  id: string;
  reference: string;
  title: string;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  totalAmount: number | null;
  currency: string;
  notesClient: string | null;
  cover: ConciergeCover | null;
  items: ConciergeItem[];
  documents: string[];
  formalities: ConciergeFormality[];
};

export type ConciergeDocument = {
  label: string;
  holder: string;
  expiresOn: string | null;
};

export type ConciergeMovement = {
  date: string;
  label: string;
  direction: "debit" | "credit";
  amount: number;
  currency: string;
  stayReference: string | null;
};

export type ConciergeBalance = {
  currency: string;
  balance: number;
};

/** Uniquement ce qui est déjà publié. Les brouillons n’y entrent pas. */
export type ConciergeDossier = {
  firstName: string;
  stays: ConciergeStay[];
  documents: ConciergeDocument[];
  movements: ConciergeMovement[];
  balances: ConciergeBalance[];
};

export type ConciergeTurn = {
  handoff: HandoffKind | null;
  bookingId: string | null;
  text: string;
  /** Toujours vide : la photo reste sur le message proactif du séjour. */
  cover: null;
  optOut: boolean;
  access: boolean;
};

type RawBooking = Pick<
  CrmBooking,
  | "id"
  | "reference"
  | "title"
  | "destination"
  | "start_date"
  | "end_date"
  | "currency"
  | "total_amount"
  | "visible_to_client"
  | "cover_image_path"
> & {
  prices_visible?: boolean | null;
  notes_client?: string | null;
  notes_internal?: string | null;
};

type RawItem = Pick<
  CrmBookingItem,
  "id" | "booking_id" | "kind" | "title" | "start_at" | "end_at" | "amount" | "details" | "visible_to_client"
>;

type RawVisa = {
  booking_id: string;
  country: string;
  status: string;
  step?: string | null;
};

type RawBalance = { currency: string; balance: number | string };

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function dateLabel(value: string | null | undefined, lang: ReplyLang = "fr") {
  if (!value) return "";
  if (lang === "en") {
    const d = new Date(value.length === 10 ? `${value.slice(0, 10)}T12:00:00` : value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-GB", { dateStyle: "medium" });
  }
  const label = formatDateFr(value.slice(0, 10));
  return label === "—" ? "" : label;
}

export function transactionsClientUrl() {
  return `${siteConfig.url}/mon-compte/transactions`;
}

/** Messages proactifs seulement. Un Stop les coupe ; une réponse au client, non. */
export function proactiveWhatsappAllowed(row: {
  whatsapp_opt_in_at?: string | null;
  whatsapp_opt_out_at?: string | null;
}) {
  return Boolean(row.whatsapp_opt_in_at) && !row.whatsapp_opt_out_at;
}

export function messageLanguage(message: string): ReplyLang {
  const text = fold(message);
  const french =
    /[àâäéèêëïîôùûüçœ]/i.test(message) ||
    /\b(je|vous|bonjour|bonsoir|sejour|merci|quel|quelle|mon|ma|mes|pas|pour|agence|horaire|prix|chauffeur|annul|encours|virement|arret|piece|coffre|souhaitez)\b/.test(
      text
    );
  const english =
    /\b(hello|hi|please|what|when|where|the|my|your|cancel|change|price|driver|balance|thanks|thank|stay|flight|hotel|unsubscribe)\b/.test(
      text
    );
  if (english && !french) return "en";
  return "fr";
}

export function isConciergeStop(message: string) {
  const text = fold(message)
    .replace(/[.!]+$/g, "")
    .trim();
  if (/^(please |svp )?(stop|arret|arrete|arretez|stoppez|desabonnez|unsubscribe)$/.test(text)) return true;
  return (
    /\b(stop|arret|arretez|stoppez|unsubscribe|desabonnez)\b/.test(text) &&
    /\b(message|messages|whatsapp|notif|notification|sms|proactif)\b/.test(text)
  );
}

export function asksForSpaceAccess(message: string) {
  const text = fold(message);
  if (/\b(password|magic link|log in|login|sign in|access link)\b/.test(text)) return true;
  if (/\bmot de passe\b/.test(text)) return true;
  return /\b(ouvr|acces|connexion|connecter|lien)\w*/.test(text) && /\b(espace|compte|connexion)\b/.test(text);
}

function publishedCover(booking: RawBooking): ConciergeCover | null {
  if (booking.cover_image_path?.trim()) {
    return { kind: "file", path: booking.cover_image_path.trim() };
  }
  const photo = unsplashKeywordMatch({
    destination: booking.destination,
    title: booking.title,
  });
  if (!photo) return null;
  return { kind: "catalog", photoId: photo };
}

function itemLines(item: RawItem, prices: boolean): ConciergeItem {
  const card = item as CrmBookingItem;
  const clock = itemClock(card.start_at);
  const endClock = itemClock(card.end_at);
  const lines: string[] = [];
  const included: string[] = [];
  if (item.kind === "hotel") {
    const name = hotelDisplayName(card);
    const city = hotelCityLine(card);
    lines.push(city ? `${name}, ${city}` : name);
    if (card.start_at) lines.push(hotelStayLabel(card));
  } else if (item.kind === "flight") {
    const from = detailStr(card, "from");
    const to = detailStr(card, "to");
    const number = detailStr(card, "flight_number");
    const route = [from, to].filter(Boolean).join(" → ");
    const head = [number, route].filter(Boolean).join(" · ");
    if (head) lines.push(head);
    else if (item.title?.trim()) lines.push(item.title.trim());
    const day = dateLabel(item.start_at);
    if (day) lines.push(clock ? `${day} à ${clock}` : day);
  } else {
    const title = item.title?.trim();
    if (title) lines.push(title);
    const day = dateLabel(item.start_at);
    if (day && clock && endClock && endClock !== clock) lines.push(`${day}, ${clock}–${endClock}`);
    else if (day && clock) lines.push(`${day} à ${clock}`);
    else if (day) lines.push(day);
  }
  const board = detailStr(card, "board");
  if (board) included.push(board);
  included.push(...detailList(card, "included"));
  if (included.length) lines.push(included.join(", "));
  const amount =
    prices && item.amount != null && Number.isFinite(Number(item.amount)) ? Number(item.amount) : null;
  return {
    kind: item.kind,
    label: BOOKING_ITEM_LABELS[item.kind as BookingItemKind] || item.kind,
    lines: lines.filter(Boolean),
    clock,
    included,
    amount,
  };
}

function formalityCopy(row: RawVisa): string {
  if (row.status === "refuse") return "La formalité a été refusée.";
  const step = row.step && VISA_STEPS.has(row.step as ClientVisaStep) ? (row.step as ClientVisaStep) : null;
  if (row.status === "piece") return clientVisaStepCopy("piece");
  if (step) return clientVisaStepCopy(step);
  if (row.status === "paye") return "Le frais d’État est enregistré.";
  if (row.status === "en_cours") return "La formalité est en cours.";
  return "";
}

export function stayClientUrl(reference: string) {
  return `${siteConfig.url}/mon-compte/reservations/${encodeURIComponent(reference)}`;
}

export function buildConciergeDossier(input: {
  firstName?: string | null;
  bookings?: RawBooking[] | null;
  items?: RawItem[] | null;
  bookingDocuments?: Pick<CrmBookingDocument, "id" | "booking_id" | "kind" | "file_name" | "visible_to_client">[] | null;
  travelDocuments?: (Pick<
    CrmTravelDocument,
    "doc_type" | "first_name" | "last_name" | "expires_on"
  > & { number?: string | null })[] | null;
  visaRequests?: RawVisa[] | null;
  transactions?: Pick<
    CrmTransaction,
    "booking_id" | "direction" | "kind" | "amount" | "currency" | "occurred_on" | "label" | "status"
  >[] | null;
  balances?: RawBalance[] | null;
}): ConciergeDossier {
  const visible = (input.bookings || []).filter((booking) => booking.visible_to_client);
  const visibleIds = new Set(visible.map((booking) => booking.id));
  const itemsByBooking = new Map<string, RawItem[]>();
  for (const item of input.items || []) {
    if (!visibleIds.has(item.booking_id) || item.visible_to_client === false) continue;
    if (item.kind === "fee" || item.kind === "expense") continue;
    const list = itemsByBooking.get(item.booking_id) || [];
    list.push(item);
    itemsByBooking.set(item.booking_id, list);
  }
  const docsByBooking = new Map<string, string[]>();
  for (const doc of input.bookingDocuments || []) {
    if (!visibleIds.has(doc.booking_id) || !doc.visible_to_client) continue;
    const related = (itemsByBooking.get(doc.booking_id) || []) as CrmBookingItem[];
    const label = documentLabel(doc as CrmBookingDocument, related);
    const list = docsByBooking.get(doc.booking_id) || [];
    list.push(label);
    docsByBooking.set(doc.booking_id, list);
  }
  const visasByBooking = new Map<string, ConciergeFormality[]>();
  for (const row of input.visaRequests || []) {
    if (!visibleIds.has(row.booking_id)) continue;
    const copy = formalityCopy(row);
    if (!copy) continue;
    const list = visasByBooking.get(row.booking_id) || [];
    list.push({
      country: row.country,
      name: countryName(row.country) || row.country,
      status: row.status,
      copy,
    });
    visasByBooking.set(row.booking_id, list);
  }

  const stays: ConciergeStay[] = visible.map((booking) => {
    const prices = booking.prices_visible === true;
    const items = (itemsByBooking.get(booking.id) || []).map((item) => itemLines(item, prices));
    return {
      id: booking.id,
      reference: booking.reference,
      title: booking.title,
      destination: booking.destination,
      startDate: booking.start_date,
      endDate: booking.end_date,
      totalAmount:
        prices && Number.isFinite(Number(booking.total_amount)) ? Number(booking.total_amount) : null,
      currency: booking.currency || "EUR",
      notesClient: booking.notes_client?.trim() || null,
      cover: publishedCover(booking),
      items,
      documents: docsByBooking.get(booking.id) || [],
      formalities: visasByBooking.get(booking.id) || [],
    };
  });

  const stayRef = new Map(stays.map((stay) => [stay.id, stay.reference]));
  const documents: ConciergeDocument[] = (input.travelDocuments || []).map((doc) => ({
    label: DOC_TYPE_LABELS[doc.doc_type as TravelDocType] || doc.doc_type,
    holder: [doc.first_name, doc.last_name].filter(Boolean).join(" ").trim(),
    expiresOn: doc.expires_on,
  }));
  const movements: ConciergeMovement[] = (input.transactions || [])
    .filter((row) => row.status === "posted")
    .map((row) => ({
      date: row.occurred_on,
      label: row.label?.trim() || TX_KIND_LABELS[row.kind as TransactionKind] || row.kind,
      direction: row.direction,
      amount: Number(row.amount),
      currency: row.currency || "EUR",
      stayReference: row.booking_id ? stayRef.get(row.booking_id) || null : null,
    }));
  const balances: ConciergeBalance[] = (input.balances || []).map((row) => ({
    currency: row.currency || "EUR",
    balance: Number(row.balance),
  }));

  return {
    firstName: greetingGivenName(input.firstName) || "",
    stays,
    documents,
    movements,
    balances,
  };
}

/** Texte du contexte : sert aux tests, le Concierge ne lit rien d’autre. */
export function conciergeContextText(dossier: ConciergeDossier) {
  return JSON.stringify(dossier);
}

export function classifyHandoff(message: string): HandoffKind | null {
  const text = fold(message);
  if (/\b(annuler|annulez|annulation|annule|cancel|cancellation)\b/.test(text)) return "cancel";
  if (
    /\b(modifier|modification|modifiez|changer|changez|changement|decalez|decaler|reporter|reportez|deplacer|deplacez)\b/.test(
      text
    ) ||
    (/\b(change|modify|reschedule)\b/.test(text) && /\b(trip|stay|booking|dates?|hotel|flight|sejour)\b/.test(text))
  ) {
    return "change";
  }
  if (/rapproch/.test(text)) return "payment";
  if (/\b(vire|virement|transfer|wire)\b/.test(text) && /\b(fait|effectue|envoye|recu|passe|sent|made|paid)\b/.test(text)) {
    return "payment";
  }
  if (/\b(creditez|crediter|reconcile)\b/.test(text)) return "payment";
  const aboutFormality = /visa|esta|\beta\b|formalit|autorisation/.test(text);
  if (
    aboutFormality &&
    (/\b(depos|lanc|rempli|file|submit|apply)\w*/.test(text) ||
      /faire la demande|fais la demande|occupez/.test(text) ||
      /\bje (veux|voudrais|souhaite)\b/.test(text) ||
      /\bi (want|would like) to\b/.test(text))
  ) {
    return "formality";
  }
  if (
    /chauffeur|\bvtc\b|\bdriver\b/.test(text) &&
    /command|reserv|envoy|besoin|voudrais|veux|prend|organis|book|need|want|arrange/.test(text)
  ) {
    return "chauffeur";
  }
  return null;
}

export function isComplaint(message: string) {
  const text = fold(message);
  return /plainte|mecontent|decu|inacceptable|scandale|pas content|complaint|unhappy|unacceptable|disappointed|disgusted/.test(
    text
  );
}

function focusStay(message: string, stays: ConciergeStay[]) {
  if (!stays.length) return null;
  const text = fold(message);
  const byRef = stays.find((stay) => text.includes(fold(stay.reference)));
  if (byRef) return byRef;
  const hits = stays.filter((stay) => {
    const words = fold(`${stay.title} ${stay.destination || ""}`)
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 3);
    return words.some((word) => text.includes(word));
  });
  if (hits.length === 1) return hits[0];
  if (stays.length === 1) return stays[0];
  return null;
}

function nextStay(stays: ConciergeStay[]) {
  if (!stays.length) return null;
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = stays.filter((stay) => (stay.endDate || stay.startDate || "") >= today);
  if (upcoming.length) {
    return [...upcoming].sort((a, b) => (a.startDate || "9999").localeCompare(b.startDate || "9999"))[0];
  }
  return [...stays].sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""))[0];
}

function stayHeadline(stay: ConciergeStay, lang: ReplyLang) {
  const place = stay.destination || stay.title;
  const start = dateLabel(stay.startDate, lang);
  const end = dateLabel(stay.endDate, lang);
  const dates =
    start && end ? (lang === "en" ? `${start} to ${end}` : `du ${start} au ${end}`) : start || end;
  const label = lang === "en" ? "Stay" : "Séjour";
  return [`${label} ${stay.reference}`, place, dates].filter(Boolean).join(", ");
}

function describeStay(stay: ConciergeStay, lang: ReplyLang) {
  const lines = [stayHeadline(stay, lang)];
  for (const item of stay.items) {
    if (!item.lines.length) continue;
    lines.push(`${item.label} — ${item.lines.join(", ")}`);
  }
  for (const doc of stay.documents) lines.push(doc);
  if (stay.notesClient) lines.push(stay.notesClient);
  lines.push(stayClientUrl(stay.reference));
  return lines.join("\n");
}

function whichStayText(stays: ConciergeStay[], lang: ReplyLang) {
  const refs = stays
    .map((stay) => (stay.destination ? `${stay.reference} (${stay.destination})` : stay.reference))
    .join(", ");
  if (lang === "en") {
    return `You have several published stays: ${refs}. Which one do you mean?`;
  }
  return `Vous avez plusieurs séjours publiés : ${refs}. Lequel vous intéresse ?`;
}

function moneyLabel(amount: number, currency: string, lang: ReplyLang) {
  if (lang === "fr") return formatMoney(amount, currency);
  return amount.toLocaleString("en-GB", { style: "currency", currency: currency || "EUR" });
}

function sign(body: string) {
  const trimmed = body.replace(/\s+$/u, "").trim();
  const signed = withConciergeSignature(trimmed);
  if (signed.length <= 1500) return signed;
  const room = Math.max(40, 1500 - CONCIERGE_SIGNATURE.length - 2);
  return withConciergeSignature(trimmed.slice(0, room).trim());
}

/** Une seule réponse : le ton du retour, puis ce que l’agence reprend. */
export function conciergeFollowUp(detail: string, lang: ReplyLang = "fr") {
  const tone =
    lang === "en" ? "I’ll look into it and come back to you shortly" : FOLLOW_UP_TONE;
  return sign(`${tone}\n${detail.trim()}`);
}

function topicOf(message: string) {
  const text = fold(message);
  if (/encours|solde|reste a payer|avoir|credit disponible|combien je dois|balance|amount due|how much do i owe/.test(text)) {
    return "balance";
  }
  if (/transaction|virement|releve|mouvement|statement/.test(text)) return "transactions";
  if (/passeport|piece|document|carte d.identite|coffre|passport/.test(text)) return "documents";
  if (/visa|esta|\beta\b|formalit|autorisation/.test(text)) return "formality";
  if (/horaire|a quelle heure|quelle heure|a quelle h|what time|which time|departure time|arrival time/.test(text)) {
    return "schedule";
  }
  if (/inclus|petit.dejeuner|pension|demi.pension|included|breakfast|half board/.test(text)) return "included";
  if (/prix|tarif|combien coute|montant|price|how much|cost/.test(text)) return "price";
  if (/chauffeur|\bvtc\b|\bdriver\b/.test(text)) return "chauffeur";
  if (
    /sejour|voyage|hotel|vol\b|train|reservation|carnet|destination|quand|ou est|ou sejour|stay|flight|trip|when is|where is/.test(
      text
    )
  ) {
    return "stay";
  }
  if (/^\s*(bonjour|bonsoir|salut|hello|hi|coucou|good morning|good evening)\b/.test(text)) return "hello";
  return "unknown";
}

const THIN_FR = [
  MISSING_FACT,
  MISSING_CLOCK,
  MISSING_INCLUDED,
  MISSING_PRICE,
  MISSING_DRIVER,
  MISSING_FORMALITY,
  "Je n’ai pas de séjour publié",
  "Je n’ai pas d’encours",
  "Je n’ai aucun mouvement",
  "Je n’ai aucune pièce",
  "Je n’ai pas cette information",
];

function answerIsThin(body: string) {
  return THIN_FR.some((sentence) => body.includes(sentence)) || body.includes("I don’t have");
}

/** Conseil général, jamais un fait du séjour. */
function generalAdvice(message: string, lang: ReplyLang) {
  const text = fold(message);
  if (/hotel|sejour|chambre|vol\b|flight|booking|chauffeur|driver|visa|esta|prix|price|horaire/.test(text)) {
    return null;
  }
  if (/prise|adaptateur|voltage|\bplug\b|adapter/.test(text)) {
    return lang === "en"
      ? "In mainland France, sockets are type C and E, 230 volts. A simple adapter is enough for most European plugs."
      : "En France métropolitaine, les prises sont de type C et E, en 230 volts. Un adaptateur simple suffit pour la plupart des prises européennes.";
  }
  return null;
}

function balanceCaption(amount: number, lang: ReplyLang) {
  if (lang === "fr") return encoursCaption(amount);
  if (!Number.isFinite(amount) || amount === 0) return "Account settled";
  if (amount < 0) return "Amount due";
  return "Credit";
}

function balanceText(dossier: ConciergeDossier, lang: ReplyLang) {
  const link = transactionsClientUrl();
  if (!dossier.balances.length) {
    return lang === "en"
      ? `I don’t have a balance on your account.\n${link}`
      : `Je n’ai pas d’encours enregistré sur votre compte.\n${link}`;
  }
  const lines = dossier.balances.map(
    (row) => `${balanceCaption(row.balance, lang)} : ${moneyLabel(row.balance, row.currency, lang)}`
  );
  return `${lines.join("\n")}\n${link}`;
}

function movementText(dossier: ConciergeDossier, lang: ReplyLang) {
  const link = transactionsClientUrl();
  if (!dossier.movements.length) {
    return lang === "en"
      ? `I don’t have any posted movements on your account.\n${link}`
      : `Je n’ai aucun mouvement enregistré sur votre compte.\n${link}`;
  }
  const lines = dossier.movements.slice(0, 8).map((row) => {
    const signMark = row.direction === "credit" ? "+" : "−";
    const stay = row.stayReference ? ` · ${row.stayReference}` : "";
    return `• ${dateLabel(row.date, lang)} — ${row.label}${stay} — ${signMark}${moneyLabel(row.amount, row.currency, lang)}`;
  });
  const title = lang === "en" ? "Your latest movements :" : "Vos derniers mouvements :";
  return `${title}\n${lines.join("\n")}\n${link}`;
}

function documentText(dossier: ConciergeDossier, lang: ReplyLang) {
  if (!dossier.documents.length) {
    return lang === "en" ? "I don’t have any papers in your file." : "Je n’ai aucune pièce au coffre.";
  }
  const lines = dossier.documents.map((doc) => {
    const who = doc.holder ? `, ${doc.holder}` : "";
    const expiry = dateLabel(doc.expiresOn, lang);
    if (!expiry) return `${doc.label}${who}`;
    return lang === "en" ? `${doc.label}${who}, expires ${expiry}` : `${doc.label}${who}, expire le ${expiry}`;
  });
  const title = lang === "en" ? "In your file :" : "Au coffre :";
  return `${title}\n${lines.join("\n")}`;
}

function formalityText(message: string, dossier: ConciergeDossier, lang: ReplyLang) {
  const stay = focusStay(message, dossier.stays);
  if (!stay && dossier.stays.length > 1) return whichStayText(dossier.stays, lang);
  const pool = stay ? [stay] : dossier.stays;
  const rows = pool.flatMap((row) => row.formalities.map((formality) => ({ stay: row, formality })));
  if (!rows.length) return lang === "en" ? "I don’t have a filed formality in your file." : MISSING_FORMALITY;
  return rows
    .map((row) => {
      const label = lang === "en" ? "Stay" : "Séjour";
      return `${label} ${row.stay.reference}, ${row.formality.name} : ${row.formality.copy}\n${stayClientUrl(row.stay.reference)}`;
    })
    .join("\n\n");
}

function scheduleText(message: string, dossier: ConciergeDossier, lang: ReplyLang) {
  const stay = focusStay(message, dossier.stays);
  if (!stay && dossier.stays.length > 1) return whichStayText(dossier.stays, lang);
  const pool = stay ? [stay] : dossier.stays;
  const known = pool.flatMap((row) =>
    row.items.filter((item) => item.clock).map((item) => `${row.reference} — ${item.label} — ${item.lines.join(", ")}`)
  );
  if (!known.length) return lang === "en" ? "I don’t have the time in your file." : MISSING_CLOCK;
  const link = stay ? `\n${stayClientUrl(stay.reference)}` : "";
  return `${known.join("\n")}${link}`;
}

function includedText(message: string, dossier: ConciergeDossier, lang: ReplyLang) {
  const stay = focusStay(message, dossier.stays);
  if (!stay && dossier.stays.length > 1) return whichStayText(dossier.stays, lang);
  const pool = stay ? [stay] : dossier.stays;
  const known = pool.flatMap((row) =>
    row.items
      .filter((item) => item.included.length)
      .map((item) => `${row.reference} — ${item.label} — ${item.included.join(", ")}`)
  );
  if (!known.length) return lang === "en" ? "I don’t have the inclusions in your file." : MISSING_INCLUDED;
  const link = stay ? `\n${stayClientUrl(stay.reference)}` : "";
  return `${known.join("\n")}${link}`;
}

function priceText(message: string, dossier: ConciergeDossier, lang: ReplyLang) {
  const stay = focusStay(message, dossier.stays);
  if (!stay && dossier.stays.length > 1) return whichStayText(dossier.stays, lang);
  if (!stay) {
    const priced = dossier.stays.filter((row) => row.totalAmount != null);
    if (!priced.length) return lang === "en" ? "I don’t have that price in your file." : MISSING_PRICE;
    return priced
      .map((row) => `${row.reference} : ${moneyLabel(row.totalAmount || 0, row.currency, lang)}\n${stayClientUrl(row.reference)}`)
      .join("\n");
  }
  if (stay.totalAmount == null) return lang === "en" ? "I don’t have that price in your file." : MISSING_PRICE;
  return `${stay.reference} : ${moneyLabel(stay.totalAmount, stay.currency, lang)}\n${stayClientUrl(stay.reference)}`;
}

function chauffeurText(message: string, dossier: ConciergeDossier, lang: ReplyLang) {
  const stay = focusStay(message, dossier.stays);
  if (!stay && dossier.stays.length > 1) return whichStayText(dossier.stays, lang);
  const pool = stay ? [stay] : dossier.stays;
  const known = pool.flatMap((row) =>
    row.items
      .filter((item) => item.kind === "chauffeur")
      .map((item) => `${row.reference} — ${item.lines.join(", ") || item.label}`)
  );
  if (!known.length) return lang === "en" ? "I don’t have a driver in your file." : MISSING_DRIVER;
  const link = stay ? `\n${stayClientUrl(stay.reference)}` : "";
  return `${known.join("\n")}${link}`;
}

function stayText(message: string, dossier: ConciergeDossier, lang: ReplyLang) {
  const stay = focusStay(message, dossier.stays);
  if (stay) return describeStay(stay, lang);
  if (!dossier.stays.length) {
    return lang === "en" ? "I don’t have a published stay on your account." : "Je n’ai pas de séjour publié sur votre compte.";
  }
  if (dossier.stays.length > 1) return whichStayText(dossier.stays, lang);
  return describeStay(dossier.stays[0], lang);
}

function helloText(dossier: ConciergeDossier, lang: ReplyLang) {
  const hello =
    lang === "en"
      ? dossier.firstName
        ? `Hello ${dossier.firstName},`
        : "Hello,"
      : dossier.firstName
        ? `Bonjour ${dossier.firstName},`
        : "Bonjour,";
  if (dossier.stays.length > 1) return `${hello}\n${whichStayText(dossier.stays, lang)}`;
  const stay = dossier.stays.length === 1 ? dossier.stays[0] : nextStay(dossier.stays);
  if (!stay) {
    const none = lang === "en" ? "I don’t have a published stay on your account." : "Je n’ai pas de séjour publié sur votre compte.";
    return `${hello}\n${none}`;
  }
  return `${hello}\n${describeStay(stay, lang)}`;
}

function subjectStay(message: string, dossier: ConciergeDossier, topic: string) {
  if (topic === "balance" || topic === "transactions" || topic === "documents" || topic === "unknown") return null;
  const focused = focusStay(message, dossier.stays);
  if (focused) return focused;
  if (dossier.stays.length === 1) return dossier.stays[0];
  return null;
}

function offerAgency(lang: ReplyLang) {
  return lang === "en"
    ? "I don’t have that information. Would you like me to ask the agency?"
    : "Je n’ai pas cette information. Souhaitez-vous que j’en parle à l’agence ?";
}

function handoffSentence(lang: ReplyLang) {
  return lang === "en" ? "I’m passing this to the agency." : HANDOFF_SENTENCE;
}

function stopText(lang: ReplyLang) {
  return lang === "en"
    ? "The agency’s proactive messages are stopped. Write whenever you like, I will still reply."
    : "Les messages de l’agence sont coupés. Écrivez quand vous voulez, je vous réponds.";
}

export function accessLinkReply(lang: ReplyLang, url: string | null) {
  if (url && !url.startsWith("https://")) return accessLinkReply(lang, null);
  if (lang === "en") {
    if (!url) return sign("I can’t open your space from here. I can ask the agency for a new access link.");
    return sign(`Here is a new access link. It is not your password.\n${url}`);
  }
  if (!url) return sign("Je n’ouvre pas votre espace d’ici. Je peux demander à l’agence un nouveau lien d’accès.");
  return sign(`Voici un nouveau lien d’accès. Ce n’est pas votre mot de passe.\n${url}`);
}

export function pieceSavedLine(lang: ReplyLang) {
  return lang === "en" ? "Your document is saved with your papers." : "Votre pièce est enregistrée dans votre coffre.";
}

export function panRefusedReply(lang: ReplyLang) {
  const body =
    lang === "en"
      ? "I don’t keep card numbers. Send the document without them, or I can ask the agency."
      : "Je ne conserve pas de numéro de carte. Envoyez la pièce sans ces chiffres, ou je peux en parler à l’agence.";
  return sign(body);
}

export function planConciergeTurn(message: string, dossier: ConciergeDossier): ConciergeTurn {
  const lang = messageLanguage(message);
  const empty = { cover: null as null, optOut: false, access: false };

  if (isConciergeStop(message) && !classifyHandoff(message)) {
    return { ...empty, handoff: null, bookingId: null, text: sign(stopText(lang)), optOut: true };
  }
  if (asksForSpaceAccess(message) && !classifyHandoff(message)) {
    return { ...empty, handoff: null, bookingId: null, text: "", access: true };
  }

  const handoff = classifyHandoff(message);
  if (handoff && AGENCY_HANDOFF.has(handoff)) {
    const stay = focusStay(message, dossier.stays);
    const sentence = handoffSentence(lang);
    const which = !stay && dossier.stays.length > 1 ? `\n${whichStayText(dossier.stays, lang)}` : "";
    const focused = stay
      ? lang === "en"
        ? `\nThis is about stay ${stay.reference}.\n${stayClientUrl(stay.reference)}`
        : `\nCela concerne le séjour ${stay.reference}.\n${stayClientUrl(stay.reference)}`
      : "";
    return {
      ...empty,
      handoff,
      bookingId: stay?.id || null,
      text: conciergeFollowUp(`${sentence}${focused}${which}`, lang),
    };
  }

  const topic = topicOf(message);
  let body = lang === "en" ? "I don’t have that information in your file." : MISSING_FACT;
  if (topic === "balance") body = balanceText(dossier, lang);
  else if (topic === "transactions") body = movementText(dossier, lang);
  else if (topic === "documents") body = documentText(dossier, lang);
  else if (topic === "formality") body = formalityText(message, dossier, lang);
  else if (topic === "schedule") body = scheduleText(message, dossier, lang);
  else if (topic === "included") body = includedText(message, dossier, lang);
  else if (topic === "price") body = priceText(message, dossier, lang);
  else if (topic === "chauffeur") body = chauffeurText(message, dossier, lang);
  else if (topic === "stay") body = stayText(message, dossier, lang);
  else if (topic === "hello") body = helloText(dossier, lang);
  else {
    body = generalAdvice(message, lang) || offerAgency(lang);
  }

  const complaint = isComplaint(message);
  const thin = answerIsThin(body) || body.includes("Lequel vous intéresse") || body.includes("Which one do you mean");
  if (complaint && thin) {
    body = `${body}\n${handoffSentence(lang)}`;
    const stay = subjectStay(message, dossier, topic);
    return {
      ...empty,
      handoff: "complaint",
      bookingId: stay?.id || null,
      text: sign(body),
    };
  }

  const stay = subjectStay(message, dossier, topic);
  return {
    ...empty,
    handoff: null,
    bookingId: stay?.id || null,
    text: sign(body),
  };
}
