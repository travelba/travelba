import {
  detailList,
  detailStr,
  documentLabel,
  hotelCityLine,
  hotelDisplayName,
  hotelStayLabel,
  itemClock,
} from "./carnet";
import { placeWithPreposition, stayDestinationLine, stayDestinationNames } from "./stay-phrase";
import {
  airportSpokenName,
  englishLongDate,
  englishWeekday,
  frenchLongDate,
  frenchWeekday,
  parisMoment,
  relativeWhen,
  segmentDate,
} from "./concierge-when";
import { unsplashKeywordMatch } from "./covers";
import { countryName } from "./countries";
import { greetingGivenName } from "./identity";
import { shownClientNote } from "./public-booking";
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
import { stayCoverUrl, whatsappTypeImageUrl, type WhatsappImageKind } from "./concierge-notices";
import { CONCIERGE_SIGNATURE, withConciergeSignature } from "./whatsapp";

export const HANDOFF_SENTENCE = "Je transmets à l’agence.";
/** Ton du retour, dans la même réponse, seulement si l’agence doit revenir. */
export const FOLLOW_UP_TONE = "Je regarde, je vous fais un retour rapide";
export const MISSING_FACT = "Je n’ai pas cette information dans votre dossier.";
export const MISSING_CLOCK = "Je n’ai pas l’horaire dans votre dossier.";
export const MISSING_INCLUDED = "Je n’ai pas le détail des inclus dans votre dossier.";
export const MISSING_PRICE = "Je n’ai pas ce prix dans votre dossier.";
export const MISSING_DRIVER = "Je n’ai pas de chauffeur dans votre dossier.";
export const MISSING_FORMALITY = "Je n’ai pas de formalité déposée dans votre dossier.";

export const HANDOFF_KINDS = [
  "change",
  "cancel",
  "payment",
  "formality",
  "chauffeur",
  "complaint",
  "question",
  "quote",
  "urgent",
  "lead",
] as const;
export type HandoffKind = (typeof HANDOFF_KINDS)[number];

export const HANDOFF_LABELS: Record<HandoffKind, string> = {
  change: "Changement de voyage",
  cancel: "Annulation",
  payment: "Rapprochement d’un paiement",
  formality: "Dépôt d’une formalité",
  chauffeur: "Chauffeur",
  complaint: "Plainte",
  question: "Question à l’agence",
  quote: "Nouveau voyage",
  urgent: "Urgence en voyage",
  lead: "Prospect",
};

/** Ces cinq demandes partent à l’agent. Le ton du retour ne sert qu’à elles. */
const AGENCY_HANDOFF = new Set<HandoffKind>([
  "change",
  "cancel",
  "payment",
  "formality",
  "chauffeur",
  "quote",
  "urgent",
]);

export type ReplyLang = "fr" | "en" | "he";

function say(lang: ReplyLang, text: Record<ReplyLang, string>) {
  return text[lang];
}

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
  date: string | null;
  weekday: string;
  flightNumber: string;
  terminal: string;
  fromPlace: string;
  toPlace: string;
  fromCode: string;
  toCode: string;
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
  /** Code /v/CODE : la photo du séjour ne s’envoie qu’avec lui. */
  shareCode: string | null;
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
  /** Image du sujet : billet, visa, hôtel… La couverture du lieu seulement pour le séjour lui-même. */
  cover: string | null;
  optOut: boolean;
  access: boolean;
  tools?: string[];
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
  share_code?: string | null;
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
  if (/[\u0590-\u05FF]/.test(message)) return "he";
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

export function leadReply(lang: ReplyLang) {
  return withConciergeSignature(
    say(lang, {
      fr: "Bonjour,\nVotre message est bien arrivé. Un conseiller de l’agence vous répond.",
      en: "Hello,\nYour message has arrived. An advisor from the agency will reply.",
      he: "שלום,\nההודעה התקבלה. יועץ של הסוכנות יחזור אליכם.",
    })
  );
}

/** Réponse française au numéro inconnu. Prospect, pas une invitation. */
export const UNKNOWN_NUMBER_REPLY = leadReply("fr");

export function sharedPhoneReply(lang: ReplyLang) {
  return withConciergeSignature(
    say(lang, {
      fr: "Ce numéro est sur plusieurs fiches. Je transmets à l’agence, sans ouvrir de dossier.",
      en: "This number is on several files. I’m passing it to the agency, without opening one.",
      he: "המספר הזה מופיע בכמה כרטיסים. אני מעביר לסוכנות, בלי לפתוח תיק.",
    })
  );
}

