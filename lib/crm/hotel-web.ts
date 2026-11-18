import { parsePhoneNumberFromString } from "libphonenumber-js";
import { z } from "zod";
import { CITY_ALIASES } from "./city-names";
import { foldHotelLabel } from "./hotel-catalog";
import { catalogNameAgrees, clockStorage } from "./hotel-gallery";

/**
 * sonar-pro : quelques secondes, environ 0,02 USD par hôtel
 * (requête + jetons, ordre de grandeur du tarif public).
 * sonar-deep-research est plus lent et plusieurs fois plus cher : on ne l’utilise pas.
 */
export const PERPLEXITY_HOTEL_MODEL = "sonar-pro";
export const HOTEL_WEB_REVIEW_REASON = "Infos hôtel trouvées par recherche web";
export const PERPLEXITY_MISSING_KEY_WARNING =
  "[hotel-web] PERPLEXITY_API_KEY absente : recherche non lancée.";

const PHOTO_CAP = 6;
const SOURCE_CAP = 8;
const NAME_STOP = new Set(["hotel", "hotels", "the", "le", "la", "les", "de", "du", "des", "and"]);
const EMAIL = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const SKIP_EMAIL = /little-?emperors|expedia|travelba|taap|booking\.com/i;
const BLOCKED_HOST =
  /(^|\.)(localhost|local|internal|little-?emperors\.com|expedia\.[a-z.]+|booking\.com|tripadvisor\.[a-z.]+|facebook\.com|instagram\.com|tiktok\.com|twitter\.com|x\.com|doubleclick\.net|googlesyndication\.com)$/i;
const IMAGE_URL = /\.(jpe?g|png|webp|avif)(\?|#|$)/i;
const IMAGE_PATH = /(cloudinary|imgix|cloudfront|fastly|akamai|wp-content|\/media\/|\/images?\/|\/photos?\/|\/uploads?\/)/i;

const slotSchema = z
  .object({
    phone: z.unknown().optional(),
    telephone: z.unknown().optional(),
    email: z.unknown().optional(),
  })
  .loose();

const photoSchema = z.union([
  z.string(),
  z
    .object({
      url: z.string(),
      caption: z.unknown().optional(),
      legende: z.unknown().optional(),
    })
    .loose(),
]);

/** Forme brute renvoyée par le modèle. Les champs inutilisables sont retirés ensuite. */
export const hotelWebPayloadSchema = z
  .object({
    address: z.unknown().optional(),
    website: z.unknown().optional(),
    description: z.unknown().optional(),
    check_in: z.unknown().optional(),
    check_out: z.unknown().optional(),
    reception: slotSchema.nullable().optional(),
    reservations: slotSchema.nullable().optional(),
    concierge: slotSchema.nullable().optional(),
    photos: z.array(photoSchema).max(12).optional(),
    sources: z.array(z.unknown()).max(12).optional(),
  })
  .loose();

export type HotelDeskSlot = { phone: string | null; email: string | null };

export type HotelWebFacts = {
  address: string | null;
  website: string | null;
  description: string | null;
  check_in_time: string | null;
  check_out_time: string | null;
  reception: HotelDeskSlot;
  reservations: HotelDeskSlot;
  concierge: HotelDeskSlot;
  photos: { url: string; caption: string }[];
  sources: string[];
};

export type HotelWebItem = {
  kind?: string | null;
  title?: string | null;
  supplier?: string | null;
  lifecycle?: string | null;
  details?: Record<string, unknown> | null;
};

const EMPTY_SLOT: HotelDeskSlot = { phone: null, email: null };

const ROLE_LABEL = {
  reception: "Reception",
  reservations: "Reservations",
  concierge: "Concierge",
} as const;

type DeskRole = keyof typeof ROLE_LABEL;

const FILLED_LABEL: Record<string, string> = {
  address: "adresse",
  website: "site",
  description: "description",
  check_in_time: "arrivée",
  check_out_time: "départ",
  reception: "réception",
  reservations: "réservations",
  concierge: "concierge",
  photos: "photos",
};

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function hotelNameKey(value: string) {
  const tokens = foldHotelLabel(value)
    .split(" ")
    .filter((token) => token && !NAME_STOP.has(token));
  return tokens.join(" ") || foldHotelLabel(value);
}

export function hotelCityKey(value: string) {
  const folded = foldHotelLabel(value);
  return CITY_ALIASES[folded] || folded;
}

/** Même hôtel, même ville : une seule recherche. Milano et Milan partagent la clé. */
export function hotelCacheKey(name: string, city: string) {
  const hotel = hotelNameKey(name);
  const place = hotelCityKey(city);
  if (!hotel || !place) return "";
  return `${hotel}|${place}`;
}

export function isLittleEmperorsHotel(item: HotelWebItem) {
  const details = item.details || {};
  if (text(details.source_family) === "little_emperors") return true;
  if (details.le_hotel_id != null && String(details.le_hotel_id).trim() !== "") return true;
  return (item.supplier || "").toLowerCase().includes("little emperor");
}

export function hotelSearchIdentity(item: HotelWebItem) {
  const details = item.details || {};
  const name = text(details.hotel_name) || text(item.title);
  const city = text(details.city);
  return { name, city, key: hotelCacheKey(name, city) };
}

/** Téléphone international valide, sinon rien. */
export function acceptHotelPhone(value: unknown) {
  if (typeof value !== "string") return null;
  const compact = value.replace(/[().]/g, " ").replace(/\s+/g, " ").trim();
  if (!compact || /[a-z]/i.test(compact)) return null;
  const international = compact.startsWith("00") ? `+${compact.slice(2).replace(/\s/g, "")}` : compact.replace(/\s/g, "");
  if (!international.startsWith("+")) return null;
  const parsed = parsePhoneNumberFromString(international);
  if (!parsed?.isValid()) return null;
  return parsed.number;
}

/** E-mail d’hôtel. Les adresses fournisseur et les formes invalides sont rejetées. */
export function acceptHotelEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!EMAIL.test(email) || SKIP_EMAIL.test(email)) return null;
  return email;
}

