import { detailStr, hotelCityLine, hotelDisplayName } from "./carnet";
import type { CrmBookingItem } from "./types";

const SKIP_URL =
  /little-?emperors|expedia|travelba|facebook\.com|instagram\.com|twitter\.com|wa\.me|whatsapp|google\.[^/\s]+\/maps|maps\.google|g\.page|unsubscribe|mailto:/i;

const SKIP_EMAIL = /little-?emperors|expedia|travelba|taap/i;

export type HotelPersonContact = {
  type: string;
  last_name: string;
  first_name: string;
  email: string;
  phone: string;
};

export type HotelContact = {
  name: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  people: HotelPersonContact[];
};

export type LeHotelCatalog = {
  hotel_id: number | null;
  hotel_name: string;
  city: string;
  country: string;
  website: string;
  phone: string;
  email: string;
  contacts: HotelPersonContact[];
};

export function safeWebsite(value: string | null | undefined) {
  const trimmed = (value || "").trim();
  if (!trimmed || SKIP_URL.test(trimmed)) return "";
  const withScheme = /^www\./i.test(trimmed) ? `https://${trimmed}` : trimmed;
  if (!/^https?:\/\//i.test(withScheme)) return "";
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    if (SKIP_URL.test(url.href)) return "";
    return url.href;
  } catch {
    return "";
  }
}

function cleanUrl(raw: string) {
  return safeWebsite(raw.replace(/[),.;]+$/g, ""));
}

