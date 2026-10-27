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
import { timezoneForIata } from "./airport-time";
import {
  airportSpokenName,
  civilDate,
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
import { formatDateFr, formatMoney } from "./money";
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
import { packBubbles, conciergeOpening, type BubbleHistory } from "../concierge/bubbles";
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
export const VERIFY_SENTENCE = "Je vérifie avec Benjamin.";
/** Paiement, plainte, doute : Benjamin reprend. Le reste reste à l’agence. */
export const BENJAMIN_HANDOFF = "Je transmets à Benjamin.";
export const CONCIERGE_REPLY_MAX_CHARS = 280;
export const CONCIERGE_REPLY_MAX_LINES = 3;

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
  arrival: string;
  endDate: string | null;
  /** Fuseau du segment (départ du vol, sinon Paris). Le « aujourd’hui » s’y lit. */
  timezone: string;
};

export type ConciergePending = {
  kind: HandoffKind;
  bookingId: string | null;
  body: string;
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
  /** Programmes connus, sans numéro. Notes client déjà publiées. */
  preferences: string[];
  /** Langue de la fiche. Le message du client prime. */
  language: string | null;
  stays: ConciergeStay[];
  documents: ConciergeDocument[];
  movements: ConciergeMovement[];
  balances: ConciergeBalance[];
};