function privateHost(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (BLOCKED_HOST.test(host)) return true;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const parts = ipv4.slice(1).map(Number);
  if (parts.some((part) => part > 255)) return true;
  const [a, b] = parts;
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function acceptHttpsUrl(value: unknown) {
  const raw = text(value);
  if (!raw || raw.length > 500) return "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "";
  }
  if (url.protocol !== "https:" || url.username || url.password) return "";
  if (privateHost(url.hostname)) return "";
  return url.toString();
}

export function acceptHotelPhotoUrl(value: unknown) {
  const url = acceptHttpsUrl(value);
  if (!url) return "";
  if (IMAGE_URL.test(url) || IMAGE_PATH.test(url)) return url;
  return "";
}

export function acceptHotelWebsite(value: unknown) {
  const url = acceptHttpsUrl(value);
  if (!url || BLOCKED_HOST.test(new URL(url).hostname)) return "";
  return url;
}

function acceptClock(value: unknown) {
  const raw = text(value);
  const match = raw.match(/^(\d{1,2})[:hH](\d{2})/);
  if (!match) return null;
  return clockStorage(`${match[1].padStart(2, "0")}:${match[2]}`);
}

function acceptAddress(value: unknown) {
  const address = text(value).replace(/\s+/g, " ");
  if (address.length < 8 || address.length > 240) return null;
  if (!/\d/.test(address) && !address.includes(",")) return null;
  return address;
}

function acceptDescription(value: unknown) {
  const description = text(value).replace(/\s+/g, " ");
  if (description.length < 40 || description.length > 700) return null;
  if (/https?:|<|>/.test(description)) return null;
  if (!description.includes(" ")) return null;
  return description;
}

function acceptSlot(value: unknown): HotelDeskSlot {
  const row = asRecord(value);
  if (!row) return { ...EMPTY_SLOT };
  return {
    phone: acceptHotelPhone(row.phone ?? row.telephone),
    email: acceptHotelEmail(row.email),
  };
}

function slotUseful(slot: HotelDeskSlot) {
  return Boolean(slot.phone || slot.email);
}

function normalizePayload(raw: unknown) {
  const row = asRecord(raw);
  if (!row) return raw;
  const reception = row.reception ?? row.reception_contact ?? row.front_desk;
  const reservations = row.reservations ?? row.reservation ?? row.reservations_contact;
  const concierge = row.concierge ?? row.concierge_contact;
  return {
    ...row,
    address: row.address ?? row.adresse,
    website: row.website ?? row.site,
    description: row.description ?? row.description_fr,
    check_in: row.check_in ?? row.check_in_time ?? row.heure_arrivee,
    check_out: row.check_out ?? row.check_out_time ?? row.heure_depart,
    reception,
    reservations,
    concierge,
    photos: row.photos,
    sources: row.sources ?? row.source ?? row.sources_url,
  };
}