/** Site écrit sur la confirmation. Pas le site du fournisseur. */
export function extractHotelWebsite(text: string) {
  const labeled = text.match(
    /(?:Website|Web\s*site|Site(?:\s+web)?|Internet)\s*[:.]?\s*(https?:\/\/[^\s<>"]+|www\.[^\s<>"]+)/i
  );
  if (labeled?.[1]) return cleanUrl(labeled[1]);
  const urls = text.match(/https?:\/\/[^\s<>"]+/gi) || [];
  for (const url of urls) {
    const clean = cleanUrl(url);
    if (clean) return clean;
  }
  return null;
}

/** Téléphone seulement s’il est libellé. Jamais inventé. */
export function extractHotelPhone(text: string) {
  const match = text.match(
    /(?:\bPhone\b|\bTelephone\b|\bTéléphone\b|\bTel\b|\bTél\.?)\s*[:.]?\s*(\+?[0-9][0-9() .\-]{6,})/i
  );
  const value = match?.[1]?.replace(/\s+/g, " ").trim() || "";
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8) return null;
  return value;
}

/** E-mail de l’hôtel seulement s’il est libellé. Jamais l’adresse du fournisseur. */
export function extractHotelEmail(text: string) {
  const match = text.match(
    /(?:\bE-?mail\b|\bCourriel\b)\s*[:.]?\s*([A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,})/i
  );
  const value = match?.[1]?.trim() || "";
  if (!value || SKIP_EMAIL.test(value)) return null;
  return value;
}

export function isLittleEmperorsHotel(item: Pick<CrmBookingItem, "supplier" | "details">) {
  if (detailStr(item as CrmBookingItem, "source_family") === "little_emperors") return true;
  return /little emperors/i.test(item.supplier || "");
}

const PHONE_KEYS = ["phone", "telephone", "phone_number"] as const;
const EMAIL_KEYS = [
  "email",
  "reservations_email",
  "hotel_contact_email",
  "concierge_email",
  "enquiries_email",
] as const;

function nestedHotel(item: CrmBookingItem) {
  const hotel = item.details?.hotel;
  if (!hotel || typeof hotel !== "object" || Array.isArray(hotel)) return null;
  return hotel as Record<string, unknown>;
}

function ownString(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function firstUsable(item: CrmBookingItem, keys: readonly string[], clean: (value: string) => string) {
  const records = [item.details || null, nestedHotel(item)];
  for (const record of records) {
    if (!record) continue;
    for (const key of keys) {
      const value = clean(ownString(record, key));
      if (value) return value;
    }
  }
  return "";
}

function usablePhone(value: string) {
  const trimmed = value.replace(/\s+/g, " ").trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 8) return "";
  return trimmed;
}

function usableEmail(value: string) {
  const trimmed = value.trim();
  if (!/^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$/i.test(trimmed)) return "";
  if (SKIP_EMAIL.test(trimmed)) return "";
  return trimmed;
}

function richerPerson(current: HotelPersonContact, incoming: HotelPersonContact) {
  const score = (row: HotelPersonContact) =>
    Number(Boolean(row.last_name)) + Number(Boolean(row.first_name)) + Number(Boolean(row.type)) + Number(Boolean(row.phone));
  return score(incoming) > score(current) ? incoming : current;
}

export function dedupePeople(people: HotelPersonContact[]) {
  const byEmailType = new Map<string, HotelPersonContact>();
  for (const person of people) {
    const typed = `${person.email.toLowerCase()}|${person.type.toLowerCase()}`;
    const current = byEmailType.get(typed);
    byEmailType.set(typed, current ? richerPerson(current, person) : person);
  }
  const collapsed = [...byEmailType.values()];
  return collapsed.filter((row) => {
    if (row.type || !row.email) return true;
    return !collapsed.some(
      (other) => other !== row && other.email.toLowerCase() === row.email.toLowerCase() && other.type
    );
  });
}

function splitPersonName(full: string, first = "", last = "") {
  if (first || last) return { first_name: first, last_name: last };
  const trimmed = full.trim();
  if (!trimmed) return { first_name: "", last_name: "" };
  if (trimmed.includes(",")) {
    const [surname, given] = trimmed.split(",").map((part) => part.trim());
    return { first_name: given || "", last_name: surname || "" };
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { first_name: "", last_name: parts[0] };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

export function normalizePerson(value: unknown): HotelPersonContact | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const type = text(row.type || row.role || row.department || row.title || row.contact_type);
  const email = usableEmail(text(row.email));
  const phone = usablePhone(text(row.phone || row.telephone || row.phone_number));
  const names = splitPersonName(
    text(row.name || row.full_name || row.contact_name),
    text(row.first_name || row.prenom || row.firstName),
    text(row.last_name || row.nom || row.lastName || row.surname)
  );
  if (!type && !email && !phone && !names.first_name && !names.last_name) return null;
  if (!email && !phone && !names.first_name && !names.last_name) return null;
  return {
    type,
    last_name: names.last_name,
    first_name: names.first_name,
    email,
    phone,
  };
}

function cityCountry(location: string, cityHint = "") {
  const parts = location
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return {
      city: cityHint || parts.slice(0, -1).join(", "),
      country: parts[parts.length - 1],
    };
  }
  return { city: cityHint || location, country: "" };
}

export function peopleFromDetails(details: Record<string, unknown> | null | undefined): HotelPersonContact[] {
  const raw = details?.hotel_contacts;
  if (!Array.isArray(raw)) return [];
  const people: HotelPersonContact[] = [];
  for (const entry of raw) {
    const person = normalizePerson(entry);
    if (person) people.push(person);
  }
  return dedupePeople(people);
}

/** Coordonnées déjà sur la fiche. Un champ vide reste vide. */
export function hotelContact(item: CrmBookingItem): HotelContact {
  const people = peopleFromDetails(item.details);
  const email = firstUsable(item, EMAIL_KEYS, usableEmail) || people.find((row) => row.email)?.email || "";
  const phone = firstUsable(item, PHONE_KEYS, usablePhone) || people.find((row) => row.phone)?.phone || "";
  return {
    name: hotelDisplayName(item),
    address: detailStr(item, "address") || ownString(nestedHotel(item), "address"),
    city: hotelCityLine(item),
    country: detailStr(item, "country") || ownString(nestedHotel(item), "country"),
    phone,
    email,
    website: firstUsable(item, ["website"], safeWebsite),
    people,
  };
}

export function leHotelIdFromItem(item: Pick<CrmBookingItem, "details">) {
  for (const key of ["le_hotel_id", "little_emperors_hotel_id", "hotel_id"] as const) {
    const value = item.details?.[key];
    if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
    if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  }
  return null;
}

export type StoredHotelSource = {
  hotel_id: number | null;
  hotel_name: string | null;
  website: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  country?: string | null;
  contacts?: HotelPersonContact[];
};

function foldName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sourceMatches(item: CrmBookingItem, row: StoredHotelSource) {
  const id = leHotelIdFromItem(item);
  if (id != null && row.hotel_id != null && id === row.hotel_id) return true;
  const left = foldName(hotelDisplayName(item));
  const right = foldName(row.hotel_name || "");
  return Boolean(left && right && left === right);
}

function withContact(
  item: CrmBookingItem,
  extra: {
    website?: string;
    phone?: string;
    email?: string;
    hotelId?: number | null;
    city?: string;
    country?: string;
    hotelName?: string;
    people?: HotelPersonContact[];
  }
) {
  const current = hotelContact(item);
  const details = { ...(item.details || {}) };
  let changed = false;
  if (!current.website && extra.website) {
    details.website = extra.website;
    changed = true;
  }
  if (!current.phone && extra.phone) {
    details.phone = extra.phone;
    changed = true;
  }
  if (!current.email && extra.email) {
    details.email = extra.email;
    changed = true;
  }
  if (!current.city && extra.city) {
    details.city = extra.city;
    changed = true;
  }
  if (!current.country && extra.country) {
    details.country = extra.country;
    changed = true;
  }
  if (!hotelDisplayName(item) && extra.hotelName) {
    details.hotel_name = extra.hotelName;
    changed = true;
  }
  if (extra.hotelId != null && leHotelIdFromItem(item) == null) {
    details.le_hotel_id = extra.hotelId;
    changed = true;
  }
  if ((current.people.length === 0 || extra.people?.length) && extra.people?.length) {
    const next = dedupePeople(extra.people);
    if (JSON.stringify(current.people) !== JSON.stringify(next)) {
      details.hotel_contacts = next;
      changed = true;
    }
  }
  return changed ? { ...item, details } : item;
}

/** Complète la fiche avec une source déjà stockée. Ne remplace rien, n’invente rien. */
export function applyStoredHotelSources(items: CrmBookingItem[], rows: StoredHotelSource[]) {
  return items.map((item) => {
    if (item.kind !== "hotel") return item;
    const matches = rows.filter((row) => sourceMatches(item, row));
    if (matches.length !== 1) return item;
    const row = matches[0];
    return withContact(item, {
      website: safeWebsite(row.website),
      phone: usablePhone(row.phone || ""),
      email: usableEmail(row.email || ""),
      hotelId: row.hotel_id,
      city: (row.city || "").trim(),
      country: (row.country || "").trim(),
      hotelName: (row.hotel_name || "").trim(),
      people: row.contacts,
    });
  });
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function unwrapHotelPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {} as Record<string, unknown>;
  const row = payload as Record<string, unknown>;
  const data = row.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const nested = data as Record<string, unknown>;
    if ("website" in nested || "name" in nested) return nested;
  }
  return row;
}

