import type { BubbleHistory } from "../concierge/bubbles";
import { withConciergeSignature } from "./whatsapp";

export type QuoteLang = "fr" | "en" | "he";

type QuoteStay = {
  reference: string;
  destination: string | null;
  title: string;
  items: { kind: string; toPlace: string; lines: string[] }[];
};

type Party = { adults: number | null; children: number | null; ages: string | null };

type Leg = { from: string; to: string; when: string };

export type QuoteSketch = {
  kind: "flight" | "hotel" | "trip";
  legs: Leg[];
  place: string | null;
  when: string | null;
  party: Party;
  ask: "cabin" | "dates" | "route" | "city" | null;
  /** Relance d’un devis déjà dit, ou vocal trop court pour un tarif de dossier. */
  followUp: boolean;
  vague: boolean;
};

const MONTH =
  "janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre|january|february|march|april|may|june|july|august|september|october|november|december";
const CITY = "[a-z][a-z']{2,24}";
const DATE = `\\d{1,2}\\s+(?:${MONTH})(?:\\s+\\d{4})?`;
const DASH = "[-–—>]";

const STOP = new Set([
  "avec", "pour", "dans", "votre", "notre", "cette", "hotel", "sejour", "voyage", "vol", "vols", "avion",
  "billet", "billets", "adulte", "adultes", "enfant", "enfants", "tarif", "tarifs", "prix", "quel", "quels",
  "quelle", "quelles", "sont", "est", "bonjour", "bonsoir", "cherche", "nouveau", "nouvelle", "devis",
  "quote", "the", "and", "for", "from", "flight", "flights", "stay", "trip", "ans", "age", "ages", "classe",
  "economique", "business", "affaires", "premiere", "merci", "hello", "please", "janvier", "fevrier", "mars",
  "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre", "january",
  "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
]);

const EMPTY_PARTY: Party = { adults: null, children: null, ages: null };