export function extractJsonObject(value: string) {
  const trimmed = value.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    } catch {
      return null;
    }
  }
}

function cleanFacts(data: z.infer<typeof hotelWebPayloadSchema>): HotelWebFacts {
  const photos: HotelWebFacts["photos"] = [];
  const seenPhotos = new Set<string>();
  for (const entry of data.photos || []) {
    const url = acceptHotelPhotoUrl(typeof entry === "string" ? entry : entry.url);
    if (!url || seenPhotos.has(url)) continue;
    seenPhotos.add(url);
    const caption = typeof entry === "string" ? "" : text(entry.caption ?? entry.legende).slice(0, 120);
    photos.push({ url, caption });
    if (photos.length >= PHOTO_CAP) break;
  }
  const sources: string[] = [];
  const seenSources = new Set<string>();
  for (const entry of data.sources || []) {
    const url = acceptHttpsUrl(entry);
    if (!url || seenSources.has(url) || privateHost(new URL(url).hostname)) continue;
    seenSources.add(url);
    sources.push(url);
    if (sources.length >= SOURCE_CAP) break;
  }
  return {
    address: acceptAddress(data.address),
    website: acceptHotelWebsite(data.website) || null,
    description: acceptDescription(data.description),
    check_in_time: acceptClock(data.check_in),
    check_out_time: acceptClock(data.check_out),
    reception: acceptSlot(data.reception),
    reservations: acceptSlot(data.reservations),
    concierge: acceptSlot(data.concierge),
    photos,
    sources,
  };
}

export function hotelWebFactsUseful(facts: HotelWebFacts) {
  return Boolean(
    facts.address ||
      facts.website ||
      facts.description ||
      facts.check_in_time ||
      facts.check_out_time ||
      facts.photos.length ||
      slotUseful(facts.reception) ||
      slotUseful(facts.reservations) ||
      slotUseful(facts.concierge)
  );
}

/** JSON du modèle, validé. Un e-mail ou un téléphone mal formé est retiré, pas recopié. */
export function parseHotelWebPayload(raw: unknown): { facts: HotelWebFacts } | { error: string } {
  const parsed = hotelWebPayloadSchema.safeParse(normalizePayload(raw));
  if (!parsed.success) return { error: "Réponse hôtel illisible." };
  const facts = cleanFacts(parsed.data);
  if (!hotelWebFactsUseful(facts)) return { error: "Réponse hôtel vide." };
  return { facts };
}

type StoredContact = {
  type: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
};

function storedContacts(details: Record<string, unknown>): StoredContact[] {
  const raw = details.hotel_contacts;
  if (!Array.isArray(raw)) return [];
  const people: StoredContact[] = [];
  for (const entry of raw) {
    const row = asRecord(entry);
    if (!row) continue;
    people.push({
      type: text(row.type),
      first_name: text(row.first_name),
      last_name: text(row.last_name),
      email: text(row.email),
      phone: text(row.phone),
    });
  }
  return people;
}

function deskRole(type: string): DeskRole | null {
  const folded = foldHotelLabel(type);
  if (!folded) return null;
  if (/\breception\b|\bfront desk\b|\bfront office\b/.test(folded)) return "reception";
  if (/\breservation/.test(folded) || /\bbooking\b/.test(folded)) return "reservations";
  if (/\bconcierge\b/.test(folded)) return "concierge";
  return null;
}

function contactHasChannel(person: StoredContact) {
  return Boolean(person.email || person.phone);
}

function storedPhotos(details: Record<string, unknown>) {
  const raw = details.photos;
  if (!Array.isArray(raw) || !raw.length) return false;
  return raw.some((entry) => {
    if (typeof entry === "string") return Boolean(acceptHotelPhotoUrl(entry) || acceptHttpsUrl(entry));
    const row = asRecord(entry);
    return Boolean(row && (acceptHotelPhotoUrl(row.url) || acceptHttpsUrl(row.url)));
  });
}