const LABELED_EMAILS: { key: string; type: string }[] = [
  { key: "reservations_email", type: "Reservations" },
  { key: "reservation_email", type: "Reservations" },
  { key: "concierge_email", type: "Concierge" },
  { key: "hotel_contact_email", type: "Hotel contact" },
  { key: "enquiries_email", type: "Enquiries" },
];

function peopleFromUnknownList(value: unknown, fallbackType = ""): HotelPersonContact[] {
  if (!Array.isArray(value)) return [];
  const people: HotelPersonContact[] = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      const email = usableEmail(entry);
      if (email) people.push({ type: fallbackType, last_name: "", first_name: "", email, phone: "" });
      continue;
    }
    const person = normalizePerson(entry);
    if (!person) continue;
    people.push(person.type ? person : { ...person, type: fallbackType });
  }
  return people;
}

function peopleFromSections(value: unknown): HotelPersonContact[] {
  if (!Array.isArray(value)) return [];
  const people: HotelPersonContact[] = [];
  for (const section of value) {
    if (!section || typeof section !== "object") continue;
    const row = section as Record<string, unknown>;
    const type = text(row.title || row.type || row.name || row.label);
    const nested = row.contacts || row.contact_details || row.people || row.emails || row.items;
    if (Array.isArray(nested)) {
      people.push(...peopleFromUnknownList(nested, type));
      continue;
    }
    const person = normalizePerson(row);
    if (person) people.push(person.type ? person : { ...person, type });
  }
  return people;
}

function integerId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

/** Catalogue public Little Emperors : nom, ville, pays et contacts typés s’ils sont renvoyés. */
export function hotelCatalogFromLePayload(payload: unknown): LeHotelCatalog {
  const row = unwrapHotelPayload(payload);
  const place = cityCountry(text(row.location), text(row.city));
  const people = dedupePeople([
    ...peopleFromUnknownList(row.contact_details),
    ...peopleFromUnknownList(row.rate_type_contact_details),
    ...peopleFromSections(row.hotel_contact_sections),
    ...peopleFromUnknownList(row.hotel_group_contact_emails),
    ...LABELED_EMAILS.flatMap(({ key, type }) => {
      const email = usableEmail(text(row[key]));
      const name = key === "enquiries_email" ? splitPersonName(text(row.enquiries_name)) : { first_name: "", last_name: "" };
      return email
        ? [{ type, last_name: name.last_name, first_name: name.first_name, email, phone: "" }]
        : [];
    }),
  ]);
  const email =
    EMAIL_KEYS.map((key) => usableEmail(text(row[key]))).find(Boolean) ||
    people.find((person) => person.email)?.email ||
    "";
  const phone =
    PHONE_KEYS.map((key) => usablePhone(text(row[key]))).find(Boolean) ||
    people.find((person) => person.phone)?.phone ||
    "";
  return {
    hotel_id: integerId(row.id),
    hotel_name: text(row.name),
    city: place.city,
    country: place.country,
    website: safeWebsite(text(row.website)),
    phone,
    email,
    contacts: people,
  };
}