function foldQuote(value: string) {
  return value
    .replace(/[’]/g, "'")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function analyze(raw: string) {
  const source = raw.replace(/[’]/g, "'");
  let text = "";
  const index: number[] = [];
  for (let i = 0; i < source.length; ) {
    const cp = source.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    const base = ch.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    for (const piece of base) {
      text += piece;
      index.push(i);
    }
    i += ch.length;
  }
  return { source, text, index };
}

function sliceFolded(source: string, index: number[], start: number, end: number) {
  if (start < 0 || start >= index.length) return "";
  const from = index[start];
  const to = end >= index.length ? source.length : index[end];
  return source.slice(from, to).replace(/\s+/g, " ").trim();
}

function voiceBody(message: string) {
  const match = message.match(/^\s*note vocale\s*:\s*([\s\S]+)/i);
  const text = match?.[1]?.trim() || "";
  return text || null;
}

export function replyCore(text: string) {
  return foldQuote(text)
    .replace(/\ble concierge\.?/g, "")
    .replace(/\b(bonjour|hello)[^,\n]*,\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isAutomaticReply(text: string) {
  const core = replyCore(text);
  if (/n'ai pas ce prix|n'ai pas cette information|n'ai pas l'horaire|n'ai pas de sejour|don't have that price|don't have the time|don't have a published stay/.test(core)) {
    return true;
  }
  return /conseiller|chiffrage|je transmets|message vocal|c'est note|c'est bien note|c'est bien recu|bien recu/.test(core);
}

export function alternateReply(previous: string, lang: QuoteLang) {
  const options =
    lang === "en"
      ? ["Noted. A counsellor is already on it.", "Your request is with the counsellor."]
      : lang === "he"
        ? ["קיבלתי. היועץ כבר מטפל בזה.", "הבקשה אצל היועץ."]
        : ["C’est bien reçu. Un conseiller s’en occupe déjà.", "Votre demande est chez le conseiller."];
  const prev = replyCore(previous);
  return options.find((line) => replyCore(line) !== prev) || options[0];
}

/** Même phrase automatique deux fois de suite : une autre formule, jamais la même. */
export function varyAutomaticText(previous: string | null | undefined, next: string, lang: QuoteLang) {
  if (!previous || !isAutomaticReply(next) || replyCore(previous) !== replyCore(next)) return next;
  const line = alternateReply(previous, lang);
  return /le concierge/i.test(next) ? withConciergeSignature(line) : line;
}

function stayTokens(stay: QuoteStay) {
  const found = new Set<string>();
  const add = (value: string) => {
    for (const word of foldQuote(value).split(/[^a-z0-9]+/)) {
      if (word.length > 3 && !STOP.has(word)) found.add(word);
    }
  };
  if (stay.destination) add(stay.destination);
  add(stay.title);
  for (const item of stay.items) {
    if (item.kind !== "hotel" && item.kind !== "flight") continue;
    add(item.toPlace);
    if (item.kind !== "hotel") continue;
    const line = item.lines[0] || "";
    const city = line.split(",").at(-1)?.trim() || "";
    if (city) add(city);
  }
  return found;
}

function cityInStays(city: string, stays: QuoteStay[]) {
  const token = foldQuote(city);
  if (token.length < 4 || STOP.has(token)) return false;
  return stays.some((stay) => stayTokens(stay).has(token));
}

function legsInOneStay(legs: Leg[], stays: QuoteStay[]) {
  if (!legs.length || !stays.length) return false;
  return stays.some((stay) => {
    const tokens = stayTokens(stay);
    return legs.every((leg) => tokens.has(foldQuote(leg.from)) && tokens.has(foldQuote(leg.to)));
  });
}

function anchoredDossier(folded: string, stays: QuoteStay[]) {
  if (/\b(mon|ma|mes|notre)\s+(sejour|vol|vols|hotel|dossier|transfert|carnet|billet|billets)\b/.test(folded)) return true;
  if (/\b(du|le|ce)\s+sejour\b/.test(folded)) return true;
  if (/\b(du|le|ce)\s+(vol|hotel|billet|billets)\b/.test(folded)) return true;
  return stays.some((stay) => folded.includes(foldQuote(stay.reference)));
}

function seeksFlight(folded: string) {
  return (
    /\b(billet|billets|vols?|avion|flights?)\b/.test(folded) &&
    /\b(cherche|recherch|souhaite|voudrais|aimerais|veux|besoin|book|looking|reserve|reserver)\b/.test(folded)
  );
}

function seeksHotel(folded: string) {
  return (
    /\bhotels?\b/.test(folded) &&
    /\b(cherche|recherch|souhaite|voudrais|aimerais|veux|besoin|book|looking|reserve|reserver)\b/.test(folded)
  );
}

function barePriceAsk(folded: string) {
  if (/encours|solde|reste a payer|combien je dois|balance|amount due|how much do i owe/.test(folded)) return false;
  return /\bprix\b|\btarifs?\b|\bmontant\b|\bprice\b|\bcost\b|\bhow much\b|combien coute|combien ca coute/.test(folded);
}

function hasCabin(folded: string) {
  return /\b(economique|eco|premium|affaires|business|premiere|first)\b/.test(folded);
}

function readParty(raw: string): Party {
  const folded = foldQuote(raw);
  const adults = folded.match(/(\d{1,2})\s+adult(?:e|es|s)?\b/);
  const children = folded.match(/(\d{1,2})\s+(?:enfants?|children|child|kids)\b/);
  const ages = raw.match(/\(([^)]*\d[^)]*)\)/);
  const inside = ages?.[1]?.replace(/\s+/g, " ").trim() || "";
  return {
    adults: adults ? Number(adults[1]) : null,
    children: children ? Number(children[1]) : null,
    ages: inside && !/\d{4,}/.test(inside) && inside.length <= 40 ? inside : null,
  };
}

function keepCity(city: string) {
  const token = foldQuote(city);
  return token.length >= 3 && !STOP.has(token);
}

function extractLegs(raw: string): Leg[] {
  const { source, text, index } = analyze(raw);
  const found: { start: number; end: number; leg: Leg }[] = [];
  const routeThenDate = new RegExp(`(${CITY})\\s*${DASH}\\s*(${CITY})\\s+le\\s+(${DATE})`, "gid");
  const dateThenRoute = new RegExp(`le\\s+(${DATE})\\s+(${CITY})\\s*${DASH}\\s*(${CITY})`, "gid");
  for (const match of text.matchAll(routeThenDate)) {
    const indices = match.indices;
    if (!indices || match.index == null) continue;
    const from = sliceFolded(source, index, indices[1][0], indices[1][1]);
    const to = sliceFolded(source, index, indices[2][0], indices[2][1]);
    const when = sliceFolded(source, index, indices[3][0], indices[3][1]);
    if (!keepCity(from) || !keepCity(to)) continue;
    found.push({ start: match.index, end: match.index + match[0].length, leg: { from, to, when } });
  }
  for (const match of text.matchAll(dateThenRoute)) {
    const indices = match.indices;
    if (!indices || match.index == null) continue;
    const when = sliceFolded(source, index, indices[1][0], indices[1][1]);
    const from = sliceFolded(source, index, indices[2][0], indices[2][1]);
    const to = sliceFolded(source, index, indices[3][0], indices[3][1]);
    if (!keepCity(from) || !keepCity(to)) continue;
    found.push({ start: match.index, end: match.index + match[0].length, leg: { from, to, when } });
  }
  found.sort((a, b) => a.start - b.start);
  const legs: Leg[] = [];
  let cursor = -1;
  for (const row of found) {
    if (row.start < cursor) continue;
    cursor = row.end;
    legs.push(row.leg);
  }
  return legs.slice(0, 4);
}

function extractHotel(raw: string, stays: QuoteStay[]) {
  const { source, text, index } = analyze(raw);
  const match = new RegExp(`\\bhotel\\s+(?:a|au|aux)\\s+(${CITY})\\b`, "id").exec(text);
  if (!match?.indices || match.index == null) return null;
  const place = sliceFolded(source, index, match.indices[1][0], match.indices[1][1]);
  if (!keepCity(place)) return null;
  const range = new RegExp(`du\\s+\\d{1,2}\\s+au\\s+\\d{1,2}\\s+(?:${MONTH})(?:\\s+\\d{4})?`, "id").exec(text);
  const single = new RegExp(`\\ben\\s+(?:${MONTH})\\b`, "id").exec(text);
  const picked = range || single;
  const when = picked?.indices ? sliceFolded(source, index, picked.indices[0][0], picked.indices[0][1]) : null;
  const known = cityInStays(place, stays);
  return { place, when, known };
}

function emptyFollow(kind: QuoteSketch["kind"], vague: boolean): QuoteSketch {
  return { kind, legs: [], place: null, when: null, party: EMPTY_PARTY, ask: null, followUp: true, vague };
}

function sketchOne(raw: string, stays: QuoteStay[]): QuoteSketch | null {
  const folded = foldQuote(raw);
  const legs = extractLegs(raw);
  const routeIsNew = legs.length > 0 && !legsInOneStay(legs, stays);
  const hotel = extractHotel(raw, stays);
  const hotelIsNew = Boolean(hotel && (!hotel.known || seeksHotel(folded)));
  const flightAsk = seeksFlight(folded) && !anchoredDossier(folded, stays);
  const hotelAsk = seeksHotel(folded) && !anchoredDossier(folded, stays);
  if (anchoredDossier(folded, stays) && !routeIsNew && !hotelIsNew) return null;
  if (!routeIsNew && !hotelIsNew && !flightAsk && !hotelAsk) return null;

  const party = readParty(raw);
  if (routeIsNew || flightAsk) {
    const dated = legs.some((leg) => leg.when);
    const ask = !legs.length ? "route" : !dated ? "dates" : !hasCabin(folded) ? "cabin" : null;
    return { kind: "flight", legs, place: null, when: null, party, ask, followUp: false, vague: false };
  }
  const ask = !hotel?.place ? "city" : !hotel.when ? "dates" : null;
  return {
    kind: "hotel",
    legs: [],
    place: hotel?.place || null,
    when: hotel?.when || null,
    party,
    ask,
    followUp: false,
    vague: false,
  };
}

function priorSketch(history: BubbleHistory[] | undefined, stays: QuoteStay[]) {
  const rows = history || [];
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (row?.direction !== "inbound" || !row.body?.trim()) continue;
    const found = sketchOne(voiceBody(row.body) || row.body, stays);
    if (found && !found.followUp) return found;
  }
  return null;
}

