import { hotelCityLine, hotelDisplayName, itemClock, nightsBetween } from "./carnet";
import { hotelContact, leHotelIdFromItem, type HotelContact } from "./hotel-contact";
import {
  businessDaysBefore,
  emailAddress,
  formatArrivalAmount,
  formatStayDate,
  hotelChannel,
  hotelLanguage,
  hotelMailFrame,
  isoDate,
  linkRequestMail,
  nextBusinessDay,
  parisIsoDate,
  paymentUrlFromText,
} from "./hotel-arrival";
import type { CrmBookingItem, CrmHotelMessage, CrmHotelRequest, CrmHotelThreadMessage, HotelDeskKind, HotelDeskStatus } from "./types";
import { HOTEL_DESK_KINDS } from "./types";

/** Expéditeur et adresse de réponse du bureau hôtel. */
export const HOTEL_DESK_FROM = "contact@travelba.fr";

export const HOTEL_DESK_LABELS: Record<HotelDeskKind, string> = {
  payment_link: "Lien de paiement",
  upgrade: "Upgrade et accueil",
  precheckin: "Pré-check-in",
  full_credit: "Full credit",
  transfer: "Transfert",
  concierge: "Concierge",
};

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const FULL_CREDIT_NIGHT_CENTS = 50_000;

export function hotelDeskChannel(item: CrmBookingItem) {
  const family = item.details?.source_family;
  return hotelChannel({
    sourceFamily: typeof family === "string" ? family : "",
    supplier: item.supplier,
    leHotelId: leHotelIdFromItem(item),
  });
}

/** Expedia est déjà réglé : pas de lien ni de full credit à proposer. */
export function hotelDeskSuggested(kind: HotelDeskKind, channel: ReturnType<typeof hotelDeskChannel>) {
  if (channel === "expedia" && (kind === "payment_link" || kind === "full_credit")) return false;
  return true;
}

function recipientEmails(values: string[]) {
  return [...new Set(values.map((email) => email.trim().toLowerCase()).filter(Boolean))];
}

/** Tous les contacts de l’hôtel, directeurs et concierge compris. L’agence retire ou ajoute avant l’envoi. */
export function hotelDeskRecipients(contact: HotelContact, _kind: HotelDeskKind) {
  const emails = contact.people.map((person) => person.email);
  if (contact.email) emails.unshift(contact.email);
  return recipientEmails(emails);
}

export type DeskRosterPerson = {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
};

function rosterScore(person: DeskRosterPerson) {
  return Number(Boolean(person.lastName)) + Number(Boolean(person.firstName)) + Number(Boolean(person.role));
}

/** Une carte par adresse : le nom, le prénom et le rôle les plus complets. */
export function deskRoster(contact: HotelContact): DeskRosterPerson[] {
  const byEmail = new Map<string, DeskRosterPerson>();
  const people = [...contact.people];
  if (contact.email && !people.some((person) => person.email.trim().toLowerCase() === contact.email.trim().toLowerCase())) {
    people.unshift({ type: "", first_name: "", last_name: "", email: contact.email, phone: "" });
  }
  for (const person of people) {
    const email = person.email.trim().toLowerCase();
    if (!email) continue;
    const next = {
      email,
      firstName: person.first_name.trim(),
      lastName: person.last_name.trim(),
      role: person.type.trim(),
    };
    const current = byEmail.get(email);
    if (!current || rosterScore(next) > rosterScore(current)) byEmail.set(email, next);
  }
  return [...byEmail.values()];
}

