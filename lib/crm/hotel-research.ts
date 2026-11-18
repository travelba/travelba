import { hotelCityLine, hotelDisplayName } from "@/lib/crm/carnet";
import { CITY_ALIASES } from "@/lib/crm/city-names";
import { foldHotelLabel, hotelCitiesCompatible, knownLeHotelId } from "@/lib/crm/hotel-catalog";
import { normalizePerson, peopleFromDetails, safeWebsite, type HotelPersonContact } from "@/lib/crm/hotel-contact";
import { frenchClientProse } from "@/lib/crm/hotel-fr";
import { catalogNameAgrees, storedHotelPhotos, type HotelPhoto } from "@/lib/crm/hotel-gallery";
import type { CrmBookingItem } from "@/lib/crm/types";

const PHOTO_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEAD = ["facade", "façade", "exterior", "exterieur", "extérieur", "lobby", "hall", "reception", "réception"];
const SKIP_PHOTO = /facebook|instagram|tiktok|little-?emperors|doubleclick|gstatic|googleusercontent/i;
const PRICE = /\d[\d\s.,]*\s*(?:€|eur|\$|usd|£)|(?:€|\$|£)\s*\d/i;

export type HotelResearchItem = {
  kind?: string | null;
  title?: string | null;
  supplier?: string | null;
  details?: Record<string, unknown> | null;
};

export type HotelResearchFields = {
  description: string;
  address: string;
  website: string;
  phone: string;
  city: string;
  country: string;
  contacts: HotelPersonContact[];
  photos: { url: string; caption: string }[];
};

export type HotelResearchReview =
  | { outcome: "nom" }
  | { outcome: "unverifiable" }
  | { outcome: "vide" }
  | { outcome: "prete"; fields: HotelResearchFields };

type Page = { url: string; text: string };

function asItem(item: HotelResearchItem): CrmBookingItem {
  return item as CrmBookingItem;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Hôtel déjà couvert par Little Emperors : pas de recherche. */
export function isLittleEmperorsCard(item: HotelResearchItem) {
  const details = item.details || {};
  if (details.source_family === "little_emperors") return true;
  if ((item.supplier || "").toLowerCase().includes("little emperor")) return true;
  return knownLeHotelId(asItem(item)) != null;
}

export function hotelResearchComplete(details: Record<string, unknown> | null | undefined) {
  const row = details || {};
  const description = frenchClientProse(text(row.description));
  return peopleFromDetails(row).length > 0 && storedHotelPhotos(row).length > 0 && Boolean(description);
}

/**
 * Pose `attente` sur une carte hôtel incomplète.
 * L’appelant ne le fait que si la clé Perplexity est là : sinon la carte reste telle quelle.
 */
export function detailsWithHotelResearch(item: HotelResearchItem) {
  const details = { ...(item.details || {}) };
  if (item.kind !== "hotel" || isLittleEmperorsCard(item)) return details;
  const name = hotelDisplayName(asItem(item));
  if (!name || foldHotelLabel(name) === "hotel") return details;
  if (hotelResearchComplete(details)) return details;
  const status = details.hotel_research;
  if (status === "attente" || status === "prete" || status === "vide" || status === "echec") return details;
  return { ...details, hotel_research: "attente" };
}

export function hotelProfileKey(name: string, city: string) {
  const foldedCity = foldHotelLabel(city);
  return {
    name_key: foldHotelLabel(name).slice(0, 180),
    city_key: (CITY_ALIASES[foldedCity] || foldedCity).slice(0, 80),
  };
}

export function hotelPhotoStoragePath(profileId: string, index: number) {
  if (!PHOTO_ID.test(profileId) || !Number.isInteger(index) || index < 0 || index > 7) return "";
  return `hotels/${profileId.toLowerCase()}/${index}.webp`;
}

export function hotelPhotoPublicUrl(profileId: string, index: number) {
  if (!hotelPhotoStoragePath(profileId, index)) return "";
  return `/api/hotels/photos/${profileId.toLowerCase()}/${index}`;
}

/** Ligne agence. Le client ne la voit pas : `withoutHotelRoster` retire le statut. */
export function hotelResearchNotice(details: Record<string, unknown> | null | undefined) {
  const status = details?.hotel_research;
  if (status === "attente") return "Recherche de l’hôtel…";
  if (status === "echec") return "La recherche n’a pas abouti.";
  if (status === "vide" && !peopleFromDetails(details).length) return "Aucun contact public trouvé.";
  return "";
}

export function parseResearchJson(value: string) {
  const trimmed = value.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] || trimmed).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function pageBlob(pages: Page[]) {
  return pages.map((page) => page.text).join("\n");
}