/** Devis nouveau : vols, hôtel ou voyage qui n’est pas une prestation du dossier. */
export function sketchQuote(message: string, stays: QuoteStay[], history?: BubbleHistory[]): QuoteSketch | null {
  const spoken = voiceBody(message);
  const utterance = (spoken || message).trim();
  if (!utterance || foldQuote(utterance) === "note vocale (transcription indisponible)") return null;
  const own = sketchOne(utterance, stays);
  if (own) return own;
  const folded = foldQuote(utterance);
  if (!barePriceAsk(folded) || anchoredDossier(folded, stays)) return null;
  if (priorSketch(history, stays)) return emptyFollow("trip", false);
  if (spoken || stays.length === 0) return emptyFollow("trip", true);
  return null;
}

function partyLine(party: Party, lang: QuoteLang) {
  const bits: string[] = [];
  if (lang === "en") {
    if (party.adults) bits.push(`${party.adults} adult${party.adults > 1 ? "s" : ""}`);
    if (party.children) {
      const label = party.children > 1 ? "children" : "child";
      bits.push(`${party.children} ${label}${party.ages ? ` (${party.ages})` : ""}`);
    }
    return bits.join(" and ");
  }
  if (lang === "he") {
    if (party.adults) bits.push(`${party.adults} מבוגרים`);
    if (party.children) bits.push(`${party.children} ילדים${party.ages ? ` (${party.ages})` : ""}`);
    return bits.join(" ו-");
  }
  if (party.adults) bits.push(`${party.adults} adulte${party.adults > 1 ? "s" : ""}`);
  if (party.children) {
    bits.push(`${party.children} enfant${party.children > 1 ? "s" : ""}${party.ages ? ` (${party.ages})` : ""}`);
  }
  return bits.join(" et ");
}