/** Champs encore vides. Une valeur déjà écrite n’est pas un trou. */
export function hotelWebGaps(details: Record<string, unknown> | null | undefined) {
  const row = details || {};
  const gaps: string[] = [];
  if (!text(row.address)) gaps.push("adresse");
  if (!text(row.website)) gaps.push("site");
  if (!text(row.description)) gaps.push("description");
  if (!text(row.check_in_time)) gaps.push("arrivée");
  if (!text(row.check_out_time)) gaps.push("départ");
  const people = storedContacts(row);
  for (const role of ["reception", "reservations", "concierge"] as const) {
    const found = people.some((person) => deskRole(person.type) === role && contactHasChannel(person));
    if (!found) gaps.push(FILLED_LABEL[role]);
  }
  if (!storedPhotos(row)) gaps.push("photos");
  return gaps;
}

export function shouldAutoEnrichHotel(item: HotelWebItem) {
  if (item.kind !== "hotel") return false;
  if (item.lifecycle === "cancelled" || item.lifecycle === "superseded") return false;
  if (isLittleEmperorsHotel(item)) return false;
  if (!hotelSearchIdentity(item).key) return false;
  return hotelWebGaps(item.details).length > 0;
}

function mergeSources(current: unknown, incoming: string[]) {
  const urls: string[] = [];
  const seen = new Set<string>();
  const list = Array.isArray(current) ? current : [];
  for (const entry of [...list, ...incoming]) {
    const url = acceptHttpsUrl(entry);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= SOURCE_CAP) break;
  }
  return urls;
}

/**
 * Ne remplit que les champs vides. La visibilité n’est pas un champ de cette fonction.
 * `markReview` pose le bandeau « à vérifier » quand la source est la recherche web.
 */
export function mergeHotelWebFacts(
  details: Record<string, unknown> | null | undefined,
  facts: HotelWebFacts,
  opts?: { markReview?: boolean; cacheKey?: string; model?: string; remember?: boolean }
) {
  const next: Record<string, unknown> = { ...(details || {}) };
  const filled: string[] = [];
  const mark = (key: string) => {
    const label = FILLED_LABEL[key];
    if (label && !filled.includes(label)) filled.push(label);
  };
  if (!text(next.address) && facts.address) {
    next.address = facts.address;
    mark("address");
  }
  if (!text(next.website) && facts.website) {
    next.website = facts.website;
    mark("website");
  }
  if (!text(next.description) && facts.description) {
    next.description = facts.description;
    mark("description");
  }
  if (!text(next.check_in_time) && facts.check_in_time) {
    next.check_in_time = facts.check_in_time;
    mark("check_in_time");
  }
  if (!text(next.check_out_time) && facts.check_out_time) {
    next.check_out_time = facts.check_out_time;
    mark("check_out_time");
  }
  const people = storedContacts(next);
  let contactsChanged = false;
  for (const role of ["reception", "reservations", "concierge"] as const) {
    const incoming = facts[role];
    if (!slotUseful(incoming)) continue;
    const index = people.findIndex((person) => deskRole(person.type) === role);
    if (index < 0) {
      people.push({
        type: ROLE_LABEL[role],
        first_name: "",
        last_name: "",
        email: incoming.email || "",
        phone: incoming.phone || "",
      });
      contactsChanged = true;
      mark(role);
      continue;
    }
    const current = people[index];
    let roleChanged = false;
    if (!current.email && incoming.email) {
      current.email = incoming.email;
      roleChanged = true;
    }
    if (!current.phone && incoming.phone) {
      current.phone = incoming.phone;
      roleChanged = true;
    }
    if (roleChanged) {
      contactsChanged = true;
      mark(role);
    }
  }
  if (contactsChanged) next.hotel_contacts = people;
  if (!storedPhotos(next) && facts.photos.length) {
    next.photos = facts.photos.map((photo) => ({
      url: photo.url,
      thumb: photo.url,
      caption: photo.caption,
      kind: "hotel" as const,
    }));
    mark("photos");
  }
  if (facts.sources.length) {
    const sources = mergeSources(next.web_sources, facts.sources);
    if (sources.length) next.web_sources = sources;
  }
  if (opts?.cacheKey && filled.length && !text(next.web_cache_key)) next.web_cache_key = opts.cacheKey;
  if (opts?.remember && filled.length) {
    next.web_facts = facts;
    if (opts.model) next.web_model = opts.model;
  }
  if (opts?.markReview && filled.length) {
    next.needs_review = true;
    if (!text(next.review_reason)) next.review_reason = HOTEL_WEB_REVIEW_REASON;
  }
  const changed = JSON.stringify(details || {}) !== JSON.stringify(next);
  return { details: next, filled, changed };
}