export type ConciergeTurn = {
  handoff: HandoffKind | null;
  bookingId: string | null;
  text: string;
  /** Bulles WhatsApp, dans l’ordre d’envoi. `text` est leur jointure. */
  messages?: string[];
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
> & { supplier?: string | null };

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

const CLIENT_SECRET =
  /little emperors|expedia(?:\s+taap)?|\btaap\b|\bpliant\b|\bfournisseur\b|\bcommission\b|\bprix net\b|\bco[uû]t net\b|\bnet price\b|\bwholesale\b|hotelbeds/i;

const SECRET_MONEY = /\bnet\b.{0,24}\d|\d.{0,12}\bnet\b/i;

function sentenceLeaks(part: string) {
  return CLIENT_SECRET.test(part) || SECRET_MONEY.test(part);
}

/** Retire fournisseur, net, commission, MRZ. Le nom d’hôtel affiché reste. */
export function scrubClientText(value: string, hiddenNames: string[] = []) {
  let text = value;
  for (const name of hiddenNames) {
    const token = name.trim();
    if (token.length < 3) continue;
    text = text.replace(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "");
  }
  return text
    .split("\n")
    .flatMap((line) => {
      if (/[A-Z0-9<]{20,}/.test(line)) return [];
      const pieces = line.split(/(?<=[.!?])\s+/).filter((part) => part.trim() && !sentenceLeaks(part));
      if (!pieces.length) return [];
      const cleaned = pieces
        .join(" ")
        .replace(new RegExp(CLIENT_SECRET.source, "gi"), "")
        .replace(/\b\d+(?:[.,]\d+)?\s*%/g, "")
        .replace(/\b\d[\d\s.,]*\s*(?:€|eur(?:os)?)/gi, "");
      return cleaned.trim() ? [cleaned] : [];
    })
    .join("\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .trim();
}

function hiddenSupplierNames(card: CrmBookingItem) {
  const hotel = fold(hotelDisplayName(card));
  return [card.supplier, detailStr(card, "supplier"), detailStr(card, "provider"), detailStr(card, "wholesaler")].filter(
    (name): name is string => {
      const token = (name || "").trim();
      return token.length > 2 && fold(token) !== hotel;
    }
  );
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
  const hidden = hiddenSupplierNames(card);
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
  const safeIncluded = included.map((row) => scrubClientText(row, hidden)).filter(Boolean);
  if (safeIncluded.length) lines.push(safeIncluded.join(", "));
  const spoken = lines.map((line) => scrubClientText(line, hidden)).filter(Boolean);
  lines.length = 0;
  lines.push(...spoken);
  const amount =
    prices && item.amount != null && Number.isFinite(Number(item.amount)) ? Number(item.amount) : null;
  return {
    kind: item.kind,
    label: BOOKING_ITEM_LABELS[item.kind as BookingItemKind] || item.kind,
    lines: lines.filter(Boolean),
    clock,
    included: safeIncluded,
    amount,
    date,
    weekday,
    flightNumber,
    terminal,
    fromPlace,
    toPlace,
    fromCode,
    toCode,
    arrival: endClock,
    endDate: segmentDate(item.end_at),
    timezone: itemTimezone(item.kind, fromCode, card),
  };
}

function storedZone(value: unknown) {
  if (typeof value !== "string" || !value.includes("/")) return "";
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return "";
  }
}

function itemTimezone(kind: string, fromCode: string, card: CrmBookingItem) {
  return (
    storedZone(card.details?.departure_timezone) ||
    storedZone(card.details?.timezone) ||
    (kind === "flight" ? timezoneForIata(fromCode) : "") ||
    "Europe/Paris"
  );
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
  /** Libellés seulement. Jamais un numéro de programme. */
  preferences?: string[] | null;
  language?: string | null;
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
    const label = scrubClientText(documentLabel(doc as CrmBookingDocument, related));
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
      notesClient: scrubClientText(shownClientNote(booking.notes_client) || "") || null,
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
      label: scrubClientText(row.label?.trim() || TX_KIND_LABELS[row.kind as TransactionKind] || row.kind) || TX_KIND_LABELS[row.kind as TransactionKind] || row.kind,
      direction: row.direction,
      amount: Number(row.amount),
      currency: row.currency || "EUR",
      stayReference: row.booking_id ? stayRef.get(row.booking_id) || null : null,
    }));
  const balances: ConciergeBalance[] = (input.balances || []).map((row) => ({
    currency: row.currency || "EUR",
    balance: Number(row.balance),
  }));

  const preferences = [...new Set((input.preferences || []).map((row) => scrubClientText(row)).filter(Boolean))];
  return {
    firstName: greetingGivenName(input.firstName) || "",
    preferences,
    language: (input.language || "").trim() || null,
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

const GENERIC_STAY_WORDS = new Set([
  "hotel",
  "sejour",
  "voyage",
  "reservation",
  "carnet",
  "vol",
  "vols",
  "train",
  "avec",
  "pour",
  "dans",
  "votre",
  "cette",
  "chambre",
  "nuits",
  "nuit",
]);

function hasWord(text: string, token: string) {
  if (token.length < 4) return false;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`).test(text);
}

/** Villes du séjour : destination, titre, ville d’hôtel. Pas le départ, pas « hôtel ». */
export function stayCityTokens(stay: ConciergeStay) {
  const found = new Set<string>();
  const add = (value: string) => {
    for (const word of fold(value).split(/[^a-z0-9]+/)) {
      if (word.length > 3 && !GENERIC_STAY_WORDS.has(word)) found.add(word);
    }
  };
  if (stay.destination) add(stay.destination);
  add(stay.title);
  for (const item of stay.items) {
    if (item.kind !== "hotel") continue;
    add(item.toPlace);
    const line = item.lines[0] || "";
    const city = line.split(",").at(-1)?.trim() || "";
    if (city && fold(city) !== fold(line.split(",")[0] || "")) add(city);
  }
  return [...found];
}

/**
 * La ville écrite gagne sur la référence. Deauville ne se rattache pas au dossier de Nice.
 * Sans ville, la référence, puis l’unique séjour.
 */
function focusStay(message: string, stays: ConciergeStay[]) {
  if (!stays.length) return null;
  const text = fold(message);
  const byCity = stays.filter((stay) => stayCityTokens(stay).some((token) => hasWord(text, token)));
  if (byCity.length === 1) return byCity[0];
  if (byCity.length > 1) return null;
  const byRef = stays.find((stay) => text.includes(fold(stay.reference)));
  if (byRef) return byRef;
  const hits = stays.filter((stay) => stayCityTokens(stay).some((token) => hasWord(text, token)));
  if (hits.length === 1) return hits[0];
  if (stays.length === 1) return stays[0];
  return null;
}

export function stayForRequest(message: string, stays: ConciergeStay[]) {
  return focusStay(message, stays);
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

function describeStay(stay: ConciergeStay, lang: ReplyLang, now: Date) {
  const place = stayDestinationLine({ destination: stay.destination, title: stay.title }) || stay.destination || "";
  const at = place ? (lang === "en" ? `in ${place}` : placeWithPreposition(place)) : "";
  const start = stay.startDate ? bareDate(stay.startDate, lang, now) : "";
  const end = stay.endDate ? bareDate(stay.endDate, lang, now) : "";
  const dates =
    start && end ? (lang === "en" ? `from ${start} to ${end}` : `du ${start} au ${end}`) : start || end;
  const hotel = stay.items.find((item) => item.kind === "hotel");
  const name = hotel ? hotelName(hotel) : "";
  const intro =
    lang === "en"
      ? `Your stay${at ? ` ${at}` : ""}${dates ? ` runs ${dates}` : ""}${name ? `, at ${name}` : ""}.`
      : `Votre séjour${at ? ` ${at}` : ""}${dates ? ` va ${dates}` : ""}${name ? `, à ${name}` : ""}.`;
  return [intro, stay.notesClient, stayClientUrl(stay.reference)].filter(Boolean).join("\n");
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

function balanceText(dossier: ConciergeDossier, lang: ReplyLang) {
  const link = transactionsClientUrl();
  if (!dossier.balances.length) {
    return lang === "en"
      ? `I don’t have a balance on your account.\n${link}`
      : `Je n’ai pas d’encours enregistré sur votre compte.\n${link}`;
  }
  const lines = dossier.balances.map((row) => {
    const amount = moneyLabel(Math.abs(row.balance), row.currency, lang);
    if (lang === "en") {
      if (row.balance < 0) return `There is ${amount} still to settle.`;
      if (row.balance > 0) return `You have a credit of ${amount}.`;
      return "Your account is settled.";
    }
    if (row.balance < 0) return `Il vous reste ${amount} à régler.`;
    if (row.balance > 0) return `Vous avez un avoir de ${amount}.`;
    return "Votre compte est à jour.";
  });
  return `${lines.join(" ")}\n${link}`;
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
  const lines = dossier.documents.slice(0, 3).map((doc) => {
    const who = doc.holder ? (lang === "en" ? ` in the name of ${doc.holder}` : ` au nom de ${doc.holder}`) : "";
    const expiry = dateLabel(doc.expiresOn, lang);
    if (lang === "en") return `Your ${doc.label}${who} is on file${expiry ? `, and expires on ${expiry}` : ""}.`;
    return `Votre ${doc.label}${who} est au coffre${expiry ? `, et expire le ${expiry}` : ""}.`;
  });
  return lines.join(" ");
}

function formalityText(message: string, dossier: ConciergeDossier, lang: ReplyLang) {
  const stay = focusStay(message, dossier.stays);
  if (!stay && dossier.stays.length > 1) return whichStayText(dossier.stays, lang);
  const pool = stay ? [stay] : dossier.stays;
  const rows = pool.flatMap((row) => row.formalities.map((formality) => ({ stay: row, formality })));
  if (!rows.length) return lang === "en" ? "I don’t have a filed formality in your file." : MISSING_FORMALITY;
  return rows
    .map((row) => {
      const sentence =
        lang === "en"
          ? `Your ${row.formality.name} formality is under way. ${row.formality.copy}`
          : `Votre formalité ${row.formality.name} suit son cours. ${row.formality.copy}`;
      return `${sentence}\n${stayClientUrl(row.stay.reference)}`;
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
    "« jeudi », « prochain » et « mon vol » = le prochain segment à venir, jamais une date passée. Le jour se lit dans le fuseau du trajet. « demain » = le lendemain. « mon dernier voyage » = le séjour terminé le plus récent. « le retour » = le vol qui ramène.",
    "Ne jamais citer un taux d’agence, un prix d’achat, un nom de grossiste, un numéro de pièce ni une zone de lecture.",
  ];
  if (dossier.firstName) lines.push(`Client : ${dossier.firstName}.`);
  const langue = dossier.language === "en" ? "anglais" : dossier.language === "he" ? "hébreu" : "français";
  lines.push(`Langue de la fiche : ${langue}. Répondre dans la langue du message.`);
  const prefs = [
    ...(dossier.preferences || []),
    ...dossier.stays.map((stay) => stay.notesClient || "").filter(Boolean),
  ];
  if (prefs.length) lines.push(`Préférences : ${prefs.join(" · ")}.`);
  const active = [...dossier.stays]
    .filter((stay) => (stay.endDate || stay.startDate || "") >= today.date)
    .sort((a, b) => (a.startDate || "9999").localeCompare(b.startDate || "9999"))[0];
  if (active) {
    const place = stayDestinationLine({ destination: active.destination, title: active.title }) || active.destination || "";
    lines.push(
      `Séjour actif : ${active.reference}${place ? `, ${place}` : ""}, du ${active.startDate || "?"} au ${active.endDate || "?"}.`
    );
    const upcoming = active.items.filter((item) => !segmentIsPast(item, now) && ["flight", "hotel", "transfer", "chauffeur"].includes(item.kind));
    for (const item of upcoming.slice(0, 6)) {
      const when = [item.weekday, item.date ? frenchLongDate(item.date) : "", item.clock].filter(Boolean).join(" ");
      lines.push(`- À venir : ${item.label}${item.flightNumber ? ` ${item.flightNumber}` : ""}${when ? `, ${when}` : ""}${item.lines[0] ? `. ${item.lines[0]}` : ""}`);
    }
  }
  const zone = tripZone(dossier, now);
  const local = civilDate(now, zone);
  if (zone !== "Europe/Paris") lines.push(`Fuseau du prochain trajet : ${zone}, date civile ${local}.`);
  const nextFlight = nextUpcomingFlight(dossier, now);
  if (nextFlight?.item.flightNumber) {
    lines.push(
      `Prochain vol : ${nextFlight.item.flightNumber} le ${nextFlight.item.date || "?"}. Ne pas citer un vol antérieur pour mon vol, jeudi ou prochain.`
    );
  }
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

function bareDate(iso: string, lang: ReplyLang, now: Date) {
  const sameYear = iso.slice(0, 4) === parisMoment(now).date.slice(0, 4);
  if (lang === "en") {
    const full = englishLongDate(iso);
    return sameYear ? full.replace(/ \d{4}$/, "") : full;
  }
  const full = frenchLongDate(iso);
  return sameYear ? full.replace(/ \d{4}$/, "") : full;
}

function clientWhen(date: string | null, lang: ReplyLang, now: Date) {
  if (!date) return "";
  const day = lang === "en" ? englishWeekday(date) : frenchWeekday(date);
  return `${day} ${bareDate(date, lang, now)}`.trim();
}

function spokenClock(clock: string, lang: ReplyLang) {
  const match = clock.match(/^(\d{1,2})h(\d{2})$/);
  if (!match) return clock;
  const hour = String(Number(match[1]));
  if (lang === "en") return `${hour}:${match[2]}`;
  return match[2] === "00" ? `${hour}h` : `${hour}h${match[2]}`;
}

function stayDestination(item: ConciergeItem, stay: ConciergeStay) {
  return item.toPlace && cityIsStay(item.toPlace, [stay]) ? item.toPlace : "";
}

function flightSentence(item: ConciergeItem, stay: ConciergeStay, lang: ReplyLang, now: Date) {
  const dest = stayDestination(item, stay);
  const returning = Boolean(item.toPlace) && !cityIsStay(item.toPlace, [stay]);
  const when = clientWhen(item.date, lang, now);
  const clock = item.clock ? spokenClock(item.clock, lang) : "";
  const past = Boolean(item.date && item.date < parisMoment(now).date);
  const number = item.flightNumber ? ` ${item.flightNumber}` : "";
  const landed = !past && item.arrival && item.arrival !== item.clock ? spokenClock(item.arrival, lang) : "";
  if (lang === "en") {
    const verb = past ? "left" : "leaves";
    const kind = returning ? "return flight" : "flight";
    const toward = !returning && dest ? ` to ${dest}` : "";
    const land = landed ? ` and lands at ${landed}` : "";
    return `Your ${kind}${number}${toward} ${verb} on ${when}${clock ? ` at ${clock}` : ""}${land}.`;
  }
  if (lang === "he") {
    return [returning ? "טיסת חזור" : "הטיסה", item.flightNumber, dest, when, clock, landed].filter(Boolean).join(" ");
  }
  const verb = past ? "a décollé" : "décolle";
  const kind = returning ? "vol de retour" : "vol";
  const toward = !returning && dest ? ` pour ${dest}` : "";
  const land = landed ? ` et atterrit à ${landed}` : "";
  return `Votre ${kind}${number}${toward} ${verb} ${when}${clock ? ` à ${clock}` : ""}${land}.`;
}

function hotelName(item: ConciergeItem) {
  const line = item.lines[0] || "";
  const name = line.split(",")[0]?.trim() || "";
  return name || item.label;
}

function staySpan(start: string, end: string | null, lang: ReplyLang, now: Date) {
  if (!end || end === start) {
    const one = bareDate(start, lang, now);
    return lang === "en" ? `on ${one}` : `le ${one}`;
  }
  const sameYear = start.slice(0, 4) === end.slice(0, 4) && start.slice(0, 4) === parisMoment(now).date.slice(0, 4);
  const sameMonth = sameYear && start.slice(5, 7) === end.slice(5, 7);
  if (sameMonth) {
    const startDay = Number(start.slice(8, 10));
    const endDay = Number(end.slice(8, 10));
    if (lang === "en") {
      const month = englishLongDate(start).replace(/^\d+\s/, "").replace(/ \d{4}$/, "");
      return `from ${startDay} to ${endDay} ${month}`;
    }
    const month = frenchLongDate(start).split(" ")[1] || "";
    return `du ${startDay} au ${endDay} ${month}`;
  }
  const from = bareDate(start, lang, now);
  const to = bareDate(end, lang, now);
  return lang === "en" ? `from ${from} to ${to}` : `du ${from} au ${to}`;
}

function hotelSentence(item: ConciergeItem, lang: ReplyLang, now: Date) {
  const name = hotelName(item);
  if (!item.date) return lang === "en" ? `You are staying at ${name}.` : `Vous séjournez à ${name}.`;
  const span = staySpan(item.date, item.endDate, lang, now);
  if (lang === "en") return `You are staying at ${name} ${span}.`;
  if (lang === "he") return [name, span].filter(Boolean).join(" ");
  return `Vous séjournez à ${name} ${span}.`;
}

function safeLine(item: ConciergeItem, dossier: ConciergeDossier) {
  const title = (item.lines[0] || "").trim();
  if (!title || replyMentionsForbiddenPlace(title, dossier)) return "";
  return title;
}

function transferSentence(item: ConciergeItem, lang: ReplyLang, now: Date, dossier: ConciergeDossier) {
  const when = clientWhen(item.date, lang, now);
  const clock = item.clock ? spokenClock(item.clock, lang) : "";
  const title = safeLine(item, dossier);
  const named = title && /^transfert/i.test(title) ? title.charAt(0).toLowerCase() + title.slice(1) : "";
  if (lang === "en") {
    return `Your transfer is planned${when ? ` on ${when}` : ""}${clock ? ` at ${clock}` : ""}.`;
  }
  if (lang === "he") return [title || "העברה", when, clock].filter(Boolean).join(" ");
  const head = named ? `Votre ${named}` : "Votre transfert";
  return `${head} est prévu ${when}${clock ? ` à ${clock}` : ""}.`.replace(/\s+/g, " ").trim();
}

function welcomeSentence(item: ConciergeItem, lang: ReplyLang, now: Date, dossier: ConciergeDossier) {
  const when = clientWhen(item.date, lang, now);
  const clock = item.clock ? spokenClock(item.clock, lang) : "";
  const title = safeLine(item, dossier);
  if (lang === "en") return `Your arrival welcome is planned${when ? ` on ${when}` : ""}${clock ? ` at ${clock}` : ""}.`;
  const head = title ? `Votre ${title.charAt(0).toLowerCase()}${title.slice(1)}` : "Votre accueil";
  return `${head} est prévu ${when}${clock ? ` à ${clock}` : ""}.`.replace(/\s+/g, " ").trim();
}

function clockMinutes(clock: string) {
  const match = clock.match(/^(\d{1,2})h(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Un transfert entre le décollage et l’atterrissage du même jour ne se cite pas. */
function transferClashes(stay: ConciergeStay, date: string) {
  const flights = stay.items.filter((item) => (item.kind === "flight" || item.flightNumber) && item.date === date);
  const transfers = stay.items.filter(
    (item) => (item.kind === "transfer" || item.kind === "chauffeur") && item.date === date && item.clock
  );
  for (const flight of flights) {
    const depart = clockMinutes(flight.clock);
    const land = clockMinutes(flight.arrival);
    if (depart == null || land == null || !(depart < land)) continue;
    for (const transfer of transfers) {
      const at = clockMinutes(transfer.clock);
      if (at != null && depart < at && at < land) return true;
    }
  }
  return false;
}

function confirmTransfer(lang: ReplyLang) {
  return say(lang, {
    fr: "Le transfert vers l'hôtel sera confirmé par l'équipe.",
    en: "The transfer will be confirmed by the team.",
    he: "ההעברה תאושר על ידי הצוות.",
  });
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

function dayPhrase(date: string, lang: ReplyLang, now: Date) {
  return clientWhen(date, lang, now);
}

type RelativeAnswer = { body: string; handoff: "question" | null; stay: ConciergeStay | null };

function missingSegment(lang: ReplyLang, date: string, kind: "flight" | "hotel" | "transfer" | "any", now: Date): RelativeAnswer {
  const day = dayPhrase(date, lang, now);
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
  const when = relativeWhen(message, now, tripZone(dossier, now));
  const explicit = explicitCalendarDate(message, now);
  const topic = topicOf(message);
  if (when?.kind === "last-trip") return lastTripAnswer(dossier, lang, now);
  if (when?.kind === "return" && !explicit) return returnAnswer(dossier, lang, now);
  const date = explicit || (when?.kind === "date" ? when.date : null);
  if (!date) return null;
  if (topic === "balance" || topic === "transactions" || topic === "price" || topic === "documents" || topic === "formality" || topic === "hello") {
    return null;
  }
  return dayAnswer(message, dossier, lang, date, now);
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
  const place = stayDestinationLine({ destination: stay.destination, title: stay.title }) || stay.destination || "";
  const end = stay.endDate ? bareDate(stay.endDate, lang, now) : "";
  const at = place ? (lang === "en" ? `in ${place}` : placeWithPreposition(place)) : "";
  const intro = say(lang, {
    fr: `Votre dernier voyage${at ? ` ${at}` : ""} s’est achevé${end ? ` le ${end}` : ""}.`,
    en: `Your last trip${at ? ` ${at}` : ""} ended${end ? ` on ${end}` : ""}.`,
    he: `הטיול האחרון${place ? ` ${place}` : ""} הסתיים${end ? ` ${end}` : ""}.`,
  });
  return { body: intro, handoff: null, stay };
}

function returnAnswer(dossier: ConciergeDossier, lang: ReplyLang, now: Date): RelativeAnswer {
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
  return { body: flightSentence(row.item, row.stay, lang, now), handoff: null, stay: row.stay };
}

function dayAnswer(message: string, dossier: ConciergeDossier, lang: ReplyLang, date: string, now: Date): RelativeAnswer {
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
  if (!rows.length) return missingSegment(lang, date, wantsHotel || wantsTransfer || wantsVip || wantsFlight ? kind : "any", now);
  const primary = rows[0];
  const past = Boolean(primary.item.date && primary.item.date < parisMoment(now).date);
  const clash = rows.some((row) => transferClashes(row.stay, date));
  if (wantsHotel) return { body: hotelSentence(primary.item, lang, now), handoff: null, stay: primary.stay };
  if (wantsTransfer) {
    if (clash) return { body: confirmTransfer(lang), handoff: "question", stay: primary.stay };
    return { body: transferSentence(primary.item, lang, now, dossier), handoff: null, stay: primary.stay };
  }
  if (wantsVip) return { body: welcomeSentence(primary.item, lang, now, dossier), handoff: null, stay: primary.stay };
  const flight = rows.find((row) => row.item.kind === "flight" || row.item.flightNumber);
  if (flight && (wantsFlight || rows.length === 1)) {
    const line = flightSentence(flight.item, flight.stay, lang, now);
    if (clash && !past) return { body: `${line}\n${confirmTransfer(lang)}`, handoff: "question", stay: flight.stay };
    return { body: line, handoff: null, stay: flight.stay };
  }
  const line = rows
    .slice(0, 2)
    .map((row) => {
      if (row.item.kind === "hotel") return hotelSentence(row.item, lang, now);
      if (row.item.kind === "transfer" || row.item.kind === "chauffeur") {
        return clash ? confirmTransfer(lang) : transferSentence(row.item, lang, now, dossier);
      }
      if (row.item.kind === "accueil_vip" || row.item.kind === "greeter") return welcomeSentence(row.item, lang, now, dossier);
      return flightSentence(row.item, row.stay, lang, now);
    })
    .filter(Boolean)
    .join("\n");
  return { body: line, handoff: clash && !past ? "question" : null, stay: primary.stay };
}

export function segmentIsPast(item: ConciergeItem, now: Date) {
  if (!item.date) return false;
  return item.date < civilDate(now, item.timezone || "Europe/Paris");
}

function flightSortKey(item: ConciergeItem) {
  const minutes = clockMinutes(item.clock);
  return `${item.date || "9999-99-99"}T${String(minutes ?? 0).padStart(4, "0")}`;
}

/** Le prochain vol dont la date n’est pas passée dans le fuseau du trajet. */
export function nextUpcomingFlight(dossier: ConciergeDossier, now: Date) {
  return (
    allFlights(dossier)
      .filter((row) => row.item.date && !segmentIsPast(row.item, now))
      .sort((a, b) => flightSortKey(a.item).localeCompare(flightSortKey(b.item)))[0] || null
  );
}

function nextUpcomingHotel(dossier: ConciergeDossier, now: Date) {
  const rows: { stay: ConciergeStay; item: ConciergeItem }[] = [];
  for (const stay of dossier.stays) {
    for (const item of stay.items) {
      if (item.kind !== "hotel") continue;
      const end = item.endDate || item.date;
      if (end && end < civilDate(now, item.timezone || "Europe/Paris")) continue;
      rows.push({ stay, item });
    }
  }
  return rows.sort((a, b) => flightSortKey(a.item).localeCompare(flightSortKey(b.item)))[0] || null;
}

function tripZone(dossier: ConciergeDossier, now: Date) {
  return nextUpcomingFlight(dossier, now)?.item.timezone || nextUpcomingHotel(dossier, now)?.item.timezone || "Europe/Paris";
}

export function contestsMessage(message: string) {
  const text = fold(message);
  return /tu te trompes|vous vous trompez|t'es trompe|c'est faux|c'est pas (ca|le bon|mon)|ce n'est pas (ca|le bon|mon)|pas le bon vol|mauvais vol|vous etes sur|tu es sur|un doute|are you sure|not sure|you(?:'| a)re wrong|that(?:'| i)s wrong|not my flight/.test(
    text
  );
}

export function asksCheckIn(message: string) {
  const text = fold(message);
  return /check-?in|check in|enregistrement en ligne|\benregistrement\b/.test(text);
}

/** Carnet, billet ou confirmation d’hôtel déjà publiés. Pas un passeport. */
export function asksPublishedResend(message: string): "carnet" | "flight" | "hotel" | null {
  const text = fold(message);
  if (/passeport|passport|\bmrz\b/.test(text)) return null;
  if (!/renvoy|envoy|send|resend|forward|le lien|lien du/.test(text)) return null;
  if (/billet|e-?ticket|embarquement|boarding/.test(text)) return "flight";
  if (/confirmation/.test(text) && /hotel/.test(text)) return "hotel";
  if (/carnet|itineraire|lien/.test(text)) return "carnet";
  return null;
}

function asksNextFlight(message: string) {
  const text = fold(message);
  if (/dernier/.test(text)) return false;
  return /\b(mon vol|le vol|my flight|the flight|prochain vol|vol prochain|next flight)\b/.test(text);
}

function asksNextHotel(message: string) {
  const text = fold(message);
  return /\b(mon hotel|my hotel|prochain hotel|hotel prochain)\b/.test(text);
}

function wantsClock(message: string) {
  return /horaire|a quelle heure|quelle heure|what time|which time|when/.test(fold(message));
}

function missingClock(lang: ReplyLang) {
  return lang === "en" ? "I don’t have the time in your file." : MISSING_CLOCK;
}

function recallsRoomChange(message: string, pending?: ConciergePending[]) {
  if (!pending?.length || classifyHandoff(message)) return false;
  if (!/chambre/.test(fold(message))) return false;
  return pending.some((row) => row.kind === "change" && /chambre/.test(fold(row.body)));
}

/** Le modèle a dépassé trois lignes ou 280 caractères : on reprend le routeur. */
export function replyOverCap(text: string) {
  const body = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^le concierge\.?$/i.test(line))
    .join("\n")
    .trim();
  if (!body) return false;
  if (body.split(/\n+/).length > CONCIERGE_REPLY_MAX_LINES) return true;
  return body.length > CONCIERGE_REPLY_MAX_CHARS;
}

/** Le coffre et son absence dans la même réponse, ou un passeport présent nié. */
export function contradictsPassport(text: string, dossier: ConciergeDossier) {
  const folded = fold(text);
  if (!/passeport|passport/.test(folded)) return false;
  const denies = /n'ai pas|n’ai pas|aucun passeport|pas de passeport|pas au coffre|introuvable|n'est pas au coffre|n’est pas au coffre/.test(
    folded
  );
  const affirms = /coffre|on file|enregistre/.test(folded);
  if (affirms && denies) return true;
  if (!denies) return false;
  return dossier.documents.some((doc) => {
    if (!/passeport|passport/i.test(doc.label)) return false;
    const first = fold(doc.holder).split(/[^a-z]+/).find((word) => word.length > 2) || "";
    return Boolean(first) && folded.includes(first);
  });
}

/** « mon vol », « jeudi », « prochain » : un numéro de vol déjà passé est un mauvais segment. */
export function replyCitesPastSegment(message: string, text: string, dossier: ConciergeDossier, now: Date) {
  const relative = relativeWhen(message, now, tripZone(dossier, now));
  const upcoming = asksNextFlight(message) || asksNextHotel(message) || relative?.kind === "date" || /\bprochain\b|\bnext\b/.test(fold(message));
  if (!upcoming || explicitCalendarDate(message, now)) return false;
  const folded = fold(text);
  for (const stay of dossier.stays) {
    for (const item of stay.items) {
      if (!item.flightNumber || !segmentIsPast(item, now)) continue;
      if (folded.includes(fold(item.flightNumber))) return true;
    }
  }
  return false;
}

/** La réponse nomme une autre ville ou une autre référence que celle demandée. */
export function replyNamesWrongCity(message: string, text: string, dossier: ConciergeDossier) {
  const asked = focusStay(message, dossier.stays);
  const folded = fold(message);
  const named = dossier.stays.filter((stay) => stayCityTokens(stay).some((token) => hasWord(folded, token)));
  const target = named.length === 1 ? named[0] : asked;
  if (!target || named.length !== 1) return false;
  const answer = fold(text);
  for (const stay of dossier.stays) {
    if (stay.id === target.id) continue;
    if (answer.includes(fold(stay.reference))) return true;
    if (stayCityTokens(stay).some((token) => hasWord(answer, token) && !stayCityTokens(target).includes(token))) return true;
  }
  return false;
}

function scheduleText(message: string, dossier: ConciergeDossier, lang: ReplyLang, now: Date) {
  const stay = focusStay(message, dossier.stays);
  if (!stay && dossier.stays.length > 1 && !asksNextFlight(message) && !asksNextHotel(message)) {
    return whichStayText(dossier.stays, lang);
  }
  const pool = stay ? [stay] : dossier.stays;
  let known = pool.flatMap((row) =>
    row.items.filter((item) => item.clock && !segmentIsPast(item, now)).map((item) => ({ stay: row, item }))
  );
  const text = fold(message);
  if (/\bvol\b|flight|part|depart/.test(text)) {
    known = known.filter((row) => row.item.kind === "flight" || row.item.flightNumber);
  } else if (/hotel|chambre/.test(text)) {
    known = known.filter((row) => row.item.kind === "hotel");
  }
  known.sort((a, b) => flightSortKey(a.item).localeCompare(flightSortKey(b.item)));
  const row = known[0];
  if (!row) return missingClock(lang);
  const clash = Boolean(row.item.date && transferClashes(row.stay, row.item.date));
  if ((row.item.kind === "transfer" || row.item.kind === "chauffeur") && clash) return confirmTransfer(lang);
  if (row.item.kind === "hotel") return hotelSentence(row.item, lang, now);
  if (row.item.kind === "transfer" || row.item.kind === "chauffeur") return transferSentence(row.item, lang, now, dossier);
  if (row.item.kind === "accueil_vip" || row.item.kind === "greeter") return welcomeSentence(row.item, lang, now, dossier);
  return flightSentence(row.item, row.stay, lang, now);
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

function stayText(message: string, dossier: ConciergeDossier, lang: ReplyLang, now: Date) {
  const stay = focusStay(message, dossier.stays);
  if (stay) return describeStay(stay, lang, now);
  if (!dossier.stays.length) {
    return lang === "en" ? "I don’t have a published stay on your account." : "Je n’ai pas de séjour publié sur votre compte.";
  }
  if (dossier.stays.length > 1) return whichStayText(dossier.stays, lang);
  return describeStay(dossier.stays[0], lang, now);
}

function helloText(dossier: ConciergeDossier, lang: ReplyLang, now: Date) {
  if (dossier.stays.length > 1) return whichStayText(dossier.stays, lang);
  const stay = dossier.stays.length === 1 ? dossier.stays[0] : nextStay(dossier.stays);
  if (!stay) {
    return lang === "en" ? "I don’t have a published stay on your account." : "Je n’ai pas de séjour publié sur votre compte.";
  }
  return describeStay(stay, lang, now);
}

function subjectStay(message: string, dossier: ConciergeDossier, topic: string) {
  const focused = focusStay(message, dossier.stays);
  const named = focused && stayCityTokens(focused).some((token) => hasWord(fold(message), token));
  if (named && focused) return focused;
  if (topic === "balance" || topic === "transactions" || topic === "documents" || topic === "unknown") return null;
  if (focused) return focused;
  if (dossier.stays.length === 1) return dossier.stays[0];
  return null;
}

function offerAgency(lang: ReplyLang) {
  return lang === "en"
    ? "I don’t have that information. Would you like me to ask Benjamin?"
    : "Je n’ai pas cette information. Souhaitez-vous que j’en parle à Benjamin ?";
}

function benjaminHandoff(lang: ReplyLang) {
  return say(lang, {
    fr: BENJAMIN_HANDOFF,
    en: "I’m passing this to Benjamin.",
    he: "אני מעביר את זה ל-Benjamin.",
  });
}

export function agencyHandoffSentence(lang: ReplyLang = "fr") {
  return say(lang, {
    fr: HANDOFF_SENTENCE,
    en: "I’m passing this to the agency.",
    he: "אני מעביר את זה לסוכנות.",
  });
}

export const HANDOFF_NOT_RECORDED = "Je n’ai pas transmis cela à l’agence.";

/** Vrai si le texte dit que la demande est déjà chez l’agence. Une question (« souhaitez-vous ») ne compte pas. */
export function replyClaimsAgencyHandoff(text: string) {
  const folded = fold(text).replace(/[’']/g, "'");
  if (!/\b(agence|agency|benjamin)\b/.test(folded)) return false;
  if (/\bje transmets\b/.test(folded)) return true;
  if (/\bj'ai transmis\b/.test(folded)) return true;
  if (/\bj'ai passe\b/.test(folded)) return true;
  if (/\bdemande\b/.test(folded) && /\b(passe|transmise|transmis)\b/.test(folded)) return true;
  if (/\bi(?:'m| am) passing\b/.test(folded)) return true;
  if (/\bi (?:have )?passed\b/.test(folded)) return true;
  return false;
}

/** Le texte ne dit plus qu’une demande est partie, quand la ligne n’a pas été créée. */
export function dropUnrecordedHandoff(text: string) {
  if (!replyClaimsAgencyHandoff(text)) return text;
  const signed = /^le concierge\.?$/im.test(text);
  return signed ? `${HANDOFF_NOT_RECORDED}\n\nLe Concierge` : HANDOFF_NOT_RECORDED;
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

function spoken(body: string, dossier: ConciergeDossier, lang: ReplyLang, now: Date, history?: BubbleHistory[], block = false) {
  const messages = packBubbles({
    text: body,
    opening: conciergeOpening(history, now),
    firstName: dossier.firstName,
    lang,
    block,
  });
  return { text: messages.join("\n\n"), messages };
}

function nextFlightAnswer(message: string, dossier: ConciergeDossier, lang: ReplyLang, now: Date): RelativeAnswer | null {
  if (!asksNextFlight(message) || explicitCalendarDate(message, now)) return null;
  const row = nextUpcomingFlight(dossier, now);
  if (!row) {
    if (wantsClock(message)) return { body: missingClock(lang), handoff: null, stay: null };
    const detail = say(lang, {
      fr: "Je n’ai pas de vol à venir dans votre dossier.",
      en: "I don’t have an upcoming flight in your file.",
      he: "אין לי טיסה קרובה בתיק.",
    });
    return { body: confirmGap(lang, detail), handoff: "question", stay: null };
  }
  if (wantsClock(message) && !row.item.clock) return { body: missingClock(lang), handoff: null, stay: row.stay };
  return { body: flightSentence(row.item, row.stay, lang, now), handoff: null, stay: row.stay };
}

function nextHotelAnswer(message: string, dossier: ConciergeDossier, lang: ReplyLang, now: Date): RelativeAnswer | null {
  if (!asksNextHotel(message) || explicitCalendarDate(message, now) || relativeWhen(message, now, tripZone(dossier, now))) return null;
  const row = nextUpcomingHotel(dossier, now);
  if (!row) return null;
  return { body: hotelSentence(row.item, lang, now), handoff: null, stay: row.stay };
}

/** Heure, vol, hôtel, coffre : le routeur répond, le modèle ne parle pas. */
export function routerCanAnswerAlone(
  message: string,
  turn: ConciergeTurn,
  dossier: ConciergeDossier,
  now: Date,
  pending?: ConciergePending[]
) {
  if (turn.optOut || turn.access || turn.handoff) return true;
  if (contestsMessage(message) || asksCheckIn(message) || recallsRoomChange(message, pending) || asksPublishedResend(message)) {
    return true;
  }
  const topic = topicOf(message);
  if (["schedule", "documents", "balance", "transactions", "price", "formality", "included", "chauffeur"].includes(topic)) {
    return true;
  }
  if (asksNextFlight(message) || asksNextHotel(message)) return true;
  if (relativeWhen(message, now, tripZone(dossier, now))) return true;
  const text = fold(message);
  if (/\b(vol|flight|hotel|chambre)\b/.test(text) && topic === "stay") return true;
  return false;
}

export function planConciergeTurn(
  message: string,
  dossier: ConciergeDossier,
  now: Date = new Date(),
  history?: BubbleHistory[],
  pending?: ConciergePending[]
): ConciergeTurn {
  const lang = messageLanguage(message);
  const empty = { cover: null as string | null, optOut: false, access: false };
  const sayTurn = (body: string, block = false) => spoken(body, dossier, lang, now, history, block);

  if (isConciergeStop(message) && !classifyHandoff(message)) {
    const text = sign(stopText(lang));
    return { ...empty, handoff: null, bookingId: null, text, messages: [text], optOut: true };
  }
  if (asksForSpaceAccess(message) && !classifyHandoff(message)) {
    return { ...empty, handoff: null, bookingId: null, text: "", access: true };
  }

  if (contestsMessage(message)) {
    const stay = focusStay(message, dossier.stays);
    const body = say(lang, {
      fr: VERIFY_SENTENCE,
      en: "I’ll check with Benjamin.",
      he: "אני בודק מול הסוכנות.",
    });
    const packed = sayTurn(body);
    return {
      ...empty,
      handoff: isComplaint(message) ? "complaint" : "question",
      bookingId: stay?.id || null,
      text: packed.text,
      messages: packed.messages,
    };
  }

  if (asksCheckIn(message) && !classifyHandoff(message)) {
    const stay = focusStay(message, dossier.stays);
    const agency = sayTurn(conciergeFollowUp(handoffSentence(lang), lang), true);
    return {
      ...empty,
      handoff: "question",
      bookingId: stay?.id || null,
      text: agency.text,
      messages: agency.messages,
    };
  }

  if (recallsRoomChange(message, pending)) {
    const stay = focusStay(message, dossier.stays) || dossier.stays.find((row) => row.id === pending?.find((item) => item.bookingId)?.bookingId);
    const body = say(lang, {
      fr: "Votre demande de changement de chambre est déjà chez l’agence.",
      en: "Your room-change request is already with the agency.",
      he: "בקשת שינוי החדר כבר אצל הסוכנות.",
    });
    const packed = sayTurn(body);
    return {
      ...empty,
      handoff: "change",
      bookingId: stay?.id || null,
      text: packed.text,
      messages: packed.messages,
    };
  }

  const handoff = classifyHandoff(message);
  if (handoff && AGENCY_HANDOFF.has(handoff)) {
    const stay = focusStay(message, dossier.stays);
    const sentence = handoff === "payment" ? benjaminHandoff(lang) : handoffSentence(lang);
    const which = !stay && dossier.stays.length > 1 ? `\n${whichStayText(dossier.stays, lang)}` : "";
    const focused = stay
      ? `\n${say(lang, {
          fr: `Cela concerne le séjour ${stay.reference}.`,
          en: `This is about stay ${stay.reference}.`,
          he: `זה נוגע לשהות ${stay.reference}.`,
        })}\n${stayClientUrl(stay.reference)}`
      : "";
    const agency = sayTurn(conciergeFollowUp(`${sentence}${focused}${which}`, lang), true);
    return {
      ...empty,
      handoff,
      bookingId: stay?.id || null,
      text: agency.text,
      messages: agency.messages,
    };
  }

  const topic = topicOf(message);
  let body = lang === "en" ? "I don’t have that information in your file." : MISSING_FACT;
  let answerHandoff: HandoffKind | null = null;
  let pinned: ConciergeStay | null = null;
  const relative = isDiningRequest(message) ? null : answerRelative(message, dossier, lang, now);
  const upcomingFlight = relative ? null : nextFlightAnswer(message, dossier, lang, now);
  const upcomingHotel = relative || upcomingFlight ? null : nextHotelAnswer(message, dossier, lang, now);
  const resendKind = asksPublishedResend(message);
  if (resendKind) {
    const stay =
      focusStay(message, dossier.stays) ||
      nextUpcomingFlight(dossier, now)?.stay ||
      nextUpcomingHotel(dossier, now)?.stay ||
      (dossier.stays.length === 1 ? dossier.stays[0] : null);
    if (!stay && dossier.stays.length > 1) {
      body = whichStayText(dossier.stays, lang);
    } else if (!stay) {
      body = say(lang, {
        fr: "Je n’ai pas de carnet publié. Je transmets à l’agence.",
        en: "I don’t have a published itinerary. I’m passing this to the agency.",
        he: "אין לי מסלול שפורסם. אני מעביר לסוכנות.",
      });
      answerHandoff = "question";
    } else {
      const url = stayClientUrl(stay.reference);
      body = say(lang, {
        fr:
          resendKind === "flight"
            ? `Votre billet est dans le carnet.\n${url}`
            : resendKind === "hotel"
              ? `La confirmation d’hôtel est dans le carnet.\n${url}`
              : `Voici votre carnet.\n${url}`,
        en:
          resendKind === "flight"
            ? `Your ticket is in the itinerary.\n${url}`
            : resendKind === "hotel"
              ? `The hotel confirmation is in the itinerary.\n${url}`
              : `Here is your itinerary.\n${url}`,
        he: `${url}`,
      });
      pinned = stay;
    }
  } else if (isDiningRequest(message)) {
    body = say(lang, {
      fr: "Je transmets la demande de restaurant à l’agence. Rien n’est réservé.",
      en: "I’m passing the restaurant request to the agency. Nothing is booked.",
      he: "אני מעביר את בקשת המסעדה לסוכנות. שום דבר לא הוזמן.",
    });
    answerHandoff = "question";
  } else if (relative) {
    body = relative.body;
    answerHandoff = relative.handoff;
    pinned = relative.stay;
  } else if (upcomingFlight) {
    body = upcomingFlight.body;
    answerHandoff = upcomingFlight.handoff;
    pinned = upcomingFlight.stay;
  } else if (upcomingHotel) {
    body = upcomingHotel.body;
    answerHandoff = upcomingHotel.handoff;
    pinned = upcomingHotel.stay;
  } else if (topic === "balance") body = balanceText(dossier, lang);
  else if (topic === "transactions") body = movementText(dossier, lang);
  else if (topic === "documents") body = documentText(dossier, lang);
  else if (topic === "formality") body = formalityText(message, dossier, lang);
  else if (topic === "schedule") body = scheduleText(message, dossier, lang, now);
  else if (topic === "included") body = includedText(message, dossier, lang);
  else if (topic === "price") body = priceText(message, dossier, lang);
  else if (topic === "chauffeur") body = chauffeurText(message, dossier, lang);
  else if (topic === "stay") body = stayText(message, dossier, lang, now);
  else if (topic === "hello") body = helloText(dossier, lang, now);
  else {
    body = generalAdvice(message, lang) || offerAgency(lang);
  }

  const complaint = isComplaint(message);
  const thin = answerIsThin(body) || body.includes("Lequel vous intéresse") || body.includes("Which one do you mean");
  if (complaint && (thin || answerHandoff)) {
    if (!/benjamin/i.test(body)) body = `${body}\n${benjaminHandoff(lang)}`;
    const stay = pinned || subjectStay(message, dossier, topic);
    const packed = sayTurn(body);
    return {
      ...empty,
      handoff: "complaint",
      bookingId: stay?.id || null,
      text: packed.text,
      messages: packed.messages,
    };
  }
  if (answerHandoff === "question") {
    const stay = pinned || subjectStay(message, dossier, topic);
    const packed = sayTurn(body);
    return {
      ...empty,
      handoff: "question",
      bookingId: stay?.id || null,
      text: packed.text,
      messages: packed.messages,
    };
  }

  const stay = pinned || subjectStay(message, dossier, topic);
  const packed = sayTurn(body);
  return {
    ...empty,
    handoff: null,
    bookingId: stay?.id || null,
    text: packed.text,
    messages: packed.messages,
    cover: replyImage(message, topic, stay, thin),
  };
}