function routeLine(legs: Leg[]) {
  return legs.map((leg) => (leg.when ? `${leg.from}–${leg.to} le ${leg.when}` : `${leg.from}–${leg.to}`)).join(", ");
}

function questionLine(ask: QuoteSketch["ask"], lang: QuoteLang) {
  if (!ask) return "";
  const lines = {
    cabin: { fr: "En quelle classe souhaitez-vous voyager ?", en: "Which cabin would you like?", he: "באיזו מחלקה תרצו לטוס?" },
    dates: { fr: "Quelles dates vous conviendraient ?", en: "Which dates would suit you?", he: "אילו תאריכים יתאימו?" },
    route: { fr: "Quels trajets souhaitez-vous ?", en: "Which routes would you like?", he: "אילו מסלולים תרצו?" },
    city: { fr: "Dans quelle ville ?", en: "Which city?", he: "באיזו עיר?" },
  }[ask];
  return lines[lang];
}

export function priceConfirmLine(lang: QuoteLang) {
  if (lang === "en") return "A counsellor will confirm the amount shortly.";
  if (lang === "he") return "יועץ יאשר את הסכום בקרוב.";
  return "Un conseiller vous confirme le montant rapidement.";
}

export function renderQuote(sketch: QuoteSketch, lang: QuoteLang) {
  if (sketch.vague) {
    if (lang === "en") return "Your message is received. A counsellor will come back to you.";
    if (lang === "he") return "ההודעה התקבלה. יועץ יחזור אליכם.";
    return "Votre message est bien reçu. Un conseiller revient vers vous.";
  }
  if (sketch.followUp) {
    if (lang === "en") return "Noted. A counsellor will send the fare for this trip very shortly.";
    if (lang === "he") return "רשמתי. יועץ יעביר את ההצעה לטיול הזה בקרוב.";
    return "C’est bien noté. Un conseiller vous transmet le chiffrage de ce voyage très rapidement.";
  }
  const party = partyLine(sketch.party, lang);
  const routes = routeLine(sketch.legs);
  let summary = "";
  if (lang === "en") {
    if (sketch.kind === "hotel") {
      summary = `Noted: a hotel${sketch.place ? ` in ${sketch.place}` : ""}${sketch.when ? `, ${sketch.when}` : ""}${party ? `, for ${party}` : ""}.`;
    } else if (routes) {
      summary = `Noted: ${routes}${party ? `, for ${party}` : ""}.`;
    } else {
      summary = `Noted: flights${party ? ` for ${party}` : ""}.`;
    }
  } else if (lang === "he") {
    if (sketch.kind === "hotel") {
      summary = `רשמתי : מלון${sketch.place ? ` ב-${sketch.place}` : ""}${sketch.when ? `, ${sketch.when}` : ""}${party ? `, ${party}` : ""}.`;
    } else if (routes) {
      summary = `רשמתי : ${routes}${party ? `, ${party}` : ""}.`;
    } else {
      summary = `רשמתי : טיסות${party ? `, ${party}` : ""}.`;
    }
  } else if (sketch.kind === "hotel") {
    summary = `C’est noté : un hôtel${sketch.place ? ` à ${sketch.place}` : ""}${sketch.when ? `, ${sketch.when}` : ""}${party ? `, pour ${party}` : ""}.`;
  } else if (routes) {
    summary = `C’est noté : ${routes}${party ? `, pour ${party}` : ""}.`;
  } else {
    summary = `C’est noté : des billets d’avion${party ? `, pour ${party}` : ""}.`;
  }
  if (summary.length > 200) summary = `${summary.slice(0, 199).trim()}…`;
  const promise =
    lang === "en"
      ? "A counsellor will send the fare very shortly."
      : lang === "he"
        ? "יועץ יעביר את ההצעה בקרוב."
        : "Un conseiller vous transmet le chiffrage très rapidement.";
  return [summary, promise, questionLine(sketch.ask, lang)].filter(Boolean).join("\n");
}