export function rateLimitedReply(lang: ReplyLang) {
  return withConciergeSignature(
    say(lang, {
      fr: "J’ai bien reçu. Je réponds au prochain message dans un instant.",
      en: "I’ve received it. I’ll answer the next message in a moment.",
      he: "קיבלתי. אענה להודעה הבאה בעוד רגע.",
    })
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
  const date = segmentDate(item.start_at);
  const weekday = date ? frenchWeekday(date) : "";
  const fromPlace = detailStr(card, "city_from");
  const toPlace = detailStr(card, "city_to") || (item.kind === "hotel" ? hotelCityLine(card) : "");
  const fromCode = detailStr(card, "from").toUpperCase();
  const toCode = detailStr(card, "to").toUpperCase();
  const flightNumber = item.kind === "flight" ? detailStr(card, "flight_number") : "";
  const terminalRaw = detailStr(card, "terminal") || detailStr(card, "departure_terminal");
  const terminal = /^[A-Za-z0-9]{1,4}$/.test(terminalRaw) ? terminalRaw : "";
  if (item.kind === "hotel") {
    const name = hotelDisplayName(card);
    const city = hotelCityLine(card);
    lines.push(city ? `${name}, ${city}` : name);
    if (card.start_at) lines.push(hotelStayLabel(card));
    if (date) lines.push(`${weekday} ${frenchLongDate(date)}`);
  } else if (item.kind === "flight") {
    const when = [weekday, date ? frenchLongDate(date) : "", clock ? `à ${clock}` : ""].filter(Boolean).join(" ");
    const head = [flightNumber, when, terminal ? `terminal ${terminal}` : ""].filter(Boolean).join(", ");
    if (head) lines.push(head);
    else if (item.title?.trim()) lines.push(item.title.trim());
  } else {
    const title = item.title?.trim();
    if (title) lines.push(title);
    const day = date ? `${weekday} ${frenchLongDate(date)}` : dateLabel(item.start_at);
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
    date,
    weekday,
    flightNumber,
    terminal,
    fromPlace,
    toPlace,
    fromCode,
    toCode,
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
      notesClient: shownClientNote(booking.notes_client),
      cover: publishedCover(booking),
      shareCode: typeof booking.share_code === "string" && booking.share_code ? booking.share_code : null,
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
  if (/\b(annuler|annulez|annulation|annule|cancel|cancellation)\b/.test(text) || /לבטל|ביטול/.test(message)) {
    return "cancel";
  }
  if (
    /\b(modifier|modification|modifiez|changer|changez|changement|decalez|decaler|reporter|reportez|deplacer|deplacez)\b/.test(
      text
    ) ||
    (/\b(change|modify|reschedule)\b/.test(text) && /\b(trip|stay|booking|dates?|hotel|flight|sejour)\b/.test(text)) ||
    /\b(surclass\w*|upgrade)\b/.test(text) ||
    /לשנות|שינוי/.test(message)
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
  if (/\burgent\b|\burgence\b|\bbloque\b|\bau secours\b|\bsos\b|\bemergency\b|\bstranded\b/.test(text) || /דחוף/.test(message)) {
    return "urgent";
  }
  if (
    /\bdevis\b|\bnouveau (sejour|voyage)\b|\borganiser un (sejour|voyage)\b|\bquote\b|\bnew trip\b/.test(text) ||
    /הצעת מחיר|טיול חדש/.test(message)
  ) {
    return "quote";
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
  const place =
    stayDestinationLine({ destination: stay.destination, title: stay.title }) || stay.destination || stay.title;
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
  return say(lang, {
    fr: `Vous avez plusieurs séjours publiés : ${refs}. Lequel vous intéresse ?`,
    en: `You have several published stays: ${refs}. Which one do you mean?`,
    he: `יש כמה שהיות שפורסמו: ${refs}. על איזו מהן מדובר?`,
  });
}

function moneyLabel(amount: number, currency: string, lang: ReplyLang) {
  return formatMoney(amount, currency, { lang: lang === "en" ? "en" : "fr" });
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
  const tone = say(lang, {
    fr: FOLLOW_UP_TONE,
    en: "I’ll look into it and come back to you shortly",
    he: "אני בודק ואחזור אליכם בקרוב",
  });
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

function stayCities(stay: ConciergeStay) {
  return stayDestinationNames({ destination: stay.destination, title: stay.title });
}

function cityIsStay(name: string, stays: ConciergeStay[]) {
  const key = fold(name);
  if (!key) return false;
  return stays.some((stay) => stayCities(stay).some((city) => fold(city) === key) || fold(stay.destination || "") === key);
}

/** Villes de départ, escales et aéroports : interdits dans le texte au client. */
export function forbiddenClientPlaces(dossier: ConciergeDossier) {
  const found = new Set<string>();
  const add = (value: string) => {
    const clean = value.trim();
    if (clean) found.add(clean);
  };
  for (const stay of dossier.stays) {
    for (const item of stay.items) {
      if (!cityIsStay(item.fromPlace, dossier.stays)) add(item.fromPlace);
      if (item.toPlace && !cityIsStay(item.toPlace, dossier.stays)) add(item.toPlace);
      add(item.fromCode);
      add(item.toCode);
      add(airportSpokenName(item.fromCode));
      add(airportSpokenName(item.toCode));
    }
  }
  return [...found];
}

export function replyMentionsForbiddenPlace(text: string, dossier: ConciergeDossier) {
  const folded = fold(text);
  for (const place of forbiddenClientPlaces(dossier)) {
    const token = fold(place);
    if (token.length < 3) continue;
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`).test(folded)) return true;
  }
  return false;
}

function citedDates(text: string) {
  const folded = fold(text);
  const found = new Set<string>();
  const months = [
    "janvier",
    "fevrier",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "aout",
    "septembre",
    "octobre",
    "novembre",
    "decembre",
  ];
  for (const match of folded.matchAll(/\b(\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)(?:\s+(\d{4}))?/g)) {
    const month = months.indexOf(match[2]) + 1;
    const year = match[3] || "";
    const day = match[1].padStart(2, "0");
    if (year) found.add(`${year}-${String(month).padStart(2, "0")}-${day}`);
    else found.add(`--${String(month).padStart(2, "0")}-${day}`);
  }
  for (const match of text.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)) found.add(match[1]);
  return found;
}

function sameCalendarDay(cited: string, iso: string) {
  if (cited.startsWith("--")) return cited.slice(2) === iso.slice(5);
  return cited === iso;
}

/** Le modèle a cité un autre jour, un autre vol ou une autre heure que le jour demandé. */
export function replyMissesAskedDay(message: string, text: string, dossier: ConciergeDossier, now: Date = new Date()) {
  const when = relativeWhen(message, now);
  if (!when || when.kind !== "date") return false;
  const target = when.date;
  for (const cited of citedDates(text)) {
    if (!sameCalendarDay(cited, target)) return true;
  }
  const onTarget = new Set<string>();
  const elsewhere = new Set<string>();
  const clocksOn = new Set<string>();
  const clocksOff = new Set<string>();
  for (const stay of dossier.stays) {
    for (const item of stay.items) {
      const onDay = item.date === target;
      const bucket = onDay ? onTarget : elsewhere;
      const clocks = onDay ? clocksOn : clocksOff;
      if (item.flightNumber) bucket.add(fold(item.flightNumber));
      for (const clock of clockKeys(item.clock)) clocks.add(clock);
    }
  }
  const folded = fold(text);
  for (const token of elsewhere) {
    if (!token || onTarget.has(token)) continue;
    if (folded.includes(token)) return true;
  }
  for (const clock of clockKeys(text)) {
    if (clocksOff.has(clock) && !clocksOn.has(clock)) return true;
  }
  return false;
}

function clockKeys(value: string) {
  const found = new Set<string>();
  const re = /(?<![\d])([01]?\d|2[0-3])\s*(?:heures?|[h:])\s*([0-5]\d)(?!\d)/gi;
  for (const match of value.matchAll(re)) found.add(`${match[1].padStart(2, "0")}:${match[2]}`);
  return found;
}

export function conciergeBrief(dossier: ConciergeDossier, now: Date = new Date()) {
  const today = parisMoment(now);
  const lines = [
    `Aujourd’hui : ${today.label} (Europe/Paris).`,
    "« jeudi » = le jeudi qui vient, aujourd’hui compris. « demain » = le lendemain. « mon dernier voyage » = le séjour terminé le plus récent. « le retour » = le vol qui ramène.",
  ];
  if (!dossier.stays.length) {
    lines.push("Aucun séjour publié.");
    return lines.join("\n");
  }
  for (const stay of dossier.stays) {
    const end = stay.endDate || stay.startDate || "";
    const state = end && end < today.date ? "passé" : "en cours ou à venir";
    const place = stayDestinationLine({ destination: stay.destination, title: stay.title }) || stay.destination || "";
    lines.push(
      `Séjour ${stay.reference}${place ? `, ${place}` : ""}, du ${stay.startDate || "?"} au ${stay.endDate || "?"} (${state}). Lien : ${stayClientUrl(stay.reference)}`
    );
    for (const item of stay.items) {
      const when = [item.weekday, item.date ? frenchLongDate(item.date) : "", item.clock].filter(Boolean).join(" ");
      const hidden = [item.fromPlace, item.fromCode, airportSpokenName(item.fromCode), item.toPlace && !cityIsStay(item.toPlace, dossier.stays) ? item.toPlace : "", item.toCode]
        .filter(Boolean)
        .join(", ");
      lines.push(
        `- ${item.label}${item.flightNumber ? ` ${item.flightNumber}` : ""}${when ? `, ${when}` : ""}${item.lines[0] ? `. Au client : ${item.lines[0]}` : ""}${hidden ? `. Ne pas citer : ${hidden}` : ""}${item.terminal ? `. Terminal ${item.terminal}` : ""}`
      );
    }
    for (const formality of stay.formalities) lines.push(`- Formalité ${formality.name} : ${formality.copy}`);
    for (const doc of stay.documents) lines.push(`- Pièce : ${doc}`);
  }
  if (dossier.documents.length) {
    lines.push(
      `Coffre : ${dossier.documents.map((doc) => `${doc.label}${doc.holder ? ` ${doc.holder}` : ""}`).join(" ; ")}`
    );
  }
  if (dossier.balances.length) {
    lines.push(`Encours : ${dossier.balances.map((row) => `${row.balance} ${row.currency}`).join(", ")}`);
  }
  return lines.join("\n");
}

function withName(dossier: ConciergeDossier, sentence: string) {
  const name = dossier.firstName.trim();
  if (!name) return sentence;
  const rest = /^(vous|votre|you|your)\b/i.test(sentence) ? sentence.charAt(0).toLowerCase() + sentence.slice(1) : sentence;
  return `${name}, ${rest}`;
}

function longWhen(item: ConciergeItem, lang: ReplyLang) {
  if (!item.date) return item.weekday;
  const day = lang === "en" ? englishWeekday(item.date) : item.weekday;
  const date = lang === "en" ? englishLongDate(item.date) : frenchLongDate(item.date);
  return `${day} ${date}`.trim();
}

function flightSentence(item: ConciergeItem, stay: ConciergeStay, lang: ReplyLang) {
  const placeName = cityIsStay(item.toPlace, [stay]) ? item.toPlace : stayCities(stay)[0] || "";
  const place = placeName ? placeWithPreposition(placeName) : "";
  const when = longWhen(item, lang);
  if (lang === "en") {
    return [
      `You leave ${when}`,
      item.clock ? `at ${item.clock.replace("h", ":")}` : "",
      item.flightNumber ? `flight ${item.flightNumber}` : "",
      placeName ? `in ${placeName}` : "",
    ]
      .filter(Boolean)
      .join(", ");
  }
  if (lang === "he") {
    return [when, item.clock, item.flightNumber, placeName].filter(Boolean).join(", ");
  }
  return [`Vous partez ${when}`, item.clock ? `à ${item.clock}` : "", item.flightNumber ? `vol ${item.flightNumber}` : "", place]
    .filter(Boolean)
    .join(", ");
}

function itemsOn(dossier: ConciergeDossier, date: string) {
  const rows: { stay: ConciergeStay; item: ConciergeItem }[] = [];
  for (const stay of dossier.stays) {
    for (const item of stay.items) {
      if (item.date === date) rows.push({ stay, item });
    }
  }
  return rows;
}

function confirmGap(lang: ReplyLang, detail: string) {
  const team = say(lang, {
    fr: "L’équipe vous le confirme très vite.",
    en: "The team will confirm it shortly.",
    he: "הצוות יאשר זאת בקרוב.",
  });
  return `${detail}\n${team}`;
}

function dayPhrase(date: string, lang: ReplyLang) {
  const day = lang === "en" ? englishWeekday(date) : frenchWeekday(date);
  const label = lang === "en" ? englishLongDate(date) : frenchLongDate(date);
  return `${day} ${label}`.trim();
}

type RelativeAnswer = { body: string; handoff: "question" | null; stay: ConciergeStay | null };

function missingSegment(lang: ReplyLang, date: string, kind: "flight" | "hotel" | "transfer" | "any"): RelativeAnswer {
  const day = dayPhrase(date, lang);
  const detail = say(lang, {
    fr:
      kind === "hotel"
        ? `Je n’ai pas d’hôtel ce ${day} dans votre dossier.`
        : kind === "transfer"
          ? `Je n’ai pas de transfert ce ${day} dans votre dossier.`
          : `Je n’ai pas de départ ce ${day} dans votre dossier.`,
    en:
      kind === "hotel"
        ? `I don’t have a hotel on ${day} in your file.`
        : kind === "transfer"
          ? `I don’t have a transfer on ${day} in your file.`
          : `I don’t have a departure on ${day} in your file.`,
    he: `אין לי את זה בתיק ליום ${day}.`,
  });
  return { body: confirmGap(lang, detail), handoff: "question", stay: null };
}

function isDiningRequest(message: string) {
  const text = fold(message);
  return /\b(restaurant|diner)\b/.test(text) || (/\btable\b/.test(text) && /\b(reserv|book|voudrais|souhaite|prendre)\b/.test(text));
}

function allFlights(dossier: ConciergeDossier) {
  const rows: { stay: ConciergeStay; item: ConciergeItem }[] = [];
  for (const stay of dossier.stays) {
    for (const item of stay.items) {
      if (item.kind === "flight" || item.flightNumber) rows.push({ stay, item });
    }
  }
  return rows.sort((a, b) => (a.item.date || "").localeCompare(b.item.date || ""));
}

function explicitCalendarDate(message: string, now: Date) {
  const folded = fold(message);
  const months = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];
  const match = folded.match(/\b(\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)(?:\s+(\d{4}))?/);
  if (!match) return null;
  const month = months.indexOf(match[2]) + 1;
  const year = match[3] || parisMoment(now).date.slice(0, 4);
  return `${year}-${String(month).padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function answerRelative(message: string, dossier: ConciergeDossier, lang: ReplyLang, now: Date): RelativeAnswer | null {
  const when = relativeWhen(message, now);
  const explicit = explicitCalendarDate(message, now);
  const topic = topicOf(message);
  if (when?.kind === "last-trip") return lastTripAnswer(dossier, lang, now);
  if (when?.kind === "return" && !explicit) return returnAnswer(dossier, lang);
  const date = explicit || (when?.kind === "date" ? when.date : null);
  if (!date) return null;
  if (topic === "balance" || topic === "transactions" || topic === "price" || topic === "documents" || topic === "formality" || topic === "hello") {
    return null;
  }
  return dayAnswer(message, dossier, lang, date);
}

function lastTripAnswer(dossier: ConciergeDossier, lang: ReplyLang, now: Date): RelativeAnswer {
  const today = parisMoment(now).date;
  const past = dossier.stays.filter((stay) => (stay.endDate || stay.startDate || "") < today);
  const stay = [...past].sort((a, b) => (b.endDate || "").localeCompare(a.endDate || ""))[0];
  if (!stay) {
    const detail = say(lang, {
      fr: "Je n’ai pas de voyage terminé dans votre dossier.",
      en: "I don’t have a finished trip in your file.",
      he: "אין לי טיול שהסתיים בתיק.",
    });
    return { body: confirmGap(lang, detail), handoff: "question", stay: null };
  }
  const place = stayDestinationLine({ destination: stay.destination, title: stay.title }) || stay.destination || stay.title;
  const end = stay.endDate ? (lang === "en" ? englishLongDate(stay.endDate) : frenchLongDate(stay.endDate)) : "";
  const intro = say(lang, {
    fr: `Votre dernier voyage${place ? ` : ${place}` : ""}${end ? `, jusqu’au ${end}` : ""}.`,
    en: `Your last trip${place ? `: ${place}` : ""}${end ? `, until ${end}` : ""}.`,
    he: `הטיול האחרון${place ? `: ${place}` : ""}.`,
  });
  return { body: withName(dossier, `${intro}\n${describeStay(stay, lang)}`), handoff: null, stay };
}

function returnAnswer(dossier: ConciergeDossier, lang: ReplyLang): RelativeAnswer {
  const flights = allFlights(dossier);
  const inbound = flights.filter((row) => row.item.toPlace && !cityIsStay(row.item.toPlace, dossier.stays));
  const row = (inbound.length ? inbound : flights).at(-1);
  if (!row) {
    const detail = say(lang, {
      fr: "Je n’ai pas de vol de retour dans votre dossier.",
      en: "I don’t have a return flight in your file.",
      he: "אין לי טיסת חזור בתיק.",
    });
    return { body: confirmGap(lang, detail), handoff: "question", stay: null };
  }
  const when = longWhen(row.item, lang);
  const clock = row.item.clock ? (lang === "en" ? row.item.clock.replace("h", ":") : row.item.clock) : "";
  const body = say(lang, {
    fr: `Votre vol de retour : ${when}${clock ? `, à ${clock}` : ""}${row.item.flightNumber ? `, vol ${row.item.flightNumber}` : ""}.`,
    en: `Your return flight: ${when}${clock ? `, at ${clock}` : ""}${row.item.flightNumber ? `, flight ${row.item.flightNumber}` : ""}.`,
    he: `טיסת החזור: ${when}${clock ? `, ${clock}` : ""}${row.item.flightNumber ? `, ${row.item.flightNumber}` : ""}.`,
  });
  return { body: withName(dossier, body), handoff: null, stay: row.stay };
}

function dayAnswer(message: string, dossier: ConciergeDossier, lang: ReplyLang, date: string): RelativeAnswer {
  const text = fold(message);
  const wantsHotel = /hotel|chambre/.test(text);
  const wantsTransfer = /transfert|navette|transfer/.test(text);
  const wantsVip = /accueil|\bvip\b|greeter/.test(text);
  const wantsFlight = /part|pars|depart|vol\b|flight|leave|leaving|heure/.test(text);
  const focused = focusStay(message, dossier.stays);
  let rows = itemsOn(dossier, date);
  if (focused) rows = rows.filter((row) => row.stay.id === focused.id);
  const kind = wantsHotel ? "hotel" : wantsTransfer ? "transfer" : wantsVip ? "any" : "flight";
  if (wantsHotel) rows = rows.filter((row) => row.item.kind === "hotel");
  else if (wantsTransfer) rows = rows.filter((row) => row.item.kind === "transfer" || row.item.kind === "chauffeur");
  else if (wantsVip) rows = rows.filter((row) => row.item.kind === "accueil_vip" || row.item.kind === "greeter");
  else if (wantsFlight) rows = rows.filter((row) => row.item.kind === "flight" || row.item.flightNumber);
  if (!rows.length) return missingSegment(lang, date, wantsHotel || wantsTransfer || wantsVip || wantsFlight ? kind : "any");
  const lines = rows.map((row) =>
    row.item.kind === "flight" || row.item.flightNumber
      ? flightSentence(row.item, row.stay, lang)
      : `${row.item.label} — ${row.item.lines.join(", ") || row.item.label}`
  );
  return { body: withName(dossier, lines.join("\n")), handoff: null, stay: rows[0].stay };
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

export function agencyHandoffSentence(lang: ReplyLang = "fr") {
  return say(lang, {
    fr: HANDOFF_SENTENCE,
    en: "I’m passing this to the agency.",
    he: "אני מעביר את זה לסוכנות.",
  });
}

function handoffSentence(lang: ReplyLang) {
  return agencyHandoffSentence(lang);
}

function stopText(lang: ReplyLang) {
  return say(lang, {
    fr: "Les messages de l’agence sont coupés. Écrivez quand vous voulez, je vous réponds.",
    en: "The agency’s proactive messages are stopped. Write whenever you like, I will still reply.",
    he: "ההודעות היזומות של הסוכנות הופסקו. כתבו מתי שתרצו, אני עונה.",
  });
}

export function accessLinkReply(lang: ReplyLang, url: string | null) {
  if (url && !url.startsWith("https://")) return accessLinkReply(lang, null);
  if (!url) {
    return sign(
      say(lang, {
        fr: "Je n’ouvre pas votre espace d’ici. Je peux demander à l’agence un nouveau lien d’accès.",
        en: "I can’t open your space from here. I can ask the agency for a new access link.",
        he: "איני פותח את המרחב מכאן. אפשר לבקש מהסוכנות קישור גישה חדש.",
      })
    );
  }
  return sign(
    `${say(lang, {
      fr: "Voici un nouveau lien d’accès. Ce n’est pas votre mot de passe.",
      en: "Here is a new access link. It is not your password.",
      he: "הנה קישור גישה חדש. זו אינה הסיסמה שלכם.",
    })}\n${url}`
  );
}

export function pieceSavedLine(lang: ReplyLang) {
  return say(lang, {
    fr: "Votre pièce est enregistrée dans votre coffre.",
    en: "Your document is saved with your papers.",
    he: "המסמך נשמר בכספת שלכם.",
  });
}

export function panRefusedReply(lang: ReplyLang) {
  return sign(
    say(lang, {
      fr: "Je ne conserve pas de numéro de carte. Envoyez la pièce sans ces chiffres, ou je peux en parler à l’agence.",
      en: "I don’t keep card numbers. Send the document without them, or I can ask the agency.",
      he: "אני לא שומר מספרי כרטיס. שלחו את המסמך בלי הספרות האלה, או שאעביר לסוכנות.",
    })
  );
}

function typeImage(kind: WhatsappImageKind) {
  return whatsappTypeImageUrl(kind);
}

function replyImage(message: string, topic: string, stay: ConciergeStay | null, thin: boolean) {
  if (thin) return null;
  const text = fold(message);
  if (topic === "documents") return typeImage("passeport");
  if (topic === "formality") return typeImage("visa");
  if (topic === "chauffeur") return typeImage("chauffeur");
  if (topic === "balance" || topic === "transactions" || topic === "price") return typeImage("encours");
  if (topic === "included") return typeImage("hotel");
  if (topic === "schedule") {
    if (/hotel|chambre/.test(text)) return typeImage("hotel");
    if (/transfert|navette/.test(text)) return typeImage("transfert");
    return typeImage("billet");
  }
  if (topic === "stay") {
    if (/hotel|chambre/.test(text)) return typeImage("hotel");
    if (/\bvol\b|avion|billet|flight/.test(text)) return typeImage("billet");
    if (/transfert/.test(text)) return typeImage("transfert");
    if (stay?.cover) return stayCoverUrl(stay.reference, true, { shareCode: stay.shareCode });
  }
  if (topic === "hello" && stay?.cover) return stayCoverUrl(stay.reference, true, { shareCode: stay.shareCode });
  return null;
}

export function planConciergeTurn(message: string, dossier: ConciergeDossier, now: Date = new Date()): ConciergeTurn {
  const lang = messageLanguage(message);
  const empty = { cover: null as string | null, optOut: false, access: false };

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
      ? `\n${say(lang, {
          fr: `Cela concerne le séjour ${stay.reference}.`,
          en: `This is about stay ${stay.reference}.`,
          he: `זה נוגע לשהות ${stay.reference}.`,
        })}\n${stayClientUrl(stay.reference)}`
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
  let answerHandoff: HandoffKind | null = null;
  let pinned: ConciergeStay | null = null;
  const relative = isDiningRequest(message) ? null : answerRelative(message, dossier, lang, now);
  if (isDiningRequest(message)) {
    body = confirmGap(
      lang,
      say(lang, {
        fr: "Je n’ai pas de restaurant dans votre dossier.",
        en: "I don’t have a restaurant in your file.",
        he: "אין לי מסעדה בתיק.",
      })
    );
    answerHandoff = "question";
  } else if (relative) {
    body = relative.body;
    answerHandoff = relative.handoff;
    pinned = relative.stay;
  } else if (topic === "balance") body = balanceText(dossier, lang);
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
  if (complaint && (thin || answerHandoff)) {
    if (!/agence|agency|סוכנות/.test(body)) body = `${body}\n${handoffSentence(lang)}`;
    const stay = pinned || subjectStay(message, dossier, topic);
    return {
      ...empty,
      handoff: "complaint",
      bookingId: stay?.id || null,
      text: sign(body),
    };
  }
  if (answerHandoff === "question") {
    const stay = pinned || subjectStay(message, dossier, topic);
    return {
      ...empty,
      handoff: "question",
      bookingId: stay?.id || null,
      text: sign(body),
    };
  }

  const stay = pinned || subjectStay(message, dossier, topic);
  return {
    ...empty,
    handoff: null,
    bookingId: stay?.id || null,
    text: sign(body),
    cover: replyImage(message, topic, stay, thin),
  };
}
