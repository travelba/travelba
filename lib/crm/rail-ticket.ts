import { civilClock, zoneOffsetMinutes } from "./airport-time";
import { formatDateFr } from "./dates";
import { greetingGivenName } from "./identity";
import { siteConfig } from "../site";
import { CONCIERGE_SIGNATURE } from "./whatsapp";
import { BOARDING_PASS_SAMPLE_PATH } from "./boarding-pass-whatsapp";

/**
 * Billet de train envoyé seul, une heure avant le départ.
 * Le PDF reste masqué : cet envoi ne change pas visible_to_client.
 * Fenêtre 75 min : un cron de 10 min ne rate pas le créneau, et un train déjà parti ne part plus.
 */
export const RAIL_TICKET_LEAD_MS = 75 * 60 * 1000;
export const RAIL_TICKET_TEMPLATE = "billet_train";
export const RAIL_TICKET_TEMPLATE_ENV = "TWILIO_CONTENT_BILLET_TRAIN";

const MEDIA_BASE = `${siteConfig.url}/api/whatsapp/cartes/`;

const BODY = [
  "Bonjour {{2}},",
  "",
  "Votre billet de train {{3}}, sur le trajet {{4}}, au départ le {{5}}, est joint à ce message. Emplacement : {{6}}.",
  "",
  CONCIERGE_SIGNATURE,
].join("\n");

const MONTHS: Record<string, number> = {
  janvier: 1,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
};

const TRAIN_LINE =
  /\b(TGV\s+INOUI|OUIGO|EUROSTAR|THALYS|LYRIA|INTERCIT[EÉ]S|FRECCIAROSSA|TGV|INOUI|TER|ICE)\s+(\d{2,5})\b/i;

const FRENCH_RAIL = /\b(sncf|ouigo|tgv|inoui|intercites|ter|lyria)\b/i;
const FOREIGN_STATION =
  /\b(londres|london|bruxelles|brussels|geneve|geneva|zurich|zuerich|milan|milano|turin|torino|barcelone|barcelona|madrid|amsterdam|cologne|koln|francfort|frankfurt)\b/i;

const SMALL = new Set(["de", "du", "des", "la", "le", "les", "et", "a", "au", "aux", "en", "sur"]);

export type RailLeg = {
  date: string;
  time: string;
  origin: string;
  destination: string;
  train: string;
  number: string;
  coach: string | null;
  seat: string | null;
};

export type RailCardFace = {
  id: string;
  title: string;
  supplier: string | null;
  startAt: string | null;
  visible: boolean;
  hidden: boolean;
  cancelled: boolean;
  details: Record<string, unknown>;
};

export type RailDocumentFace = {
  id: string;
  itemId: string | null;
  linkedKind: string | null;
  kind: string | null;
  fileName: string | null;
  mime: string | null;
  text: string | null;
  retired: boolean;
};