function citedWebsite(website: string, pages: Page[]) {
  if (!website) return "";
  let host = "";
  try {
    host = new URL(website).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
  if (host.length < 4) return "";
  const folded = host.toLowerCase();
  return pages.some((page) => page.text.toLowerCase().includes(folded)) ? website : "";
}

function pageHas(pages: Page[], needle: string) {
  const folded = fold(needle);
  if (folded.length < 8) return false;
  return pages.some((page) => fold(page.text).includes(folded));
}

function emailInPages(pages: Page[], email: string) {
  const folded = email.toLowerCase();
  return pages.some((page) => page.text.toLowerCase().includes(folded));
}

function phoneInPages(pages: Page[], phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return false;
  const tail = digits.slice(-8);
  return pages.some((page) => page.text.replace(/\D/g, "").includes(tail));
}

function contactType(raw: string, pages: Page[]) {
  const blob = fold(pageBlob(pages));
  const folded = fold(raw);
  if (/concierge/.test(folded) && blob.includes("concierge")) return "Concierge";
  if (/reserv|booking/.test(folded) && /reserv|booking/.test(blob)) return "Reservations";
  if (/recept|front office|accueil/.test(folded) && /recept|front office|accueil/.test(blob)) return "Réception";
  if (/\bspa\b/.test(folded) && /\bspa\b/.test(blob)) return "Spa";
  if (raw.trim() && pageHas(pages, raw.trim())) return raw.trim().slice(0, 40);
  return "Hôtel";
}

function orderedPhotos(value: unknown, pages: Page[]) {
  const rows: { url: string; caption: string; rank: number }[] = [];
  if (!Array.isArray(value)) return [];
  for (const entry of value) {
    const row = typeof entry === "string" ? { url: entry } : record(entry);
    if (!row) continue;
    const url = text(row.url || (typeof entry === "string" ? entry : ""));
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    if (parsed.protocol !== "https:" || parsed.username || SKIP_PHOTO.test(parsed.href)) continue;
    const href = parsed.toString();
    if (!pages.some((page) => page.text.includes(href) || page.text.includes(url))) continue;
    const caption = text(row.caption || row.legende || row.description).slice(0, 80);
    const folded = fold(caption);
    const rank = LEAD.findIndex((word) => folded.includes(fold(word)));
    rows.push({ url: parsed.toString(), caption, rank: rank < 0 ? 20 : rank });
  }
  const seen = new Set<string>();
  return rows
    .sort((left, right) => left.rank - right.rank)
    .filter((row) => {
      if (seen.has(row.url)) return false;
      seen.add(row.url);
      return true;
    })
    .slice(0, 8)
    .map(({ url, caption }) => ({ url, caption }));
}

function frenchDescription(value: string, pages: Page[], preuves: unknown) {
  const quotes = Array.isArray(preuves) ? preuves.map((entry) => text(entry)).filter((entry) => entry.length >= 12) : [];
  if (!quotes.some((quote) => pageHas(pages, quote))) return "";
  const shown = frenchClientProse(value);
  if (!shown || PRICE.test(shown) || /annulation/i.test(shown)) return "";
  const parts = shown
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 15);
  if (parts.length < 2) return "";
  return parts.slice(0, 4).join(" ");
}

