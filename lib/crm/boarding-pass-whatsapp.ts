import { flightCities, flightIata, flightNumber, itemClock } from "./carnet";
import { formatDateFr } from "./dates";
import { greetingGivenName } from "./identity";
import { maskAuditText } from "./audit-events";
import { siteConfig } from "../site";
import { CONCIERGE_SIGNATURE } from "./whatsapp";
import { isActiveItem, type CrmBookingDocument, type CrmBookingItem } from "./types";

/**
 * Pièce du dossier dont le PDF part en carte d’embarquement.
 * Ce type ne déclenche pas le message automatique « pièce publiée ».
 */
export const BOARDING_PASS_KIND = "carte d'embarquement";

/**
 * WhatsApp classe l’en-tête selon le fichier d’exemple.
 * Un PDF sur `twilio/media` devient un en-tête DOCUMENT : un seul fichier par message.
 * Plusieurs voyageurs : un message par PDF, pas un PDF fusionné (le siège et le nom de fichier resteraient illisibles, et l’en-tête n’accepte qu’un document).
 */
export const BOARDING_PASS_SEND_MODE = "un message par pdf";

export const BOARDING_PASS_URL_TTL_SECONDS = 60 * 60;

/** Chemin d’exemple, sans jeton. Le fichier public sert à l’approbation Meta. */
export const BOARDING_PASS_SAMPLE_PATH = "exemple/carte-embarquement-exemple.pdf";
export const BOARDING_PASS_SAMPLE_FILE = "carte-embarquement-exemple.pdf";
export const BOARDING_PASS_SAMPLE_NAME = "Carte embarquement EXEMPLE.pdf";

const MEDIA_BASE = `${siteConfig.url}/api/whatsapp/cartes/`;

export const BOARDING_PASS_TEMPLATE_ENV = {
  carte_embarquement: "TWILIO_CONTENT_CARTE_EMBARQUEMENT",
  cartes_embarquement: "TWILIO_CONTENT_CARTES_EMBARQUEMENT",
  enregistrement_aeroport: "TWILIO_CONTENT_ENREGISTREMENT_AEROPORT",
} as const;

export type BoardingPassTemplate = keyof typeof BOARDING_PASS_TEMPLATE_ENV;

const SINGLE_BODY = [
  "Bonjour {{2}},",
  "",
  "Votre carte d’embarquement pour le vol {{3}}, sur le trajet {{4}}, le {{5}}, siège {{6}}, est jointe à ce message.",
  "",
  CONCIERGE_SIGNATURE,
].join("\n");

const GROUP_BODY = [
  "Bonjour,",
  "",
  "Voici la carte d’embarquement de {{2}} pour le vol {{3}}, sur le trajet {{4}}, le {{5}}. Le siège indiqué est {{6}}.",
  "",
  CONCIERGE_SIGNATURE,
].join("\n");

const AIRPORT_BODY = [
  "Bonjour {{1}},",
  "",
  "Pour le vol {{2}}, sur le trajet {{3}}, au départ du {{4}}, la situation est la suivante : {{5}}.",
  "",
  "Présentez-vous au comptoir de la compagnie à l’aéroport, avec une pièce d’identité. L’agence reste joignable.",
  "",
  CONCIERGE_SIGNATURE,
].join("\n");

export const CHECKIN_SITUATIONS = {
  echec: "l’enregistrement en ligne a échoué",
  comptoir: "il reste à le terminer au comptoir de la compagnie",
} as const;

export type CheckinSituation = keyof typeof CHECKIN_SITUATIONS;

const SAMPLE_FIELDS = {
  "2": "Meryl",
  "3": "AF 1234",
  "4": "Paris → Tel Aviv",
  "5": "12 oct. 2026 à 11h20",
  "6": "12A",
};

function mediaTemplate(body: string, samples: Record<string, string>) {
  return {
    friendly_name: "",
    language: "fr" as const,
    variables: { "1": BOARDING_PASS_SAMPLE_PATH, ...samples },
    types: {
      "twilio/media": {
        body,
        media: [`${MEDIA_BASE}{{1}}`],
      },
    },
  };
}

