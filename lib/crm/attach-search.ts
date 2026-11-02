import { formatDateRangeShort } from "./money";
import { fold } from "./text";

/** Même délai que la barre agence. La saisie ne part pas à chaque frappe. */
export const ATTACH_SEARCH_DEBOUNCE_MS = 280;
export const ATTACH_SEARCH_MIN_CHARS = 2;
/** Lignes affichées dans l’autocomplétion. */
export const ATTACH_RESULT_LIMIT = 12;
/** Candidats ramenés avant le tri par pertinence. */
export const ATTACH_CANDIDATE_LIMIT = 40;

const FAR = 100_000;

/** Minuscules, sans accent, ponctuation en espace. « Gaëlle » → « gaelle ». */
export function attachSearchFold(value: string | null | undefined) {
  const prepared = (value || "").replaceAll("Œ", "oe").replaceAll("œ", "oe").replaceAll("Æ", "ae").replaceAll("æ", "ae");
  return fold(prepared)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Mots de la recherche, au moins deux signes, sans doublon.
 * « TB-2026-0042 » → tb, 2026, 0042. Une seule lettre ne filtre pas tout le fichier.
 */
export function attachSearchTokens(query: string | null | undefined) {
  const spaced = attachSearchFold((query || "").slice(0, 80));
  const tokens: string[] = [];
  for (const token of spaced.split(" ")) {
    if (token.length < 2 || tokens.includes(token)) continue;
    tokens.push(token);
    if (tokens.length >= 8) break;
  }
  return tokens;
}

/** Chaque mot doit apparaître quelque part, dans n’importe quel ordre, en fragment. */
export function attachSearchMatches(haystack: string | null | undefined, query: string | null | undefined) {
  const raw = (query || "").trim();
  if (!raw) return true;
  const tokens = attachSearchTokens(raw);
  if (!tokens.length) return false;
  const hay = attachSearchFold(haystack);
  if (!hay) return false;
  return tokens.every((token) => hay.includes(token));
}

export type AttachSearchDoc = {
  reference: string;
  title: string;
  destination: string;
  clientName: string;
  companies: string[];
  travelers: string[];
  places: string[];
};

function compact(value: string) {
  return attachSearchFold(value).replace(/ /g, "");
}

function wordStarts(hay: string, token: string) {
  return hay.split(" ").some((word) => word.startsWith(token));
}

/** Un mot trop court sans chiffre (« tb ») est dans presque toutes les références : il ne départage pas. */
function referenceHit(token: string, reference: string) {
  if (token.length < 3 && !/\d/.test(token)) return false;
  return reference.includes(token);
}

/** Plus le score est haut, plus le dossier est le bon. Un mot ne compte qu’une fois, sur son meilleur champ. */
export function attachSearchScore(doc: AttachSearchDoc, query: string) {
  const tokens = attachSearchTokens(query);
  if (!tokens.length) return 0;
  const reference = attachSearchFold(doc.reference);
  const client = attachSearchFold(doc.clientName);
  const title = attachSearchFold(`${doc.title} ${doc.destination}`);
  const companies = attachSearchFold(doc.companies.join(" "));
  const travelers = attachSearchFold(doc.travelers.join(" "));
  const places = attachSearchFold(doc.places.join(" "));
  let score = 0;
  for (const token of tokens) {
    let best = 0;
    if (referenceHit(token, reference)) best = Math.max(best, 80);
    if (client && (wordStarts(client, token) || client.includes(token))) best = Math.max(best, wordStarts(client, token) ? 55 : 40);
    if (companies.includes(token)) best = Math.max(best, 36);
    if (title.includes(token)) best = Math.max(best, 32);
    if (travelers.includes(token)) best = Math.max(best, 30);
    if (places.includes(token)) best = Math.max(best, 28);
    score += best;
  }
  if (client && tokens.every((token) => client.includes(token))) score += 24;
  const needle = compact(query);
  const ref = compact(doc.reference);
  if (needle.length >= 4 && ref) {
    if (ref === needle) score += 400;
    else if (ref.includes(needle)) score += 220;
  }
  return score;
}

function dayNumber(iso: string | null | undefined) {
  const day = (iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const [year, month, date] = day.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, date) / 86_400_000);
}

/** 0 si la date du jour tombe dans le séjour, sinon le nombre de jours jusqu’au plus proche bord. */
export function attachDateDistance(start: string | null | undefined, end: string | null | undefined, today: string) {
  const current = dayNumber(today);
  const from = dayNumber(start);
  const to = dayNumber(end);
  if (current == null || (from == null && to == null)) return FAR;
  const lo = Math.min(from ?? to!, to ?? from!);
  const hi = Math.max(from ?? to!, to ?? from!);
  if (current >= lo && current <= hi) return 0;
  return Math.min(Math.abs(current - lo), Math.abs(current - hi));
}

export type AttachBookingRow = {
  id: string;
  reference: string;
  title: string | null;
  destination: string | null;
  customer_id: string | null;
  billing_company_id: string | null;
  start_date: string | null;
  end_date: string | null;
  status?: string | null;
};

export type AttachPerson = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  usage_name?: string | null;
  company_name?: string | null;
};

export type AttachCompany = {
  id: string;
  customer_id: string;
  company_name: string | null;
};

export type AttachTraveler = {
  booking_id: string;
  first_name: string | null;
  last_name: string | null;
};

export type AttachItemRow = {
  id: string;
  booking_id: string;
  kind: string | null;
  title: string | null;
  amount: number | null;
  details?: Record<string, unknown> | null;
  lifecycle?: string | null;
};

export type ShapedAttachTarget = {
  id: string;
  reference: string;
  title: string;
  destination: string;
  client: string;
  company: string;
  dates: string;
  items: { id: string; label: string; kind: string | null; amount: number | null }[];
};