/**
 * Ne garde un champ que s’il est écrit sur une page citée.
 * Un autre hôtel : on n’écrit rien.
 */
export function reviewHotelResearch(input: {
  hotelName: string;
  city: string;
  draft: unknown;
  pages: Page[];
}): HotelResearchReview {
  const draft = record(input.draft);
  if (!draft) return { outcome: "unverifiable" };
  const pages = input.pages.filter((page) => page.url.startsWith("https://") && page.text.trim().length > 40);
  if (!pages.length) return { outcome: "unverifiable" };
  const named = text(draft.hotel_name || draft.nom);
  if (!named || !catalogNameAgrees(input.hotelName, named)) return { outcome: "nom" };
  const city = text(draft.city || draft.ville);
  if (input.city && city && !hotelCitiesCompatible(input.city, city)) return { outcome: "nom" };

  const contacts: HotelPersonContact[] = [];
  const rawContacts = Array.isArray(draft.contacts) ? draft.contacts : [];
  for (const entry of rawContacts) {
    const person = normalizePerson(entry);
    if (!person) continue;
    const emailOk = person.email ? emailInPages(pages, person.email) : false;
    const phoneOk = person.phone ? phoneInPages(pages, person.phone) : false;
    if (!emailOk && !phoneOk) continue;
    contacts.push({
      ...person,
      email: emailOk ? person.email : "",
      phone: phoneOk ? person.phone : "",
      type: contactType(person.type, pages),
    });
  }

  const address = text(draft.address || draft.adresse);
  const website = citedWebsite(safeWebsite(text(draft.website || draft.site)), pages);
  const phone = text(draft.phone || draft.telephone);
  const country = text(draft.country || draft.pays);
  const fields: HotelResearchFields = {
    description: frenchDescription(text(draft.description), pages, draft.preuves),
    address: address.length >= 8 && pageHas(pages, address) ? address.slice(0, 240) : "",
    website,
    phone: phone && phoneInPages(pages, phone) ? phone.slice(0, 40) : "",
    city: city && (!input.city || hotelCitiesCompatible(input.city, city)) && pageHas(pages, city) ? city.slice(0, 80) : "",
    country: country && pageHas(pages, country) ? country.slice(0, 80) : "",
    contacts,
    photos: orderedPhotos(draft.photos, pages),
  };
  const filled =
    fields.description ||
    fields.address ||
    fields.website ||
    fields.phone ||
    fields.contacts.length ||
    fields.photos.length;
  if (!filled) return { outcome: "vide" };
  return { outcome: "prete", fields };
}

/** Complète les champs vides. Une saisie de l’agence reste. */
export function mergeHotelResearch(
  details: Record<string, unknown>,
  fields: HotelResearchFields | null,
  status: "prete" | "vide"
) {
  const next: Record<string, unknown> = { ...details, hotel_research: status };
  delete next.hotel_research_at;
  delete next.hotel_research_attempts;
  if (status !== "prete" || !fields) return next;
  if (!peopleFromDetails(next).length && fields.contacts.length) next.hotel_contacts = fields.contacts;
  if (!storedHotelPhotos(next).length && fields.photos.length) {
    next.photos = fields.photos.map(
      (photo): HotelPhoto => ({
        url: photo.url,
        thumb: photo.url,
        caption: photo.caption,
        kind: "hotel",
      })
    );
  }
  if (!frenchClientProse(text(next.description)) && fields.description) next.description = fields.description;
  if (!text(next.address) && fields.address) next.address = fields.address;
  if (!text(next.website) && fields.website) next.website = fields.website;
  if (!text(next.phone) && fields.phone) next.phone = fields.phone;
  if (!text(next.city) && fields.city) next.city = fields.city;
  if (!text(next.country) && fields.country) next.country = fields.country;
  return next;
}

export function researchItemName(item: HotelResearchItem) {
  return hotelDisplayName(asItem(item));
}

export function researchItemCity(item: HotelResearchItem) {
  return hotelCityLine(asItem(item));
}