/** Ajoute un contact saisi par l’agence sans retirer ceux déjà sur la fiche. */
export function mergeDeskContacts(existing: unknown, incoming: DeskRosterPerson[]) {
  const current = Array.isArray(existing) ? [...existing] : [];
  const emails = new Set(
    current
      .filter((row) => row && typeof row === "object")
      .map((row) => String((row as { email?: string }).email || "").trim().toLowerCase())
      .filter(Boolean)
  );
  for (const person of incoming) {
    const email = person.email.trim().toLowerCase();
    if (!email || emails.has(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    emails.add(email);
    current.push({
      type: person.role.trim().slice(0, 80),
      last_name: person.lastName.trim().slice(0, 80),
      first_name: person.firstName.trim().slice(0, 80),
      email,
      phone: "",
    });
  }
  return current;
}

export function containsCardNumber(text: string) {
  return /(?:\d[ -]?){13,19}/.test(text);
}

function lineLooksLikeCard(line: string) {
  if (containsCardNumber(line)) return true;
  return /(?:cryptogramme|\bcvc\b|\bcvv\b|security code|num[eé]ro de carte|card number|expiration|expiry)/i.test(line) && /\d/.test(line);
}

const QUOTE_CUT =
  /^(?:>+\s*)?(?:on\s+.+wrote:|le\s+.+a\s+[eé]crit\s*:|-{2,}\s*original message\s*-{2,}|-{2,}\s*message d['’]origine\s*-{2,})\s*$/i;

/** Retire la citation du courrier d’origine. Le texte de l’hôtel reste. */
export function withoutQuotedOriginal(text: string) {
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] || "";
    const next = lines[index + 1] || "";
    if (QUOTE_CUT.test(line.trim())) break;
    if (/^_{8,}$/.test(line.trim()) && /^(from|de)\s*:/i.test(next.trim())) break;
    if (/^>+\s?/.test(line)) continue;
    kept.push(line);
  }
  return kept.join("\n");
}

/** Texte de réponse à montrer dans le dossier. Les lignes de carte sont retirées. */
export function hotelReplyForDesk(text: string) {
  const cleaned = withoutQuotedOriginal(text)
    .split(/\r?\n/)
    .filter((line) => !lineLooksLikeCard(line))
    .join("\n")
    .replace(/(?:\d[ -]?){13,19}/g, "")
    .trim()
    .slice(0, 4000);
  if (containsCardNumber(cleaned)) return "";
  return cleaned;
}

/** Lien de paiement ou d’autorisation présent dans la réponse. Pas le site de l’hôtel. */
export function hotelReplyLink(text: string) {
  const url = paymentUrlFromText(text);
  if (!url || !/pay|payment|checkout|invoice|secure|adyen|stripe|worldpay|pci|reglement|paiement|authoriz/i.test(url)) {
    return null;
  }
  return url;
}

const SUBJECT_PREFIX = /^(?:(?:re|fw|fwd|tr|aw|wg|antw|r)\s*:\s*)+/i;
const RELANCE_PREFIX = /^(?:relance|follow-up)\s*[—–-]\s*/i;

/** Objet sans Re:, R:, AW:, Relance ni Follow-up. Les tirets d’origine restent pour Gmail. */
export function hotelMailSubjectCore(subject: string) {
  let value = subject.replace(/\s+/g, " ").trim();
  let previous = "";
  while (value && value !== previous) {
    previous = value;
    value = value.replace(SUBJECT_PREFIX, "").replace(RELANCE_PREFIX, "").trim();
  }
  return value;
}

/** Objet comparable : casse et tirets longs alignés. */
export function hotelMailSubjectKey(subject: string) {
  return hotelMailSubjectCore(subject)
    .toLocaleLowerCase("fr")
    .replace(/[—–]/g, "-")
    .replace(/\s+-\s+/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
}

function isAgencyMailbox(from: string) {
  const email = emailAddress(from);
  if (!email || !email.includes("@")) return true;
  if (email === HOTEL_DESK_FROM) return true;
  const domain = email.split("@")[1] || "";
  return domain === "travelba.fr" || domain.endsWith(".travelba.fr");
}

/** Début de la fenêtre Gmail. Une relance écrase sent_at : on repart de la création. */
export function replyWindowStartMs(input: { sentAtMs: number; createdAtMs: number | null; followUpCount: number }) {
  if (input.followUpCount > 0 && input.createdAtMs != null && Number.isFinite(input.createdAtMs)) {
    return Math.min(input.createdAtMs, input.sentAtMs);
  }
  return input.sentAtMs;
}

export function replyMatchesRequest(input: {
  from: string;
  subject: string;
  receivedAtMs: number;
  sentAtMs: number;
  createdAtMs?: number | null;
  followUpCount?: number;
  requestSubject: string;
}) {
  const since = replyWindowStartMs({
    sentAtMs: input.sentAtMs,
    createdAtMs: input.createdAtMs ?? null,
    followUpCount: input.followUpCount || 0,
  });
  if (!(input.receivedAtMs >= since)) return false;
  if (isAgencyMailbox(input.from)) return false;
  const incoming = hotelMailSubjectKey(input.subject);
  const expected = hotelMailSubjectKey(input.requestSubject);
  if (!incoming || !expected) return false;
  return incoming === expected;
}

/** Clause Gmail. `after:` est exclusif : la veille, le filtre d’heure se fait ensuite. */
export function gmailAfterDate(sinceMs: number) {
  const day = new Date(sinceMs);
  if (!Number.isFinite(day.getTime())) return "";
  day.setUTCDate(day.getUTCDate() - 1);
  const month = String(day.getUTCMonth() + 1).padStart(2, "0");
  const date = String(day.getUTCDate()).padStart(2, "0");
  return `${day.getUTCFullYear()}/${month}/${date}`;
}

const FOLLOW_STATUS = new Set(["sent", "follow_up", "replied"]);

/** Titres à suivre. Un brouillon, un courrier à faire ou « Pas besoin » ne lance pas de recherche. */
export function subjectsToFollow(row: {
  status: string;
  sent_at: string | null;
  subject: string;
  sent_subjects?: string[] | null;
}) {
  if (!row.sent_at || !FOLLOW_STATUS.has(row.status)) return [];
  const listed = (row.sent_subjects || []).map((subject) => subject.trim()).filter(Boolean);
  const subjects = listed.length ? listed : [row.subject.trim()].filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const subject of subjects) {
    const key = hotelMailSubjectKey(subject);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(subject);
  }
  return out;
}

/** Ajoute un titre parti seulement si son cœur est nouveau. */
export function appendSentSubject(existing: string[] | null | undefined, subject: string) {
  const next = (existing || []).map((value) => value.trim()).filter(Boolean);
  const key = hotelMailSubjectKey(subject);
  if (!key || next.some((value) => hotelMailSubjectKey(value) === key)) return next;
  return [...next, subject.trim()];
}

/** Une vraie réponse d'hôtel fait passer le courrier à Répondu. Une absence ne le fait pas. */
export function nextLetterStatus(status: HotelDeskStatus, hasRealReply: boolean): HotelDeskStatus {
  if (!hasRealReply) return status;
  if (status === "sent" || status === "follow_up") return "replied";
  return status;
}

/** Absence, bounce ou en-tête Auto-Submitted. Pas une réponse de l'hôtel. */
export function isAutomaticHotelMail(from: string, body: string, autoSubmitted = false) {
  if (autoSubmitted) return true;
  const local = emailAddress(from).split("@")[0] || "";
  if (/^(mailer-daemon|postmaster|mail-daemon)$/i.test(local)) return true;
  const head = body.slice(0, 600);
  return /out of (the )?office|absence du bureau|r[eé]ponse automatique|automatic reply|je suis absent|i am (currently )?out of the office|message d'absence|undeliverable|delivery status notification|mail delivery failed/i.test(
    head
  );
}

export type HotelMailClass = {
  keep: boolean;
  subjectKey: string;
  direction: "out" | "in";
  countsAsReply: boolean;
  body: string;
  link: string | null;
  notice: "send" | "reply" | "auto";
};

/** Garde un message seulement si son titre est exactement celui d'un envoi CRM. */
export function classifyHotelMail(input: {
  from: string;
  subject: string;
  body: string;
  keys: string[];
  autoSubmitted?: boolean;
}): HotelMailClass {
  const subjectKey = hotelMailSubjectKey(input.subject);
  const expected = new Set(input.keys.map((key) => hotelMailSubjectKey(key)).filter(Boolean));
  const empty = {
    keep: false,
    subjectKey,
    direction: "in" as const,
    countsAsReply: false,
    body: "",
    link: null,
    notice: "reply" as const,
  };
  if (!subjectKey || !expected.has(subjectKey)) return empty;
  const agency = isAgencyMailbox(input.from);
  const automatic = !agency && isAutomaticHotelMail(input.from, input.body, Boolean(input.autoSubmitted));
  const direction = agency ? "out" : "in";
  const cleaned = hotelReplyForDesk(input.body);
  const body = cleaned || (direction === "in" ? "L'hôtel a répondu." : "");
  if (!body) return empty;
  return {
    keep: true,
    subjectKey,
    direction,
    countsAsReply: direction === "in" && !automatic,
    body,
    link: direction === "in" ? hotelReplyLink(cleaned || input.body) : null,
    notice: agency ? "send" : automatic ? "auto" : "reply",
  };
}

export function gmailSubjectClause(subject: string) {
  const core = hotelMailSubjectCore(subject).replace(/"/g, " ").replace(/\s+/g, " ").trim();
  if (core.length < 4) return "";
  return `subject:"${core.slice(0, 180)}"`;
}

export function hotelReplySearchQueries(input: { subject: string; emails: string[]; after: string }) {
  if (!input.after) return [];
  const queries: string[] = [];
  const clause = gmailSubjectClause(input.subject);
  if (clause) queries.push(`after:${input.after} ${clause}`);
  const safe = [
    ...new Set(
      input.emails
        .map((email) => emailAddress(email))
        .filter((email) => /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email))
    ),
  ];
  if (safe.length) queries.push(`after:${input.after} (${safe.map((email) => `from:${email}`).join(" OR ")})`);
  return queries;
}

/** Recherche Gmail du titre parti. Le filtre exact se fait ensuite. */
export function hotelThreadSearchQuery(subject: string, after: string) {
  if (!after) return "";
  const clause = gmailSubjectClause(subject);
  if (!clause) return "";
  return `after:${after} ${clause}`;
}

function detail(item: CrmBookingItem, key: string) {
  const value = item.details?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function flightLine(item: CrmBookingItem, lang: "fr" | "en") {
  const number = detail(item, "flight_number");
  const from = detail(item, "from");
  const to = detail(item, "to");
  const route = from && to ? `${from} → ${to}` : from || to;
  const when = isoDate(item.start_at);
  const clock = itemClock(item.start_at);
  const date = when ? formatStayDate(when, lang) : "";
  return [number, route, [date, clock].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
}

export function transferCues(items: CrmBookingItem[], hotel: CrmBookingItem, lang: "fr" | "en") {
  const checkIn = isoDate(hotel.start_at);
  const checkOut = isoDate(hotel.end_at) || checkIn;
  const flights = items.filter((item) => item.kind === "flight" && item.start_at);
  const arrival = flights
    .filter((item) => checkIn && isoDate(item.start_at) <= checkIn)
    .sort((a, b) => (b.start_at || "").localeCompare(a.start_at || ""))[0];
  const departure = flights
    .filter((item) => checkOut && isoDate(item.start_at) >= checkOut)
    .sort((a, b) => (a.start_at || "").localeCompare(b.start_at || ""))[0];
  const missing = lang === "fr" ? "à préciser" : "to be confirmed";
  return {
    arrival: arrival ? flightLine(arrival, lang) : missing,
    departure: departure ? flightLine(departure, lang) : missing,
  };
}

export type HotelDeskDraftInput = {
  kind: HotelDeskKind;
  item: CrmBookingItem;
  items: CrmBookingItem[];
  reference: string;
  guest: string;
  currency: string;
  holidays: string[];
  relance?: boolean;
};

export function hotelDeskDraft(input: HotelDeskDraftInput) {
  const contact = hotelContact(input.item);
  const lang = hotelLanguage(contact.country);
  const hotel = hotelDisplayName(input.item) || input.item.title;
  const checkIn = isoDate(input.item.start_at);
  const checkOut = isoDate(input.item.end_at) || checkIn;
  const stay = `${formatStayDate(checkIn, lang)} – ${formatStayDate(checkOut, lang)}`;
  const ref = input.item.confirmation_ref || input.reference || "—";
  const guest = input.guest.trim() || (lang === "fr" ? "notre client" : "our guest");
  const channel = hotelDeskChannel(input.item);
  const amountCents =
    typeof input.item.amount === "number" && input.item.amount > 0 ? Math.round(input.item.amount * 100) : null;
  const amount = amountCents != null ? formatArrivalAmount(amountCents, input.currency || "EUR") : null;
  const nights = nightsBetween(checkIn, checkOut);
  const letter = letterFor({
    ...input,
    lang,
    hotel,
    stay,
    ref,
    guest,
    amount,
    nights,
    cues: transferCues(input.items, input.item, lang),
  });
  const due = checkIn ? businessDaysBefore(checkIn, 2, new Set(input.holidays)) : null;
  return {
    kind: input.kind,
    subject: letter.subject,
    body: letter.text,
    recipients: hotelDeskRecipients(contact, input.kind),
    dueOn: due,
    status: (hotelDeskSuggested(input.kind, channel) ? "waiting" : "skipped") as HotelDeskStatus,
    cardChoice: input.kind === "precheckin" ? ("pliant" as const) : null,
    attachPassports: input.kind === "precheckin",
    lang,
  };
}

function letterFor(input: {
  kind: HotelDeskKind;
  lang: "fr" | "en";
  hotel: string;
  stay: string;
  ref: string;
  guest: string;
  amount: string | null;
  nights: number | null;
  checkIn?: string;
  relance?: boolean;
  item: CrmBookingItem;
  cues: { arrival: string; departure: string };
}) {
  if (input.kind === "payment_link") {
    return linkRequestMail({
      lang: input.lang,
      hotel: input.hotel,
      reference: input.ref,
      checkIn: isoDate(input.item.start_at),
      checkOut: isoDate(input.item.end_at) || isoDate(input.item.start_at),
      amount: input.amount,
      relance: input.relance,
    });
  }
  if (input.lang === "fr") return frenchLetter(input);
  return englishLetter(input);
}

function frenchLetter(input: {
  kind: HotelDeskKind;
  hotel: string;
  stay: string;
  ref: string;
  guest: string;
  nights: number | null;
  relance?: boolean;
  cues: { arrival: string; departure: string };
}) {
  const frame = hotelMailFrame("fr", input.relance);
  const stayLine = `Notre client ${input.guest} séjourne à ${input.hotel} du ${input.stay} (confirmation ${input.ref}).`;
  if (input.kind === "upgrade") {
    return {
      subject: `${input.relance ? "Relance — " : ""}Accueil VIP — ${input.hotel} — ${input.ref}`,
      text: [
        ...frame.open,
        "",
        "Pourriez-vous signaler cette réservation à votre équipe sur place ?",
        "",
        stayLine,
        "",
        "Pourriez-vous demander à votre équipe de préparer un bel accueil VIP dans la chambre, avec quelques attentions ? Le surclassement dépend des disponibilités au moment de l'arrivée, et s'il est possible, ce serait formidable.",
        "",
        ...frame.close,
      ].join("\n"),
    };
  }
  if (input.kind === "precheckin") {
    return {
      subject: `${input.relance ? "Relance — " : ""}Pré-enregistrement — ${input.hotel} — ${input.ref}`,
      text: [
        ...frame.open,
        "",
        `Pourriez-vous préparer l'enregistrement de ${input.guest} à ${input.hotel}, du ${input.stay} (confirmation ${input.ref}) ?`,
        "",
        "Les documents d'identité sont joints, pour que la chambre soit prête dès l'arrivée.",
        "",
        ...frame.close,
      ].join("\n"),
    };
  }
  if (input.kind === "full_credit") {
    const total =
      input.nights != null
        ? ` soit ${formatArrivalAmount(input.nights * FULL_CREDIT_NIGHT_CENTS, "EUR")} pour ${input.nights} nuit${input.nights > 1 ? "s" : ""}`
        : "";
    return {
      subject: `${input.relance ? "Relance — " : ""}Full credit — ${input.hotel} — ${input.ref}`,
      text: [
        ...frame.open,
        "",
        `${stayLine} Le séjour est déjà réglé par l'agence.`,
        "",
        `Pourriez-vous prendre en charge les dépenses d'hôtel (restauration, spa), à hauteur de 500 € par nuit${total} ? Un lien de paiement ou une pré-autorisation pour ce plafond serait parfait. La chambre elle-même n'est pas à encaisser de nouveau.`,
        "",
        ...frame.close,
      ].join("\n"),
    };
  }
  if (input.kind === "transfer") {
    return {
      subject: `${input.relance ? "Relance — " : ""}Transfert — ${input.hotel} — ${input.ref}`,
      text: [
        ...frame.open,
        "",
        `Pourriez-vous organiser un transfert pour ${input.guest} à ${input.hotel}, du ${input.stay} (confirmation ${input.ref}) ?`,
        "",
        `Arrivée : ${input.cues.arrival}`,
        `Départ : ${input.cues.departure}`,
        "",
        ...frame.close,
      ].join("\n"),
    };
  }
  return {
    subject: `${input.relance ? "Relance — " : ""}Concierge — ${input.hotel} — ${input.ref}`,
    text: [
      ...frame.open,
      "",
      `Pourriez-vous nous aider pour une demande concernant ${input.guest} à ${input.hotel}, du ${input.stay} (confirmation ${input.ref}) ?`,
      "",
      "Demande :",
      "…",
      "",
      ...frame.close,
    ].join("\n"),
  };
}

function englishLetter(input: {
  kind: HotelDeskKind;
  hotel: string;
  stay: string;
  ref: string;
  guest: string;
  nights: number | null;
  relance?: boolean;
  cues: { arrival: string; departure: string };
}) {
  const frame = hotelMailFrame("en", input.relance);
  const prefix = input.relance ? "Follow-up — " : "";
  const stayLine = `Our guest ${input.guest} is staying at ${input.hotel}, ${input.stay} (confirmation ${input.ref}).`;
  if (input.kind === "upgrade") {
    return {
      subject: `${prefix}VIP welcome — ${input.hotel} — ${input.ref}`,
      text: [
        ...frame.open,
        "",
        "Could you please flag this booking to your team on property?",
        "",
        stayLine,
        "",
        "Could you please ask your team to arrange some nice VIP welcome amenities in the room? This is subject to availability at the time of check-in, but if an upgrade is possible, it would be amazing.",
        "",
        ...frame.close,
      ].join("\n"),
    };
  }
  if (input.kind === "precheckin") {
    return {
      subject: `${prefix}Pre-check-in — ${input.hotel} — ${input.ref}`,
      text: [
        ...frame.open,
        "",
        `Could you please arrange the pre-check-in for ${input.guest} at ${input.hotel}, ${input.stay} (confirmation ${input.ref})?`,
        "",
        "Identity documents are attached, so the room can be ready when they arrive.",
        "",
        ...frame.close,
      ].join("\n"),
    };
  }
  if (input.kind === "full_credit") {
    const total =
      input.nights != null
        ? `, ${formatArrivalAmount(input.nights * FULL_CREDIT_NIGHT_CENTS, "EUR")} for ${input.nights} night${input.nights > 1 ? "s" : ""}`
        : "";
    return {
      subject: `${prefix}Full credit — ${input.hotel} — ${input.ref}`,
      text: [
        ...frame.open,
        "",
        `${stayLine} The stay has already been settled by the agency.`,
        "",
        `Could you please cover the guest's hotel extras (dining, spa) at 500 EUR per night${total}? A payment link or a pre-authorisation for this ceiling would be perfect. The room itself should not be charged again.`,
        "",
        ...frame.close,
      ].join("\n"),
    };
  }
  if (input.kind === "transfer") {
    return {
      subject: `${prefix}Transfer — ${input.hotel} — ${input.ref}`,
      text: [
        ...frame.open,
        "",
        `Could you please arrange a transfer for ${input.guest} at ${input.hotel}, ${input.stay} (confirmation ${input.ref})?`,
        "",
        `Arrival: ${input.cues.arrival}`,
        `Departure: ${input.cues.departure}`,
        "",
        ...frame.close,
      ].join("\n"),
    };
  }
  return {
    subject: `${prefix}Concierge — ${input.hotel} — ${input.ref}`,
    text: [
      ...frame.open,
      "",
      `Could you please help us with a request for ${input.guest} at ${input.hotel}, ${input.stay} (confirmation ${input.ref})?`,
      "",
      "Request:",
      "…",
      "",
      ...frame.close,
    ].join("\n"),
  };
}

const LOCKED: HotelDeskStatus[] = ["draft", "sent", "follow_up", "replied", "skipped"];

export function keepAgencyDraft<T extends { edited: boolean; status: HotelDeskStatus; subject: string; body: string; recipients: string[] }>(
  existing: T,
  fresh: { subject: string; body: string; recipients: string[] }
) {
  if (existing.edited || LOCKED.includes(existing.status)) {
    return {
      subject: existing.subject,
      body: existing.body,
      recipients: existing.recipients.length ? existing.recipients : fresh.recipients,
    };
  }
  return fresh;
}

export function deskNeedsAttention(row: Pick<CrmHotelRequest, "status" | "due_on">, parisToday: string) {
  if (row.status === "due" || row.status === "follow_up") return true;
  if (row.status === "waiting" || row.status === "draft") return Boolean(row.due_on && parisToday >= row.due_on);
  return false;
}

/** Envoyé, explicitement inutile, ou encore ouvert. Rien d'autre. */
export type HotelLetterMark = "open" | "sent" | "unneeded";

export function hotelLetterMark(status: HotelDeskStatus): HotelLetterMark {
  if (status === "skipped") return "unneeded";
  if (status === "sent" || status === "follow_up" || status === "replied") return "sent";
  return "open";
}

export function hotelLetterCaption(status: HotelDeskStatus) {
  if (status === "skipped") return "Pas besoin";
  if (status === "replied") return "Répondu";
  if (status === "follow_up") return "Envoyé · à relancer";
  if (status === "sent") return "Envoyé";
  return "À faire";
}

export type HotelChecklistLine = {
  kind: HotelDeskKind;
  title: string;
  mark: HotelLetterMark;
  caption: string;
};

function frenchJoin(labels: string[]) {
  if (labels.length <= 1) return labels[0] || "";
  if (labels.length === 2) return `${labels[0]} et ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} et ${labels[labels.length - 1]}`;
}

/** Les courriers attendus d'un hôtel, dans l'ordre du bureau. */
export function hotelStayChecklist(
  itemId: string,
  requests: Pick<CrmHotelRequest, "booking_item_id" | "kind" | "status">[]
) {
  const mine = requests.filter((row) => row.booking_item_id === itemId);
  const lines: HotelChecklistLine[] = HOTEL_DESK_KINDS.flatMap((kind) => {
    const row = mine.find((item) => item.kind === kind);
    if (!row) return [];
    return [
      {
        kind,
        title: HOTEL_DESK_LABELS[kind],
        mark: hotelLetterMark(row.status),
        caption: hotelLetterCaption(row.status),
      },
    ];
  });
  const openTitles = lines.filter((line) => line.mark === "open").map((line) => line.title);
  const relanceTitles = lines.filter((line) => line.caption.includes("relancer")).map((line) => line.title);
  const summary = !lines.length
    ? ""
    : openTitles.length
      ? `Il reste ${frenchJoin(openTitles)}`
      : relanceTitles.length
        ? `À relancer : ${frenchJoin(relanceTitles)}`
        : "Courriers réglés";
  return {
    lines,
    openTitles,
    relanceTitles,
    complete: lines.length > 0 && openTitles.length === 0,
    summary,
  };
}

/** Ce qui reste ouvert sur le séjour, hôtel par hôtel. */
export function hotelTripChecklist(requests: Pick<CrmHotelRequest, "booking_item_id" | "kind" | "status">[]) {
  const ids = [...new Set(requests.map((row) => row.booking_item_id))];
  const stays = ids
    .map((itemId) => ({ itemId, ...hotelStayChecklist(itemId, requests) }))
    .filter((stay) => stay.lines.length > 0);
  const openStays = stays.filter((stay) => !stay.complete);
  const openCount = openStays.reduce((count, stay) => count + stay.openTitles.length, 0);
  return { stays, openStays, openCount };
}

export function hotelsNeedingDesk(rows: Pick<CrmHotelRequest, "booking_item_id" | "status" | "due_on">[], parisToday: string) {
  return new Set(rows.filter((row) => deskNeedsAttention(row, parisToday)).map((row) => row.booking_item_id)).size;
}

export function deskStatusLabel(row: Pick<CrmHotelRequest, "status">, _parisToday?: string) {
  return hotelLetterCaption(row.status);
}

export function nextDeskMark(input: {
  status: HotelDeskStatus;
  dueOn: string | null;
  parisToday: string;
  sentAtMs: number | null;
  followUpCount: number;
  lastFollowUpAtMs: number | null;
  nowMs: number;
  holidays: string[];
}): HotelDeskStatus | null {
  if (input.status === "skipped" || input.status === "replied") return null;
  if ((input.status === "waiting" || input.status === "draft") && input.dueOn && input.parisToday >= input.dueOn) {
    return input.status === "draft" ? null : "due";
  }
  if (input.status !== "sent" && input.status !== "follow_up") return null;
  if (input.sentAtMs == null) return null;
  if (input.followUpCount <= 0) {
    if (input.nowMs >= input.sentAtMs + FOUR_HOURS_MS && input.status === "sent") return "follow_up";
    return null;
  }
  if (input.followUpCount === 1 && input.status === "sent") {
    const from = parisIsoDate(new Date(input.lastFollowUpAtMs ?? input.sentAtMs));
    if (input.parisToday >= nextBusinessDay(from, new Set(input.holidays))) return "follow_up";
  }
  if (input.followUpCount >= 2 && input.status === "sent" && input.nowMs >= input.sentAtMs + FOUR_HOURS_MS) {
    return "follow_up";
  }
  return null;
}

export function replyMatchesHotel(input: {
  from: string;
  receivedAtMs: number;
  sentAtMs: number;
  hotelEmails: string[];
}) {
  if (!(input.receivedAtMs >= input.sentAtMs)) return false;
  const from = emailAddress(input.from);
  return input.hotelEmails.map((email) => emailAddress(email)).includes(from);
}

export function cardSendNote(choice: "pliant" | "client" | null, lang: "fr" | "en") {
  if (choice === "client") {
    return lang === "fr"
      ? "La carte du client est jointe. Merci de ne pas encaisser le séjour sur une autre carte."
      : "The guest's card is attached. Please do not charge the stay to another card.";
  }
  if (choice !== "pliant") return "";
  return lang === "fr" ? "La carte d'enregistrement est jointe." : "The check-in card is attached.";
}

export function outboundHotelLetter(body: string, note: string) {
  const extra = note.trim();
  if (!extra) return body.trim();
  return `${body.trim()}\n\n${extra}`;
}

export function cleanRecipients(values: string[]) {
  return [...new Set(values.map((value) => emailAddress(value)).filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))];
}

/** Adresses qui partiraient sans choix. La fiche n’en fait pas une liste : seul le formulaire d’envoi les montre. */
export function knownHotelRecipients(
  item: CrmBookingItem,
  requests: Pick<CrmHotelRequest, "booking_item_id" | "recipients">[]
) {
  const listed = cleanRecipients(
    requests.filter((row) => row.booking_item_id === item.id).flatMap((row) => row.recipients || [])
  );
  if (listed.length) return listed;
  return hotelDeskRecipients(hotelContact(item), "concierge");
}

/** Contacts proposés à l’envoi : le bureau, plus toute adresse déjà utilisée pour ce séjour. */
export function hotelSendPeople(
  item: CrmBookingItem,
  requests: Pick<CrmHotelRequest, "booking_item_id" | "recipients">[],
  messages: Pick<CrmHotelMessage, "booking_item_id" | "recipients">[] = []
) {
  const byEmail = new Map<string, DeskRosterPerson>();
  for (const person of deskRoster(hotelContact(item))) byEmail.set(person.email, person);
  const extras = cleanRecipients([
    ...requests.filter((row) => row.booking_item_id === item.id).flatMap((row) => row.recipients || []),
    ...messages.filter((row) => row.booking_item_id === item.id).flatMap((row) => row.recipients || []),
  ]);
  for (const email of extras) {
    if (!byEmail.has(email)) byEmail.set(email, { email, firstName: "", lastName: "", role: "" });
  }
  return [...byEmail.values()];
}

/** Cases cochées au départ : les adresses qui partiraient aujourd’hui. Les autres contacts restent visibles. */
export function hotelSendDefaults(
  item: CrmBookingItem,
  requests: Pick<CrmHotelRequest, "booking_item_id" | "recipients">[],
  messages: Pick<CrmHotelMessage, "booking_item_id" | "recipients">[] = []
) {
  const people = hotelSendPeople(item, requests, messages);
  const known = new Set(knownHotelRecipients(item, requests));
  const checked = people.filter((person) => known.has(person.email)).map((person) => person.email);
  return checked.length ? checked : people.map((person) => person.email);
}

/** Hôtel, ville, dates et confirmation : le contexte du message. */
export function hotelStayContext(item: CrmBookingItem) {
  const hotel = hotelDisplayName(item) || "Hôtel";
  const city = hotelCityLine(item);
  const checkIn = isoDate(item.start_at);
  const checkOut = isoDate(item.end_at);
  const stay =
    checkIn && checkOut && checkOut !== checkIn
      ? `${formatStayDate(checkIn, "fr")} – ${formatStayDate(checkOut, "fr")}`
      : checkIn
        ? formatStayDate(checkIn, "fr")
        : "";
  const ref = (item.confirmation_ref || "").trim();
  return {
    hotel,
    subtitle: [city, stay, ref ? `confirmation ${ref}` : ""].filter(Boolean).join(" · "),
    subject: [hotel, ref || "", stay].filter(Boolean).join(" — "),
  };
}

export type HotelThreadTurn = {
  id: string;
  at: string;
  direction: "out" | "in";
  speaker: string;
  label: string;
  subject: string;
  body: string;
  link: string | null;
};

export type HotelMailPiece = {
  id: string;
  subject?: string | null;
  from_email?: string | null;
  received_at?: string | null;
  body_text?: string | null;
  extract?: unknown;
  warnings?: { file?: string | null; message?: string | null }[] | null;
};

type PieceHotel = {
  kind?: string;
  title?: string | null;
  confirmation_ref?: string | null;
  details?: { hotel_name?: string | null } | null;
};

function foldHotel(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/milano/g, "milan")
    .replace(/\bhotel\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function hotelNamesMatch(left: string, right: string) {
  if (!left || !right) return false;
  if (left === right) return true;
  const [short, long] = left.length <= right.length ? [left, right] : [right, left];
  return short.length >= 8 && long.includes(short);
}

function pieceHotels(mail: HotelMailPiece): PieceHotel[] {
  const extract =
    mail.extract && typeof mail.extract === "object" ? (mail.extract as { items?: PieceHotel[] }) : null;
  return (extract?.items || []).filter((item) => item?.kind === "hotel");
}

function pieceDismissed(mail: HotelMailPiece) {
  return (mail.warnings || []).some((warning) => warning?.file === "staff" && warning?.message === "écarté");
}

/** Un mail déjà dans les pièces de cet hôtel. Un billet d'avion n'entre pas dans le fil. */
export function hotelMailPieceMatches(item: CrmBookingItem, mail: HotelMailPiece) {
  if (!mail.id || pieceDismissed(mail) || isAgencyMailbox(mail.from_email || "")) return false;
  const hotels = pieceHotels(mail);
  if (!hotels.length) return false;
  const name = foldHotel(hotelDisplayName(item));
  const ref = foldHotel(item.confirmation_ref || "");
  return hotels.some((hotel) => {
    const pieceRef = foldHotel(hotel.confirmation_ref || "");
    if (ref && pieceRef && ref === pieceRef) return true;
    return hotelNamesMatch(name, foldHotel(hotel.details?.hotel_name || hotel.title || ""));
  });
}

function replyText(body: string) {
  const cleaned = hotelReplyForDesk(body);
  return cleaned || "L'hôtel a répondu.";
}

function sameExchange(
  mail: HotelMailPiece,
  replies: { reply_message_id: string | null; reply_subject: string; reply_body: string }[]
) {
  const body = hotelReplyForDesk(mail.body_text || "");
  const key = hotelMailSubjectKey(mail.subject || "");
  return replies.some((reply) => {
    if (reply.reply_message_id && reply.reply_message_id === mail.id) return true;
    if (!reply.reply_body.trim()) return false;
    if (key && hotelMailSubjectKey(reply.reply_subject) === key) return true;
    return Boolean(body) && hotelReplyForDesk(reply.reply_body) === body;
  });
}

function turnAt(value: string | null) {
  if (!value) return "";
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : "";
}

type DraftTurn = HotelThreadTurn & {
  subjectKey: string;
  source: "crm" | "gmail" | "letter" | "note";
};

const FOLD_WINDOW_MS = 24 * 60 * 60 * 1000;

function bodyPrefix(body: string) {
  return body.replace(/\s+/g, " ").trim().slice(0, 80).toLocaleLowerCase("fr");
}

/** La copie Gmail d'un envoi CRM remplace le tour local. */
function foldGmailCopies(turns: DraftTurn[]) {
  const gmailOut = turns.filter((turn) => turn.source === "gmail" && turn.direction === "out");
  const used = new Set<string>();
  const hidden = new Set<string>();
  for (const turn of turns) {
    if (turn.direction !== "out" || turn.source === "gmail") continue;
    const at = Date.parse(turn.at);
    const prefix = bodyPrefix(turn.body);
    let best: DraftTurn | null = null;
    let bestGap = Number.POSITIVE_INFINITY;
    for (const copy of gmailOut) {
      if (used.has(copy.id) || copy.subjectKey !== turn.subjectKey) continue;
      const gap = Math.abs(Date.parse(copy.at) - at);
      const sameBody = prefix.length >= 20 && bodyPrefix(copy.body) === prefix;
      if (!sameBody && !(Number.isFinite(at) && gap <= FOLD_WINDOW_MS)) continue;
      if (gap < bestGap) {
        best = copy;
        bestGap = Number.isFinite(gap) ? gap : 0;
      }
    }
    if (!best) continue;
    used.add(best.id);
    hidden.add(turn.id);
  }
  return turns.filter((turn) => !hidden.has(turn.id));
}

function subjectKeysOf(row: { subject: string; sent_subjects?: string[] | null }) {
  const listed = (row.sent_subjects || []).map((subject) => hotelMailSubjectKey(subject)).filter(Boolean);
  if (listed.length) return new Set(listed);
  const current = hotelMailSubjectKey(row.subject);
  return new Set(current ? [current] : []);
}

function sortTurns(turns: HotelThreadTurn[]) {
  return turns.sort((a, b) => {
    const time = a.at.localeCompare(b.at);
    if (time) return time;
    if (a.direction !== b.direction) return a.direction === "out" ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Fil d'un hôtel : courriers partis, réponses, messages libres, confirmations déjà dans les pièces.
 * L'interlocuteur affiché est l'agence ou le nom de l'hôtel.
 */
export function hotelThread(input: {
  item: CrmBookingItem;
  requests: CrmHotelRequest[];
  messages: CrmHotelMessage[];
  attached: HotelMailPiece[];
  thread?: CrmHotelThreadMessage[];
}): HotelThreadTurn[] {
  const context = hotelStayContext(input.item);
  const drafts: DraftTurn[] = [];
  const replies: { reply_message_id: string | null; reply_subject: string; reply_body: string }[] = [];
  const letters = input.requests.filter((row) => row.booking_item_id === input.item.id);
  const notes = input.messages.filter((row) => row.booking_item_id === input.item.id);
  const thread = (input.thread || []).filter((row) => row.booking_item_id === input.item.id);
  const threadKeys = new Set(thread.map((row) => row.subject_key));
  const crmOutRequests = new Set(
    thread.filter((row) => row.source === "crm" && row.direction === "out" && row.request_id).map((row) => row.request_id)
  );
  const crmOutMessages = new Set(
    thread.filter((row) => row.source === "crm" && row.direction === "out" && row.message_id).map((row) => row.message_id)
  );

  function covered(row: { subject: string; sent_subjects?: string[] | null }) {
    for (const key of subjectKeysOf(row)) if (threadKeys.has(key)) return true;
    return false;
  }

  for (const row of letters) {
    if (row.sent_at && !crmOutRequests.has(row.id)) {
      const label =
        row.follow_up_count > 0 ? `Relance · ${HOTEL_DESK_LABELS[row.kind]}` : HOTEL_DESK_LABELS[row.kind];
      drafts.push({
        id: `out:${row.id}`,
        at: turnAt(row.sent_at),
        direction: "out",
        speaker: "L'agence",
        label,
        subject: row.subject,
        body: row.body.trim(),
        link: null,
        subjectKey: hotelMailSubjectKey(row.subject),
        source: "letter",
      });
    }
    if ((row.reply_body.trim() || row.replied_at) && !covered(row)) {
      const body = replyText(row.reply_body);
      replies.push(row);
      drafts.push({
        id: `in:${row.id}`,
        at: turnAt(row.replied_at || row.sent_at),
        direction: "in",
        speaker: context.hotel,
        label: "Réponse",
        subject: row.reply_subject,
        body,
        link: hotelReplyLink(body),
        subjectKey: hotelMailSubjectKey(row.reply_subject || row.subject),
        source: "letter",
      });
    }
  }

  for (const row of notes) {
    if (row.sent_at && !crmOutMessages.has(row.id)) {
      drafts.push({
        id: `out:${row.id}`,
        at: turnAt(row.sent_at),
        direction: "out",
        speaker: "L'agence",
        label: "Message",
        subject: row.subject,
        body: row.body.trim(),
        link: null,
        subjectKey: hotelMailSubjectKey(row.subject),
        source: "note",
      });
    }
    if ((row.reply_body.trim() || row.replied_at) && !covered(row)) {
      const body = replyText(row.reply_body);
      replies.push(row);
      drafts.push({
        id: `in:${row.id}`,
        at: turnAt(row.replied_at || row.sent_at),
        direction: "in",
        speaker: context.hotel,
        label: "Réponse",
        subject: row.reply_subject,
        body,
        link: hotelReplyLink(body),
        subjectKey: hotelMailSubjectKey(row.reply_subject || row.subject),
        source: "note",
      });
    }
  }

  const letterById = new Map(letters.map((row) => [row.id, row]));
  for (const row of thread) {
    const letter = row.request_id ? letterById.get(row.request_id) : undefined;
    const outs = thread
      .filter((turn) => turn.direction === "out" && turn.request_id && turn.request_id === row.request_id)
      .sort((a, b) => a.received_at.localeCompare(b.received_at));
    const letterLabel = letter ? HOTEL_DESK_LABELS[letter.kind] : "Message";
    const firstAt = Date.parse(outs[0]?.received_at || row.received_at);
    const laterSend = row.direction === "out" && Date.parse(row.received_at) - firstAt > 4 * 60 * 60 * 1000;
    const label =
      row.direction === "in"
        ? row.counts_as_reply
          ? "Réponse"
          : "Absence"
        : letter && laterSend
          ? `Relance · ${letterLabel}`
          : letterLabel;
    if (row.direction === "in") {
      replies.push({
        reply_message_id: row.gmail_message_id,
        reply_subject: row.subject,
        reply_body: row.body,
      });
    }
    drafts.push({
      id: `thread:${row.id}`,
      at: turnAt(row.received_at),
      direction: row.direction,
      speaker: row.direction === "out" ? "L'agence" : context.hotel,
      label,
      subject: row.subject,
      body: row.body.trim() || (row.direction === "in" ? "L'hôtel a répondu." : ""),
      link: row.link,
      subjectKey: row.subject_key,
      source: row.source,
    });
  }

  const folded = foldGmailCopies(drafts).map(({ subjectKey: _subjectKey, source: _source, ...turn }) => turn);

  for (const mail of input.attached) {
    if (!hotelMailPieceMatches(input.item, mail) || sameExchange(mail, replies)) continue;
    const body = hotelReplyForDesk(mail.body_text || "") || "Ce mail est déjà dans les pièces du dossier.";
    folded.push({
      id: `mail:${mail.id}`,
      at: turnAt(mail.received_at || null),
      direction: "in",
      speaker: context.hotel,
      label: "Confirmation",
      subject: (mail.subject || "").trim(),
      body,
      link: hotelReplyLink(body),
    });
  }

  return sortTurns(folded);
}

export { HOTEL_DESK_KINDS };