/** Brouillons soumis par `scripts/arm-whatsapp-concierge.ts`. Le SID n’est pas ici. */
export function boardingPassContentDrafts() {
  const single = mediaTemplate(SINGLE_BODY, SAMPLE_FIELDS);
  single.friendly_name = "carte_embarquement";
  const group = mediaTemplate(GROUP_BODY, SAMPLE_FIELDS);
  group.friendly_name = "cartes_embarquement";
  return [
    {
      template: "carte_embarquement" as const,
      env: BOARDING_PASS_TEMPLATE_ENV.carte_embarquement,
      friendlyName: "carte_embarquement",
      create: single,
    },
    {
      template: "cartes_embarquement" as const,
      env: BOARDING_PASS_TEMPLATE_ENV.cartes_embarquement,
      friendlyName: "cartes_embarquement",
      create: group,
    },
    {
      template: "enregistrement_aeroport" as const,
      env: BOARDING_PASS_TEMPLATE_ENV.enregistrement_aeroport,
      friendlyName: "enregistrement_aeroport",
      create: {
        friendly_name: "enregistrement_aeroport",
        language: "fr" as const,
        variables: {
          "1": "Meryl",
          "2": "AF 1234",
          "3": "Paris → Tel Aviv",
          "4": "12 oct. 2026 à 11h20",
          "5": CHECKIN_SITUATIONS.echec,
        },
        types: {
          "twilio/text": { body: AIRPORT_BODY },
        },
      },
    },
  ];
}

export function boardingPassTemplateForCount(count: number): "carte_embarquement" | "cartes_embarquement" | null {
  if (count === 1) return "carte_embarquement";
  if (count > 1) return "cartes_embarquement";
  return null;
}

export function isBoardingPassKind(kind: string | null | undefined) {
  const value = (kind || "").replace(/\s+/g, " ").trim().toLowerCase();
  return value === BOARDING_PASS_KIND || value === "carte d’embarquement";
}

export function isBoardingPassFile(doc: { kind?: string | null; mime_type?: string | null; file_name?: string | null }) {
  if (!isBoardingPassKind(doc.kind)) return false;
  const mime = (doc.mime_type || "").toLowerCase();
  const name = (doc.file_name || "").toLowerCase();
  return mime.includes("pdf") || name.endsWith(".pdf");
}

const PASSPORT = /\b[A-Z]{1,2}\d{6,9}\b/i;
const MRZ = /[A-Z0-9<]{28,}/i;

/** Valeur de modèle : une ligne, sans numéro de pièce. */
export function cleanTemplateValue(value: string | null | undefined, max: number) {
  const text = String(value || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  if (!text || text.length > max) return null;
  if (text.includes("{{") || text.includes("}}")) return null;
  if (PASSPORT.test(text) || MRZ.test(text.replace(/\s/g, ""))) return null;
  return text;
}

export type BoardingPassFields = {
  firstName: string;
  lastName: string;
  flight: string;
  route: string;
  when: string;
  seat: string;
};

/** Un seul siège (6G, 06G, 12A). « 06G / 06D » n’est pas un siège. */
export function singleSeat(value: string | null | undefined) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const codes = text.match(/\d{1,2}[A-Z]\b/gi) || [];
  if (codes.length !== 1) return "";
  return (codes[0] || "").toUpperCase();
}

export function boardingPassFields(input: Partial<BoardingPassFields> | null | undefined): BoardingPassFields | null {
  const firstName = cleanTemplateValue(input?.firstName, 40);
  const lastName = cleanTemplateValue(input?.lastName, 40);
  const flight = cleanTemplateValue(input?.flight, 40);
  const route = cleanTemplateValue(input?.route, 80);
  const when = cleanTemplateValue(input?.when, 60);
  const seatSource = cleanTemplateValue(input?.seat, 12);
  const seat = seatSource ? singleSeat(seatSource) : null;
  if (!firstName || !lastName || !flight || !route || !when || !seat) return null;
  return { firstName, lastName, flight, route, when, seat };
}