export function hotelWebUserPrompt(name: string, city: string) {
  return [
    `Hôtel : ${name}`,
    `Ville : ${city}`,
    "Réponds par un objet JSON avec les clés address, website, description, check_in, check_out, reception, reservations, concierge, photos, sources.",
    "reception, reservations et concierge valent { phone, email }.",
    "photos vaut [{ url, caption }]. check_in et check_out valent HH:mm.",
    "description est en français, deux ou trois phrases.",
    "null pour tout ce que les sources ne disent pas.",
  ].join("\n");
}

export const HOTEL_WEB_SYSTEM =
  "Tu cherches les informations publiques d’un hôtel et tu réponds uniquement par un objet JSON, sans markdown. N’invente rien : null si la source ne le dit pas. La description est en français. Pas de prix, pas de commission, pas de condition d’annulation. Les téléphones sont internationaux, avec +. Les photos sont des URL https directes du site officiel ou d’un CDN fiable, pas des réseaux sociaux. sources liste les pages consultées.";

export const HOTEL_WEB_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    address: { type: ["string", "null"] },
    website: { type: ["string", "null"] },
    description: { type: ["string", "null"] },
    check_in: { type: ["string", "null"] },
    check_out: { type: ["string", "null"] },
    reception: {
      type: "object",
      additionalProperties: false,
      properties: { phone: { type: ["string", "null"] }, email: { type: ["string", "null"] } },
      required: ["phone", "email"],
    },
    reservations: {
      type: "object",
      additionalProperties: false,
      properties: { phone: { type: ["string", "null"] }, email: { type: ["string", "null"] } },
      required: ["phone", "email"],
    },
    concierge: {
      type: "object",
      additionalProperties: false,
      properties: { phone: { type: ["string", "null"] }, email: { type: ["string", "null"] } },
      required: ["phone", "email"],
    },
    photos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { url: { type: "string" }, caption: { type: ["string", "null"] } },
        required: ["url", "caption"],
      },
    },
    sources: { type: "array", items: { type: "string" } },
  },
  required: [
    "address",
    "website",
    "description",
    "check_in",
    "check_out",
    "reception",
    "reservations",
    "concierge",
    "photos",
    "sources",
  ],
} as const;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function perplexityBody(name: string, city: string, schema: boolean) {
  return {
    model: PERPLEXITY_HOTEL_MODEL,
    temperature: 0,
    messages: [
      { role: "system", content: HOTEL_WEB_SYSTEM },
      { role: "user", content: hotelWebUserPrompt(name, city) },
    ],
    ...(schema
      ? {
          response_format: {
            type: "json_schema",
            json_schema: { name: "hotel_web", schema: HOTEL_WEB_JSON_SCHEMA },
          },
        }
      : {}),
  };
}

function readModelJson(payload: unknown) {
  const root = asRecord(payload);
  const choices = Array.isArray(root?.choices) ? root.choices : [];
  const message = asRecord(asRecord(choices[0])?.message);
  const content = message?.content;
  if (typeof content === "string") return extractJsonObject(content);
  if (content && typeof content === "object") return content;
  return null;
}

async function callPerplexity(name: string, city: string, key: string, fetchImpl: FetchLike, schema: boolean) {
  const response = await fetchImpl("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(perplexityBody(name, city, schema)),
    signal: AbortSignal.timeout(25_000),
  });
  return response;
}

/** Appel Perplexity. Sans clé, aucun appel réseau. */
export async function loadPerplexityHotel(
  name: string,
  city: string,
  opts: { env?: Record<string, string | undefined>; fetchImpl?: FetchLike }
): Promise<{ facts: HotelWebFacts; model: string } | { error: "cle_absente" | "reponse_invalide" | "reseau" }> {
  const key = (opts.env?.PERPLEXITY_API_KEY ?? process.env.PERPLEXITY_API_KEY ?? "").trim();
  if (!key) {
    console.warn(PERPLEXITY_MISSING_KEY_WARNING);
    return { error: "cle_absente" };
  }
  const fetchImpl = opts.fetchImpl || fetch;
  try {
    let response = await callPerplexity(name, city, key, fetchImpl, true);
    if (response.status === 400) response = await callPerplexity(name, city, key, fetchImpl, false);
    if (!response.ok) return { error: "reponse_invalide" };
    const payload = (await response.json()) as unknown;
    const parsed = parseHotelWebPayload(readModelJson(payload));
    if ("error" in parsed) return { error: "reponse_invalide" };
    return { facts: parsed.facts, model: PERPLEXITY_HOTEL_MODEL };
  } catch {
    return { error: "reseau" };
  }
}