export type RailTicketSend = {
  itemId: string;
  documentId: string;
  dedupeKey: string;
  train: string;
  route: string;
  when: string;
  place: string;
  filename: string;
  boardingPassKind: boolean;
  instant: number;
};

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function linesOf(text: string) {
  return text
    .replace(/\u00a0/g, " ")
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function titlePlace(value: string) {
  return value
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((part) => {
      if (!/[a-zà-ÿ]/i.test(part)) return part;
      if (SMALL.has(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join("")
    .replace(/^\s*de\b/i, "De");
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function dateFromParts(day: number, month: number, year: number) {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2020 || year > 2100) return "";
  return `${year}-${pad(month)}-${pad(day)}`;
}

function dateFromLine(line: string) {
  const folded = fold(line);
  const long = folded.match(
    /^(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)?\s*(\d{1,2})\s+([a-z]+)\s+(\d{4})$/
  );
  if (long) {
    const month = MONTHS[long[2] || ""];
    if (month) return dateFromParts(Number(long[1]), month, Number(long[3]));
  }
  const numeric = line.match(/\b(\d{2})[/-](\d{2})[/-](\d{4})\b/);
  if (numeric) return dateFromParts(Number(numeric[1]), Number(numeric[2]), Number(numeric[3]));
  return "";
}

function clockOf(hour: string, minute: string) {
  const h = Number(hour);
  const m = Number(minute);
  if (h > 23 || m > 59) return "";
  return `${pad(h)}:${pad(m)}`;
}

/** Trajets lus sur un e-billet (SNCF Connect, OUIGO, Eurostar). Rien n’est inventé. */
export function parseRailTicketText(text: string | null | undefined): RailLeg[] {
  const lines = linesOf(text || "");
  const legs: RailLeg[] = [];
  let date = "";
  let time = "";
  let origin = "";
  let destination = "";
  let train = "";
  let number = "";
  let coach: string | null = null;
  let seat: string | null = null;
  let times = 0;

  function flush() {
    if (date && time && origin && number) {
      legs.push({
        date,
        time,
        origin: titlePlace(origin),
        destination: titlePlace(destination),
        train,
        number,
        coach,
        seat,
      });
    }
    time = "";
    origin = "";
    destination = "";
    train = "";
    number = "";
    coach = null;
    seat = null;
    times = 0;
  }

  for (const line of lines) {
    const nextDate = dateFromLine(line);
    if (nextDate) {
      flush();
      date = nextDate;
      continue;
    }
    const stamp = line.match(/^(\d{1,2})h(\d{2})\s+(.+)$/i) || line.match(/^(\d{1,2}):(\d{2})\s+(.+)$/);
    if (stamp) {
      const clock = clockOf(stamp[1] || "", stamp[2] || "");
      const place = (stamp[3] || "").replace(/\s+/g, " ").trim();
      if (clock && place && !/^\d/.test(place)) {
        if (times === 0) {
          time = clock;
          origin = place;
        } else if (times === 1) destination = place;
        times += 1;
      }
      continue;
    }
    const branded = line.match(TRAIN_LINE);
    if (branded && !number) {
      const brand = (branded[1] || "").replace(/\s+/g, " ").toUpperCase();
      number = branded[2] || "";
      train = `${brand} ${number}`.replace(/\s+/g, " ").trim();
    }
    const coachMatch = line.match(/voiture\s+(\d{1,2})\b/i);
    if (coachMatch && !coach) coach = coachMatch[1] || null;
    const seatMatch = line.match(/place\s+(\d{1,4})\b/i);
    if (seatMatch && !seat) seat = seatMatch[1] || null;
  }
  flush();
  return legs;
}

export function isPdfDocument(doc: { mime?: string | null; fileName?: string | null }) {
  const mime = (doc.mime || "").toLowerCase();
  const name = (doc.fileName || "").toLowerCase();
  return mime.includes("pdf") || name.endsWith(".pdf");
}

function trainFileName(fileName: string | null | undefined) {
  const name = fold(fileName || "");
  if (!name) return false;
  if (/\b(tgv|sncf|ouigo|inoui|eurostar|thalys|lyria|intercites|ter)\b/.test(name)) return true;
  if (/\bgare\b/.test(name)) return true;
  return /_\d{2} \d{2} \d{2}_/.test(`_${name}_`) && /\bgare\b|\btgv\b|\bsncf\b/.test(name);
}

function flightFileName(fileName: string | null | undefined) {
  const raw = fileName || "";
  if (trainFileName(raw)) return false;
  if (/carte[- ]d.?embarquement/i.test(raw)) return true;
  return /\b[A-Z]{2}\s?\d{3,4}\b/i.test(raw);
}

/** Carte d’embarquement d’avion : le modèle « vol / siège » ne doit pas servir. */
export function isFlightBoardingText(text: string | null | undefined) {
  const value = text || "";
  return /carte d[’']embarquement/i.test(value) && /num[eé]ro de vol|flight number/i.test(value);
}

export function isInvoiceOrHotel(doc: { kind?: string | null; fileName?: string | null }, text: string | null) {
  if (parseRailTicketText(text).length) return false;
  const blob = `${doc.kind || ""} ${doc.fileName || ""} ${text || ""}`;
  return /facture|invoice|confirmation d[’']h[oô]tel|voucher|h[oô]tel\b/i.test(blob);
}

/**
 * Indice fichier, sans lire le PDF. Sert à ne pas proposer le formulaire « vol / siège ».
 * Le cron relit le texte avant d’envoyer.
 */
export function railTicketFileHint(doc: {
  kind?: string | null;
  fileName?: string | null;
  mime?: string | null;
  itemId?: string | null;
  linkedKind?: string | null;
}) {
  if (!isPdfDocument(doc) || doc.linkedKind === "flight") return false;
  if (flightFileName(doc.fileName) && !trainFileName(doc.fileName)) return false;
  if (doc.linkedKind === "rail") return true;
  return trainFileName(doc.fileName);
}

function detailText(details: Record<string, unknown>, key: string) {
  const value = details[key];
  return typeof value === "string" ? value.trim() : "";
}

export function railTrainNumber(card: Pick<RailCardFace, "title" | "details">) {
  const stored = detailText(card.details, "train_number").replace(/\s+/g, "");
  if (/^\d{2,5}$/.test(stored)) return stored;
  const fromTitle = card.title.match(TRAIN_LINE);
  return fromTitle?.[2] || "";
}

export function railTrainLabel(card: Pick<RailCardFace, "title" | "details">) {
  const fromTitle = card.title.match(TRAIN_LINE);
  if (fromTitle) return `${(fromTitle[1] || "").replace(/\s+/g, " ").toUpperCase()} ${fromTitle[2]}`.replace(/\s+/g, " ");
  const number = railTrainNumber(card);
  return number ? `Train ${number}` : "";
}

export function railRouteFromTitle(title: string) {
  const parts = title.split(/\s*(?:→|->)\s*/);
  if (parts.length < 2) return null;
  const origin = (parts[0] || "").replace(TRAIN_LINE, "").replace(/^[,\s-]+|[,\s-]+$/g, "").trim();
  const destination = (parts[1] || "")
    .replace(/,\s*\d+\s*(?:re|e|ère|ere|de)\b.*$/i, "")
    .replace(/^[,\s-]+|[,\s-]+$/g, "")
    .trim();
  if (!origin || !destination) return null;
  return { origin, destination };
}

export function railOrigin(card: Pick<RailCardFace, "title" | "details">) {
  const stored = detailText(card.details, "from") || detailText(card.details, "origin");
  if (stored) return stored;
  return railRouteFromTitle(card.title)?.origin || "";
}

function stationCandidates(origin: string) {
  const cleaned = origin.replace(/\s+/g, " ").trim();
  const beforeGare = cleaned.match(/^(.+?)\s+gare\b/i)?.[1]?.trim() || "";
  const head = cleaned.split(/[-–]/)[0]?.trim() || "";
  const first = cleaned.split(/\s+/)[0] || "";
  return [...new Set([cleaned, beforeGare, head, first].filter((value) => value.length >= 3))];
}

function validZone(value: string) {
  if (!value.includes("/")) return null;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return null;
  }
}

/**
 * Fuseau du départ. Les chiffres de start_at sont l’heure civile : le +00 stocké n’est pas le décalage.
 * Sans ville résolue, un train français reste sur Europe/Paris. Une gare étrangère n’est pas devinée.
 */
export function railDepartureZone(
  card: Pick<RailCardFace, "title" | "supplier" | "details">,
  resolveCity: (city: string) => string | null
) {
  const stored = validZone(detailText(card.details, "departure_timezone"));
  if (stored) return stored;
  const origin = railOrigin(card);
  for (const candidate of stationCandidates(origin)) {
    const zone = validZone(resolveCity(candidate) || "");
    if (zone) return zone;
  }
  if (FOREIGN_STATION.test(fold(origin))) return null;
  if (FRENCH_RAIL.test(card.supplier || "") || FRENCH_RAIL.test(card.title)) return "Europe/Paris";
  return null;
}

/** Instant UTC réel. 12:46 à Paris en décembre est 11:46 UTC, même si la base dit +00. */
export function railDepartureInstant(startAt: string | null | undefined, zone: string | null | undefined) {
  const clock = civilClock(startAt);
  if (!clock || !zone || !validZone(zone)) return null;
  const offset = zoneOffsetMinutes(clock, zone);
  const match = clock.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
  if (offset == null || !match) return null;
  const utc = Date.UTC(
    Number(match[1].slice(0, 4)),
    Number(match[1].slice(5, 7)) - 1,
    Number(match[1].slice(8, 10)),
    Number(match[2]),
    Number(match[3]),
    Number(match[4])
  );
  return utc - offset * 60_000;
}

export function railTicketDue(instant: number, now: number) {
  const delta = instant - now;
  return delta > 0 && delta <= RAIL_TICKET_LEAD_MS;
}

function samePlace(left: string, right: string) {
  const a = fold(left);
  const b = fold(right);
  if (!a || !b) return true;
  return a === b || a.includes(b) || b.includes(a);
}

export function legMatchesCard(leg: RailLeg, card: RailCardFace) {
  const day = (card.startAt || "").slice(0, 10);
  if (!day || leg.date !== day) return false;
  const cardNumber = railTrainNumber(card);
  const cardTime = civilClock(card.startAt)?.slice(11, 16) || "";
  const numberAgrees = !cardNumber || !leg.number || cardNumber === leg.number;
  const timeAgrees = !cardTime || !leg.time || cardTime === leg.time;
  if (!numberAgrees || !timeAgrees) return false;
  if (cardNumber && leg.number && cardNumber === leg.number) return samePlace(leg.origin, railOrigin(card));
  if (cardTime && leg.time && cardTime === leg.time) return samePlace(leg.origin, railOrigin(card));
  return false;
}

function filenameDay(fileName: string | null | undefined) {
  const match = (fileName || "").match(/(?:^|_)(\d{2})-(\d{2})-(\d{2,4})(?:_|\.)/);
  if (!match) return "";
  const year = (match[3] || "").length === 2 ? `20${match[3]}` : match[3] || "";
  return dateFromParts(Number(match[1]), Number(match[2]), Number(year));
}

function placePhrase(leg: RailLeg | null, card: RailCardFace) {
  if (leg?.coach && leg.seat) return `voiture ${leg.coach}, place ${leg.seat}`;
  if (leg?.coach) return `voiture ${leg.coach}`;
  if (leg?.seat) return `place ${leg.seat}`;
  const coach = detailText(card.details, "voiture") || detailText(card.details, "coach");
  if (/^\d{1,2}$/.test(coach)) return `voiture ${coach}`;
  return "indiqué sur le billet";
}

function clean(value: string, max: number) {
  const text = value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  if (!text || text.length > max || text.includes("{{") || text.includes("}}")) return "";
  if (/\b[A-Z]{1,2}\d{6,9}\b/.test(text)) return "";
  return text;
}

export function railTicketWhen(startAt: string | null | undefined) {
  const clock = civilClock(startAt);
  if (!clock) return "";
  const day = formatDateFr(clock.slice(0, 10));
  if (!day || day === "—") return "";
  return `${day} à ${clock.slice(11, 13)}h${clock.slice(14, 16)}`;
}

export function railTicketDedupeKey(itemId: string, documentId: string, startAt: string | null | undefined) {
  const clock = civilClock(startAt)?.slice(0, 16) || "heure";
  return `billet-train:${itemId}:${documentId}:${clock}`.slice(0, 180);
}

export function railTicketFileName(number: string, date: string) {
  const train = number.replace(/\D/g, "").slice(0, 5);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "depart";
  const name = train ? `Billet-train-${train}-${day}.pdf` : `Billet-train-${day}.pdf`;
  return name.length <= 80 ? name : "Billet-train.pdf";
}

function routeOf(card: RailCardFace, leg: RailLeg | null) {
  const fromTitle = railRouteFromTitle(card.title);
  if (fromTitle) return `${fromTitle.origin} → ${fromTitle.destination}`;
  if (leg?.origin && leg.destination) return `${leg.origin} → ${leg.destination}`;
  return "";
}

function activeCard(card: RailCardFace) {
  return card.visible && !card.hidden && !card.cancelled;
}

/**
 * Un envoi par départ dû et par PDF qui couvre ce départ.
 * Le même PDF aller-retour revient pour le retour, avec une autre clé.
 */
export function planRailTicketSends(input: {
  now: number;
  bookingVisible: boolean;
  customerReady: boolean;
  cards: RailCardFace[];
  documents: RailDocumentFace[];
  resolveCity: (city: string) => string | null;
}): RailTicketSend[] {
  if (!input.bookingVisible || !input.customerReady) return [];
  const sends: RailTicketSend[] = [];
  const seen = new Set<string>();
  for (const card of input.cards) {
    if (!activeCard(card)) continue;
    const zone = railDepartureZone(card, input.resolveCity);
    const instant = railDepartureInstant(card.startAt, zone);
    if (instant == null || !railTicketDue(instant, input.now)) continue;
    const train = clean(railTrainLabel(card), 40);
    const when = clean(railTicketWhen(card.startAt), 60);
    if (!train || !when) continue;
    for (const doc of input.documents) {
      if (doc.retired || !isPdfDocument(doc)) continue;
      if (doc.linkedKind === "flight" && !parseRailTicketText(doc.text).length) continue;
      const legs = parseRailTicketText(doc.text);
      if (isFlightBoardingText(doc.text) && !legs.length) continue;
      if (isInvoiceOrHotel(doc, doc.text) && !legs.length) continue;
      const leg = legs.find((row) => legMatchesCard(row, card)) || null;
      const linked = doc.itemId === card.id;
      const namedDay = !legs.length && filenameDay(doc.fileName) === (card.startAt || "").slice(0, 10);
      const hinted = railTicketFileHint({ ...doc, itemId: doc.itemId });
      if (!leg && !linked && !(namedDay && hinted)) continue;
      const route = clean(routeOf(card, leg), 80);
      const place = clean(placePhrase(leg, card), 60);
      const filename = railTicketFileName(railTrainNumber(card) || leg?.number || "", (card.startAt || "").slice(0, 10));
      if (!route || !place || !filename) continue;
      const dedupeKey = railTicketDedupeKey(card.id, doc.id, card.startAt);
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      const kind = (doc.kind || "").replace(/\s+/g, " ").trim().toLowerCase();
      sends.push({
        itemId: card.id,
        documentId: doc.id,
        dedupeKey,
        train,
        route,
        when,
        place,
        filename,
        boardingPassKind: kind === "carte d'embarquement" || kind === "carte d’embarquement",
        instant,
      });
    }
  }
  return sends;
}

export function railTicketChannel(input: {
  dedicatedSid: string | null;
  freeDocumentSid: string | null;
  windowOpen: boolean;
  boardingPassKind: boolean;
}): "billet_train" | "message_libre_document" | "session" | null {
  if (input.dedicatedSid && input.boardingPassKind) return "billet_train";
  if (input.freeDocumentSid) return "message_libre_document";
  if (input.windowOpen) return "session";
  return null;
}

export function railTicketFields(input: { firstName: string; train: string; route: string; when: string; place: string }) {
  const firstName = clean(greetingGivenName(input.firstName) || "voyageur", 40);
  const train = clean(input.train, 40);
  const route = clean(input.route, 80);
  const when = clean(input.when, 60);
  const place = clean(input.place, 60);
  if (!firstName || !train || !route || !when || !place) return null;
  return { firstName, train, route, when, place };
}

export function railTicketPreview(fields: { firstName: string; train: string; route: string; when: string; place: string }) {
  const text = BODY.replace("{{2}}", fields.firstName)
    .replace("{{3}}", fields.train)
    .replace("{{4}}", fields.route)
    .replace("{{5}}", fields.when)
    .replace("{{6}}", fields.place);
  if (/\{\{\d+\}\}/.test(text)) return null;
  return text;
}

export function railTicketContentVariables(mediaPath: string, fields: { firstName: string; train: string; route: string; when: string; place: string }) {
  if (!mediaPath.endsWith(".pdf") || mediaPath.includes("..") || /^https?:/i.test(mediaPath)) return null;
  return { "1": mediaPath, "2": fields.firstName, "3": fields.train, "4": fields.route, "5": fields.when, "6": fields.place };
}

/** Une ligne, pour le modèle message_libre_document ou la fenêtre de 24 h. */
export function railTicketNoticeText(fields: { train: string; route: string; when: string; place: string }) {
  return clean(
    `Votre billet de train ${fields.train}, trajet ${fields.route}, départ le ${fields.when}, emplacement ${fields.place}, est joint à ce message.`,
    500
  );
}

export function railTicketContentDrafts() {
  return [
    {
      template: RAIL_TICKET_TEMPLATE,
      env: RAIL_TICKET_TEMPLATE_ENV,
      friendlyName: RAIL_TICKET_TEMPLATE,
      create: {
        friendly_name: RAIL_TICKET_TEMPLATE,
        language: "fr" as const,
        variables: {
          "1": BOARDING_PASS_SAMPLE_PATH,
          "2": "Camille",
          "3": "TGV INOUI 6941",
          "4": "Paris Gare de Lyon → Chambéry",
          "5": "20 déc. 2026 à 12h46",
          "6": "voiture 2, place 12",
        },
        types: {
          "twilio/media": {
            body: BODY,
            media: [`${MEDIA_BASE}{{1}}`],
          },
        },
      },
    },
  ];
}

export function railTicketDraftBody() {
  return BODY;
}

export function railTicketUnapprovedNote() {
  return [
    "Le modèle WhatsApp « billet_train » est optionnel.",
    "À soumettre : catégorie Utility, langue français, nom billet_train.",
    "En-tête : Document (PDF). Variable {{1}} : chemin du fichier.",
    `Adresse du document : ${MEDIA_BASE}{{1}}.`,
    "Variables : {{2}} prénom, {{3}} train, {{4}} trajet, {{5}} date et heure de départ, {{6}} voiture et place.",
    "Corps :",
    BODY,
    `Une fois approuvé, coller le SID dans ${RAIL_TICKET_TEMPLATE_ENV} (Production), puis redéployer.`,
    "Sans ce SID, l’envoi utilise message_libre_document s’il est approuvé, sinon le message de session dans les 24 h.",
  ].join("\n");
}
