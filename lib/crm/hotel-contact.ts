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

/** Coordonnées réellement présentes. Little Emperors : pas de téléphone ni d’e-mail. */
export function hotelContact(item: CrmBookingItem): HotelContact {
  const little = isLittleEmperorsHotel(item);
  return {
    name: hotelDisplayName(item),
    address: detailStr(item, "address"),
    city: hotelCityLine(item),
    phone: little ? "" : detailStr(item, "phone"),
    email: little ? "" : detailStr(item, "email"),
    website: safeWebsite(detailStr(item, "website")),
  };
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