function clean(value: string | null | undefined) {
  return (value || "").trim();
}

function personName(person: { first_name?: string | null; last_name?: string | null; usage_name?: string | null } | null) {
  if (!person) return "";
  const name = [clean(person.first_name), clean(person.last_name)].filter(Boolean).join(" ");
  const usage = clean(person.usage_name);
  if (usage && attachSearchFold(usage) !== attachSearchFold(person.last_name) && !attachSearchFold(name).includes(attachSearchFold(usage))) {
    return name ? `${name} (${usage})` : usage;
  }
  return name;
}

function itemLabel(item: AttachItemRow) {
  const hotel = typeof item.details?.hotel_name === "string" ? item.details.hotel_name.trim() : "";
  return hotel || clean(item.title) || "Ligne";
}

function uniqueNames(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const name = value.trim();
    const key = attachSearchFold(name);
    if (!name || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/**
 * Référence, titre, dates, client et société. La destination n’est répétée que si elle diffère du titre.
 * `dates` est déjà formaté.
 */
export function attachTargetCaption(row: {
  reference?: string | null;
  title?: string | null;
  destination?: string | null;
  dates?: string | null;
  client?: string | null;
  company?: string | null;
}) {
  const title = clean(row.title);
  const destination = clean(row.destination);
  const place = title || destination;
  const extra = destination && title && attachSearchFold(destination) !== attachSearchFold(title) ? destination : "";
  const headline = [clean(row.reference), place, extra].filter(Boolean).join(" · ") || "Dossier";
  const detail = [clean(row.dates), clean(row.client), clean(row.company)].filter(Boolean).join(" · ");
  return { headline, detail };
}

/**
 * Met en forme les dossiers trouvés : libellé lisible, pertinence, puis séjour le plus proche.
 * Un dossier annulé ne s’affiche pas. Les cartes annulées ou remplacées ne sont pas proposées comme ligne.
 */
export function shapeAttachTargets(input: {
  query: string;
  today: string;
  bookings: AttachBookingRow[];
  customers: AttachPerson[];
  companies: AttachCompany[];
  travelers: AttachTraveler[];
  items: AttachItemRow[];
  limit?: number;
  /** Un dossier demandé par identifiant reste visible, même annulé. */
  includeCancelled?: boolean;
}): ShapedAttachTarget[] {
  const people = new Map(input.customers.map((person) => [person.id, person]));
  const companyById = new Map(input.companies.map((company) => [company.id, clean(company.company_name)]));
  const companiesByCustomer = new Map<string, string[]>();
  for (const company of input.companies) {
    const name = clean(company.company_name);
    if (!name) continue;
    const list = companiesByCustomer.get(company.customer_id) || [];
    list.push(name);
    companiesByCustomer.set(company.customer_id, list);
  }
  const travelersByBooking = new Map<string, string[]>();
  for (const traveler of input.travelers) {
    const name = [clean(traveler.first_name), clean(traveler.last_name)].filter(Boolean).join(" ");
    if (!name) continue;
    const list = travelersByBooking.get(traveler.booking_id) || [];
    list.push(name);
    travelersByBooking.set(traveler.booking_id, list);
  }
  const itemsByBooking = new Map<string, AttachItemRow[]>();
  for (const item of input.items) {
    const list = itemsByBooking.get(item.booking_id) || [];
    list.push(item);
    itemsByBooking.set(item.booking_id, list);
  }

  const ranked = input.bookings
    .filter((booking) => input.includeCancelled || booking.status !== "cancelled")
    .map((booking) => {
      const person = booking.customer_id ? people.get(booking.customer_id) || null : null;
      const client = personName(person);
      const billed = booking.billing_company_id ? companyById.get(booking.billing_company_id) || "" : "";
      const companies = uniqueNames([
        billed,
        clean(person?.company_name),
        ...(booking.customer_id ? companiesByCustomer.get(booking.customer_id) || [] : []),
      ]);
      const travelers = travelersByBooking.get(booking.id) || [];
      const rows = itemsByBooking.get(booking.id) || [];
      const places = rows.map((item) => itemLabel(item));
      const doc: AttachSearchDoc = {
        reference: booking.reference,
        title: clean(booking.title),
        destination: clean(booking.destination),
        clientName: [client, clean(person?.first_name), clean(person?.last_name), clean(person?.usage_name)].filter(Boolean).join(" "),
        companies,
        travelers,
        places,
      };
      const active = rows.filter((item) => item.lifecycle !== "superseded" && item.lifecycle !== "cancelled");
      const dates = booking.start_date || booking.end_date ? formatDateRangeShort(booking.start_date, booking.end_date) : "";
      const shaped: ShapedAttachTarget = {
        id: booking.id,
        reference: booking.reference,
        title: clean(booking.title) || clean(booking.destination),
        destination: clean(booking.destination),
        client,
        company: billed || companies[0] || "",
        dates: dates === "Dates à confirmer" ? "" : dates,
        items: active.map((item) => ({
          id: item.id,
          label: itemLabel(item),
          kind: item.kind,
          amount: item.amount == null ? null : Number(item.amount),
        })),
      };
      return {
        shaped,
        score: attachSearchScore(doc, input.query),
        distance: attachDateDistance(booking.start_date, booking.end_date, input.today),
        start: booking.start_date || "",
      };
    });

  ranked.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.distance !== b.distance) return a.distance - b.distance;
    if (a.start !== b.start) return a.start < b.start ? 1 : -1;
    return a.shaped.reference.localeCompare(b.shaped.reference, "fr");
  });
  return ranked.slice(0, input.limit ?? ATTACH_RESULT_LIMIT).map((row) => row.shaped);
}