/** Détail hôtel Little Emperors : le site s’il est renvoyé. Téléphone et e-mail seulement s’ils sont renseignés. */
export function contactsFromLeHotelPayload(payload: unknown) {
  const catalog = hotelCatalogFromLePayload(payload);
  return {
    website: catalog.website,
    phone: catalog.phone,
    email: catalog.email,
    people: catalog.contacts,
    city: catalog.city,
    country: catalog.country,
    hotelName: catalog.hotel_name,
    hotelId: catalog.hotel_id,
  };
}

export type HotelContactRow = {
  le_hotel_id: number;
  hotel_name: string | null;
  city: string | null;
  country: string | null;
  contact_type: string | null;
  last_name: string | null;
  first_name: string | null;
  email: string | null;
  phone: string | null;
  source: string;
};

export function rowsFromHotelCatalog(catalog: LeHotelCatalog): HotelContactRow[] {
  if (catalog.hotel_id == null) return [];
  return catalog.contacts.map((person) => ({
    le_hotel_id: catalog.hotel_id as number,
    hotel_name: catalog.hotel_name || null,
    city: catalog.city || null,
    country: catalog.country || null,
    contact_type: person.type || null,
    last_name: person.last_name || null,
    first_name: person.first_name || null,
    email: person.email || null,
    phone: person.phone || null,
    source: "little_emperors",
  }));
}

export function peopleFromContactRows(rows: HotelContactRow[]): HotelPersonContact[] {
  return rows.map((row) => ({
    type: row.contact_type || "",
    last_name: row.last_name || "",
    first_name: row.first_name || "",
    email: row.email || "",
    phone: row.phone || "",
  }));
}

export const LE_PUBLIC_HOTEL = "https://api.littleemperors.com/api/hotels";

export async function fetchLePublicHotel(hotelId: number, fetchImpl?: typeof fetch) {
  const fetchFn = fetchImpl || fetch;
  const response = await fetchFn(`${LE_PUBLIC_HOTEL}/${hotelId}`, {
    headers: { Accept: "application/json", "App-Version": "Website" },
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) return null;
  return hotelCatalogFromLePayload(await response.json());
}

/** Complète les fiches dont l’identifiant hôtel est déjà connu. Échec réseau : la fiche reste telle quelle. */
export async function fillLeHotelDetails(items: CrmBookingItem[], fetchImpl?: typeof fetch) {
  const ids = [
    ...new Set(
      items
        .filter((item) => item.kind === "hotel" && !hotelContact(item).website)
        .map(leHotelIdFromItem)
        .filter((id): id is number => id != null)
    ),
  ];
  const found = new Map<number, LeHotelCatalog>();
  await Promise.all(
    ids.map(async (id) => {
      try {
        const catalog = await fetchLePublicHotel(id, fetchImpl);
        if (catalog) found.set(id, catalog);
      } catch {
        return;
      }
    })
  );
  if (!found.size) return items;
  return items.map((item) => {
    const id = leHotelIdFromItem(item);
    const extra = id != null ? found.get(id) : undefined;
    if (!extra) return item;
    return withContact(item, {
      website: extra.website,
      phone: extra.phone,
      email: extra.email,
      hotelId: extra.hotel_id,
      city: extra.city,
      country: extra.country,
      hotelName: extra.hotel_name,
      people: extra.contacts,
    });
  });
}

type HotelItem = {
  kind?: string | null;
  supplier?: string | null;
  details?: Record<string, unknown> | null;
};

/** Une confirmation Little Emperors ne porte ni téléphone ni e-mail d’hôtel. */
export function clearLittleEmperorsContacts<T extends HotelItem>(items: T[]): T[] {
  return items.map((item) => {
    if (item.kind !== "hotel") return item;
    const details = { ...(item.details || {}) };
    details.phone = null;
    details.email = null;
    details.source_family = "little_emperors";
    return { ...item, supplier: item.supplier || "Little Emperors", details };
  });
}
