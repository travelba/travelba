import { detailStr, hotelCityLine, hotelDisplayName } from "./carnet";
import type { CrmBookingItem } from "./types";

const SKIP_URL =
  /little-?emperors|expedia|travelba|facebook\.com|instagram\.com|twitter\.com|wa\.me|whatsapp|google\.[^/\s]+\/maps|maps\.google|g\.page|unsubscribe|mailto:/i;

const SKIP_EMAIL = /little-?emperors|expedia|travelba|taap/i;

export type HotelContact = {
  name: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  website: string;
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

/** Coordonnées déjà sur la fiche. Un champ vide reste vide. */
export function hotelContact(item: CrmBookingItem): HotelContact {
  return {
    name: hotelDisplayName(item),
    address: detailStr(item, "address") || ownString(nestedHotel(item), "address"),
    city: hotelCityLine(item),
    phone: firstUsable(item, PHONE_KEYS, usablePhone),
    email: firstUsable(item, EMAIL_KEYS, usableEmail),
    website: firstUsable(item, ["website"], safeWebsite),
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

function withContact(item: CrmBookingItem, extra: { website?: string; phone?: string; email?: string; hotelId?: number | null }) {
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
  if (extra.hotelId != null && leHotelIdFromItem(item) == null) {
    details.le_hotel_id = extra.hotelId;
    changed = true;
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

function fromContactList(value: unknown, key: "phone" | "email") {
  if (!Array.isArray(value)) return "";
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const raw = text((entry as Record<string, unknown>)[key]);
    const clean = key === "phone" ? usablePhone(raw) : usableEmail(raw);
    if (clean) return clean;
  }
  return "";
}

/** Détail hôtel Little Emperors : le site s’il est renvoyé. Téléphone et e-mail seulement s’ils sont renseignés. */
export function contactsFromLeHotelPayload(payload: unknown) {
  const row = unwrapHotelPayload(payload);
  const email =
    EMAIL_KEYS.map((key) => usableEmail(text(row[key]))).find(Boolean) ||
    fromContactList(row.contact_details, "email");
  const phone =
    PHONE_KEYS.map((key) => usablePhone(text(row[key]))).find(Boolean) ||
    fromContactList(row.contact_details, "phone");
  return {
    website: safeWebsite(text(row.website)),
    phone,
    email,
  };
}

const PUBLIC_HOTEL = "https://api.littleemperors.com/api/hotels";

/** Complète les fiches dont l’identifiant hôtel est déjà connu. Échec réseau : la fiche reste telle quelle. */
export async function fillLeHotelDetails(items: CrmBookingItem[], fetchImpl?: typeof fetch) {
  const fetchFn = fetchImpl || fetch;
  const ids = [
    ...new Set(
      items
        .filter((item) => item.kind === "hotel" && !hotelContact(item).website)
        .map(leHotelIdFromItem)
        .filter((id): id is number => id != null)
    ),
  ];
  const found = new Map<number, ReturnType<typeof contactsFromLeHotelPayload>>();
  await Promise.all(
    ids.map(async (id) => {
      try {
        const response = await fetchFn(`${PUBLIC_HOTEL}/${id}`, {
          headers: { Accept: "application/json", "App-Version": "Website" },
          signal: AbortSignal.timeout(4000),
        });
        if (!response.ok) return;
        found.set(id, contactsFromLeHotelPayload(await response.json()));
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
    return withContact(item, extra);
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