export type CatalogueHotelRow = {
  name?: string | null;
  city?: string | null;
  region_name?: string | null;
  address?: string | null;
  check_in_time?: string | null;
  check_out_time?: string | null;
  images?: unknown;
  website?: string | null;
};

export type CatalogueContactRow = {
  hotel_name?: string | null;
  city?: string | null;
  contact_type?: string | null;
  type?: string | null;
  email?: string | null;
  phone?: string | null;
};

/** Une seule fiche catalogue pour ce nom et cette ville. Deux hôtels possibles : aucune. */
export function pickCatalogueHotel<T extends CatalogueHotelRow>(rows: T[], name: string, city: string) {
  const wantName = hotelNameKey(name);
  const wantCity = hotelCityKey(city);
  if (!wantName || !wantCity) return null;
  const hits = rows.filter((row) => {
    const rowName = row.name || "";
    const rowCity = row.city || row.region_name || "";
    return hotelNameKey(String(rowName)) === wantName && hotelCityKey(String(rowCity)) === wantCity;
  });
  return hits.length === 1 ? hits[0] : null;
}

export function factsFromCatalogueHotel(row: CatalogueHotelRow | null): HotelWebFacts | null {
  if (!row) return null;
  const images = Array.isArray(row.images) ? row.images : [];
  const photos: HotelWebFacts["photos"] = [];
  for (const image of images) {
    const url = acceptHotelPhotoUrl(typeof image === "string" ? image : asRecord(image)?.url);
    if (!url || photos.some((photo) => photo.url === url)) continue;
    photos.push({ url, caption: "" });
    if (photos.length >= PHOTO_CAP) break;
  }
  const facts: HotelWebFacts = {
    address: acceptAddress(row.address),
    website: acceptHotelWebsite(row.website) || null,
    description: null,
    check_in_time: acceptClock(row.check_in_time),
    check_out_time: acceptClock(row.check_out_time),
    reception: { ...EMPTY_SLOT },
    reservations: { ...EMPTY_SLOT },
    concierge: { ...EMPTY_SLOT },
    photos,
    sources: [],
  };
  return hotelWebFactsUseful(facts) ? facts : null;
}

export function factsFromCatalogueContacts(rows: CatalogueContactRow[], name: string, city: string): HotelWebFacts | null {
  const picked = rows.filter((row) => {
    if (!row.hotel_name && !row.city) return true;
    return (
      hotelNameKey(row.hotel_name || name) === hotelNameKey(name) &&
      (!row.city || hotelCityKey(row.city) === hotelCityKey(city))
    );
  });
  const facts: HotelWebFacts = {
    address: null,
    website: null,
    description: null,
    check_in_time: null,
    check_out_time: null,
    reception: { ...EMPTY_SLOT },
    reservations: { ...EMPTY_SLOT },
    concierge: { ...EMPTY_SLOT },
    photos: [],
    sources: [],
  };
  for (const row of picked) {
    const role = deskRole(text(row.contact_type || row.type));
    if (!role) continue;
    const phone = acceptHotelPhone(row.phone);
    const email = acceptHotelEmail(row.email);
    if (!facts[role].phone && phone) facts[role].phone = phone;
    if (!facts[role].email && email) facts[role].email = email;
  }
  return hotelWebFactsUseful(facts) ? facts : null;
}

export function ratehawkRowAgrees(cardName: string, rowName: string) {
  if (!cardName.trim() || !rowName.trim()) return false;
  if (hotelNameKey(cardName) === hotelNameKey(rowName)) return true;
  return catalogNameAgrees(cardName, rowName);
}

export function emptyHotelWebFacts(): HotelWebFacts {
  return {
    address: null,
    website: null,
    description: null,
    check_in_time: null,
    check_out_time: null,
    reception: { ...EMPTY_SLOT },
    reservations: { ...EMPTY_SLOT },
    concierge: { ...EMPTY_SLOT },
    photos: [],
    sources: [],
  };
}