function asciiName(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9 .'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** « Carte embarquement LEVY Meryl AF1234.pdf ». Le nom de famille est en capitales. */
export function boardingPassFileName(fields: Pick<BoardingPassFields, "lastName" | "firstName" | "flight">) {
  const last = asciiName(fields.lastName).toUpperCase();
  const first = asciiName(fields.firstName);
  const flight = asciiName(fields.flight).replace(/\s+/g, "");
  if (!last || !first || !flight) return null;
  if (PASSPORT.test(last) || PASSPORT.test(flight)) return null;
  const name = `Carte embarquement ${last} ${first} ${flight}.pdf`;
  if (name.length > 120 || /["\\\r\n]/.test(name)) return null;
  return name;
}

export function boardingPassContentDisposition(filename: string) {
  const safe = filename.replace(/["\\\r\n]/g, "").slice(0, 180);
  return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

export function walletPassDownloadHeaders(filename = "passe.pkpass"): Record<string, string> {
  const safe = filename.toLowerCase().endsWith(".pkpass") ? filename : "passe.pkpass";
  return {
    "Content-Type": "application/vnd.apple.pkpass",
    "Content-Disposition": boardingPassContentDisposition(safe),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
}

export function walletPassPublicUrl(signedPath: string | null) {
  if (!signedPath || !/^[^/]+\.[^/]+\.[^/]+\/passe\.pkpass$/.test(signedPath)) return null;
  return `${siteConfig.url}/api/whatsapp/cartes/${signedPath}`;
}

/** Phrase envoyée avec le PDF quand un .pkpass existe pour ce passager. */
export function walletPassNotice(firstName: string, url: string | null) {
  if (!url || !url.startsWith(`${siteConfig.url}/api/whatsapp/cartes/`) || !url.endsWith("/passe.pkpass")) return null;
  const name = cleanTemplateValue(firstName, 40);
  const who = name ? `de ${name} ` : "";
  const text = `Ajoutez la carte d’embarquement ${who}à Apple Wallet : ${url}`;
  if (text.length > 500 || text.includes("{{")) return null;
  return text;
}

export function boardingPassDownloadHeaders(
  filename: string,
  disposition: "attachment" | "inline" = "attachment"
): Record<string, string> {
  const header = boardingPassContentDisposition(filename).replace(/^attachment/, disposition);
  return {
    "Content-Type": "application/pdf",
    "Content-Disposition": header,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
}

/** Chemin après le domaine, pour la variable {{1}}. Le nom de fichier est encodé. */
export function boardingPassMediaVariable(token: string, filename: string) {
  if (!token || token.includes("/") || filename.includes("/") || !filename.toLowerCase().endsWith(".pdf")) return null;
  return `${token}/${encodeURIComponent(filename)}`;
}

export function boardingPassContentVariables(mediaPath: string, fields: BoardingPassFields) {
  if (!mediaPath.endsWith(".pdf") || mediaPath.includes("..") || /^https?:/i.test(mediaPath)) return null;
  return {
    "1": mediaPath,
    "2": fields.firstName,
    "3": fields.flight,
    "4": fields.route,
    "5": fields.when,
    "6": fields.seat,
  };
}

function applyVars(body: string, variables: Record<string, string>) {
  return body.replace(/\{\{(\d+)\}\}/g, (_, key: string) => variables[key] ?? "");
}

export function boardingPassPreview(template: "carte_embarquement" | "cartes_embarquement", fields: BoardingPassFields) {
  const body = template === "cartes_embarquement" ? GROUP_BODY : SINGLE_BODY;
  const text = applyVars(body, {
    "2": fields.firstName,
    "3": fields.flight,
    "4": fields.route,
    "5": fields.when,
    "6": fields.seat,
  });
  if (/\{\{\d+\}\}/.test(text)) return null;
  return text;
}

export function checkinAirportPreview(input: {
  firstName: string;
  flight: string;
  route: string;
  when: string;
  situation: CheckinSituation;
}) {
  const firstName = cleanTemplateValue(input.firstName, 40);
  const flight = cleanTemplateValue(input.flight, 40);
  const route = cleanTemplateValue(input.route, 80);
  const when = cleanTemplateValue(input.when, 60);
  const situation = CHECKIN_SITUATIONS[input.situation];
  if (!firstName || !flight || !route || !when || !situation) return null;
  const text = applyVars(AIRPORT_BODY, { "1": firstName, "2": flight, "3": route, "4": when, "5": situation });
  if (/\{\{\d+\}\}/.test(text)) return null;
  return text;
}

export function checkinAirportVariables(input: {
  firstName: string;
  flight: string;
  route: string;
  when: string;
  situation: CheckinSituation;
}) {
  const firstName = cleanTemplateValue(input.firstName, 40);
  const flight = cleanTemplateValue(input.flight, 40);
  const route = cleanTemplateValue(input.route, 80);
  const when = cleanTemplateValue(input.when, 60);
  const situation = CHECKIN_SITUATIONS[input.situation];
  if (!firstName || !flight || !route || !when || !situation) return null;
  return { "1": firstName, "2": flight, "3": route, "4": when, "5": situation };
}

export function boardingPassChannelBlock(input: { phone?: string | null; optInAt?: string | null; optOutAt?: string | null }) {
  if (!input.phone?.trim()) return "Ce client n’a pas de téléphone pour WhatsApp.";
  if (!input.optInAt || input.optOutAt) return "Ce client n’a pas accepté WhatsApp.";
  return null;
}

export function boardingWhen(startAt: string | null | undefined) {
  if (!startAt) return "";
  const day = startAt.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "";
  const date = formatDateFr(day);
  if (!date || date === "—") return "";
  const clock = itemClock(startAt);
  return clock ? `${date} à ${clock}` : date;
}

function fold(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function flightLabel(item: CrmBookingItem) {
  return flightNumber(item) || "";
}

function routeLabel(item: CrmBookingItem) {
  return flightCities(item) || flightIata(item) || (item.title || "").trim();
}

function flightForDocument(doc: Pick<CrmBookingDocument, "id" | "booking_item_id">, items: CrmBookingItem[]) {
  const linked = items.find(
    (item) => item.kind === "flight" && isActiveItem(item) && (item.id === doc.booking_item_id || item.source_document_id === doc.id)
  );
  if (linked) return linked;
  const flights = items.filter((item) => item.kind === "flight" && isActiveItem(item));
  return flights.length === 1 ? flights[0] : null;
}

function matchPerson<T extends { first_name?: string | null; last_name?: string | null }>(fileName: string | null, people: T[]) {
  const hay = fold(fileName || "");
  if (!hay) return null;
  const hits = people.filter((person) => {
    const last = fold(person.last_name || "");
    return last.length >= 2 && hay.includes(last);
  });
  return hits.length === 1 ? hits[0] : null;
}

type NamedTraveler = {
  first_name?: string | null;
  last_name?: string | null;
  pnr?: string | null;
  seat?: string | null;
};

function normPnr(value: string | null | undefined) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Code de dossier (5 à 8 signes, lettre et chiffre). Un numéro de vol n’en est pas un. */
function pnrTokens(value: string, flightCode = "") {
  const banned = normPnr(flightCode);
  const found = value.toUpperCase().match(/\b[A-Z0-9]{5,8}\b/g) || [];
  return [
    ...new Set(
      found.filter((token) => {
        if (!/[A-Z]/.test(token) || !/\d/.test(token)) return false;
        if (/^[A-Z]{1,3}\d{2,4}$/.test(token)) return false;
        if (banned && token === banned) return false;
        return true;
      })
    ),
  ];
}

function passengerRecords(details: Record<string, unknown> | null | undefined): NamedTraveler[] {
  const rows = details?.passengers;
  if (!Array.isArray(rows)) return [];
  const people: NamedTraveler[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as NamedTraveler;
    const first = String(record.first_name || "").trim();
    const last = String(record.last_name || "").trim();
    if (!first && !last) continue;
    people.push({
      first_name: first || null,
      last_name: last || null,
      pnr: typeof record.pnr === "string" ? record.pnr : null,
      seat: typeof record.seat === "string" ? record.seat : null,
    });
  }
  return people;
}

function matchGiven(name: string, people: NamedTraveler[]) {
  const needle = fold(greetingGivenName(name) || name);
  if (needle.length < 2) return null;
  const hits = people.filter((person) => fold(greetingGivenName(person.first_name) || "") === needle);
  return hits.length === 1 ? hits[0] : null;
}

function noteBindings(notes: string) {
  const rows: { name: string; code: string }[] = [];
  const re = /\bPNR\s+([A-Za-zÀ-ÿ'’.-]{2,40})\s+([A-Z0-9]{5,8})\b/gi;
  for (const match of notes.matchAll(re)) {
    const name = (match[1] || "").trim();
    const code = (match[2] || "").toUpperCase();
    if (!name || !/[A-Z]/.test(code) || !/\d/.test(code) || /^[A-Z]{1,3}\d{2,4}$/.test(code)) continue;
    rows.push({ name, code });
  }
  return rows;
}

function sameTraveler(a: NamedTraveler, b: NamedTraveler) {
  const lastA = fold(a.last_name || "");
  const lastB = fold(b.last_name || "");
  const firstA = fold(greetingGivenName(a.first_name) || "");
  const firstB = fold(greetingGivenName(b.first_name) || "");
  if (lastA && lastB && lastA !== lastB) return false;
  if (firstA && firstB && firstA !== firstB) return false;
  return Boolean(firstA && firstB) || Boolean(lastA && lastB);
}

function seatFor(person: NamedTraveler, records: NamedTraveler[], cardSeat: string) {
  const row = records.find((record) => sameTraveler(record, person));
  const own = singleSeat(row?.seat);
  if (own) return own;
  if (row && records.length === 1) return singleSeat(cardSeat);
  if (!records.length) return singleSeat(cardSeat);
  return "";
}

/**
 * Champs proposés pour le formulaire.
 * Le passager vient du nom dans le fichier, ou du PNR du fichier rapproché des notes.
 * Sans cet appariement, le prénom et le siège restent vides : on ne choisit pas le seul passager connu,
 * et on ne recopie pas un siège combiné.
 */
export function suggestBoardingPass(input: {
  doc: Pick<CrmBookingDocument, "id" | "kind" | "file_name" | "booking_item_id" | "mime_type">;
  items: CrmBookingItem[];
  travelers: { first_name?: string | null; last_name?: string | null }[];
}): BoardingPassFields {
  const empty: BoardingPassFields = { firstName: "", lastName: "", flight: "", route: "", when: "", seat: "" };
  const flight = flightForDocument(input.doc, input.items);
  const records = flight ? passengerRecords(flight.details) : [];
  const travelers: NamedTraveler[] = input.travelers.map((person) => ({
    first_name: person.first_name,
    last_name: person.last_name,
  }));
  const pool = records.length ? records : travelers;
  const notes = flight && typeof flight.details?.notes === "string" ? flight.details.notes : "";
  const fileCodes = pnrTokens(input.doc.file_name || "", flight ? flightLabel(flight) : "");
  const byFile = records.filter((person) => fileCodes.includes(normPnr(person.pnr)));
  let person: NamedTraveler | null = null;
  if (byFile.length === 1) person = byFile[0];
  else if (byFile.length === 0) {
    const bindings = noteBindings(notes);
    const linked = fileCodes.length
      ? bindings.filter((row) => fileCodes.includes(row.code))
      : bindings.length === 1
        ? bindings
        : [];
    if (linked.length === 1) {
      person = matchGiven(linked[0]?.name || "", records) || matchGiven(linked[0]?.name || "", travelers);
    }
    if (!person) person = matchPerson(input.doc.file_name, pool) || null;
  }
  const cardSeat = flight && typeof flight.details?.seat === "string" ? flight.details.seat : "";
  return {
    firstName: greetingGivenName(person?.first_name) || "",
    lastName: (person?.last_name || "").trim(),
    flight: flight ? flightLabel(flight) : empty.flight,
    route: flight ? routeLabel(flight) : empty.route,
    when: flight ? boardingWhen(flight.start_at) : "",
    seat: person ? seatFor(person, records, cardSeat) : "",
  };
}

export function boardingPassJournal(input: { names: string[]; flight: string; route: string; count: number }) {
  const names = input.names.map((name) => cleanTemplateValue(name, 40)).filter((name): name is string => Boolean(name));
  const flight = cleanTemplateValue(input.flight, 40) || "";
  const route = cleanTemplateValue(input.route, 80) || "";
  const who = names.join(", ") || "voyageur";
  const summary = maskAuditText(
    input.count > 1
      ? `Cartes d’embarquement envoyées · ${who} · ${flight}`
      : `Carte d’embarquement envoyée · ${who} · ${flight}`
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  const detail = maskAuditText(route).replace(/\s+/g, " ").trim().slice(0, 400) || null;
  return { action: "whatsapp_carte_embarquement", summary, detail };
}

export function checkinJournal(input: { firstName: string; flight: string; route: string; situation: CheckinSituation }) {
  const name = cleanTemplateValue(input.firstName, 40) || "voyageur";
  const flight = cleanTemplateValue(input.flight, 40) || "";
  const route = cleanTemplateValue(input.route, 80) || "";
  const situation = input.situation === "echec" ? "enregistrement en ligne échoué" : "enregistrement à terminer à l’aéroport";
  const summary = maskAuditText(`WhatsApp · ${situation} · ${name} · ${flight}`)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  const detail = maskAuditText(route).replace(/\s+/g, " ").trim().slice(0, 400) || null;
  return { action: "whatsapp_enregistrement_aeroport", summary, detail };
}

export function boardingPassDraftBody(template: BoardingPassTemplate) {
  const draft = boardingPassContentDrafts().find((row) => row.template === template);
  if (!draft) return null;
  const types = draft.create.types as { "twilio/media"?: { body?: string }; "twilio/text"?: { body?: string } };
  return types["twilio/media"]?.body || types["twilio/text"]?.body || null;
}

/** Une carte, un envoi. Le bouton du dossier et l’outil MCP partagent cette clé. */
export function boardingPassDedupeKey(documentId: string) {
  return `carte-embarquement:${documentId}`;
}

/**
 * Modèle à déposer chez Meta quand `TWILIO_CONTENT_CARTE_EMBARQUEMENT` est absent
 * ou pas encore approuvé. Le SID n’est pas dans ce texte.
 */
export function boardingPassUnapprovedMessage() {
  const body = boardingPassDraftBody("carte_embarquement") || SINGLE_BODY;
  return [
    "Le modèle WhatsApp « carte_embarquement » n’est pas encore approuvé par Meta.",
    "À soumettre : catégorie Utility, langue français, nom carte_embarquement.",
    "En-tête : Document (PDF). Variable {{1}} : chemin du fichier, exemple exemple/carte-embarquement-exemple.pdf.",
    `Adresse du document : ${siteConfig.url}/api/whatsapp/cartes/{{1}}.`,
    "Variables : {{2}} prénom, {{3}} vol, {{4}} trajet, {{5}} date et heure, {{6}} siège.",
    "Corps :",
    body,
    "Une fois approuvé, coller le SID dans TWILIO_CONTENT_CARTE_EMBARQUEMENT (Production), puis redéployer.",
  ].join("\n");
}
