import { ETA_IL_PORTAL } from "./eta-il-draft";
import { DEFAULT_PLIANT_TRANSACTIONS, PLIANT_SINGLE_USE, pliantConfigIsSingleUse } from "./pliant-controls";
import {
  centsToEur,
  corridorCeilingCents,
  ECB_SNAPSHOT,
  VISA_OFFICIAL,
  type EurFx,
} from "./visa-fees";
import type { Db } from "../supabase/db";

/** Frais publiés sur israel-entry.piba.gov.il : 25 ILS par demande. */
export const ETA_IL_FEE_ILS = VISA_OFFICIAL.IL.amount;

const NAME_CHARS = /[^A-Za-z0-9äöüÄÖÜ.\-]+/g;
const LABEL_MAX = 40;
const PURPOSE_MAX = 200;
const NAME_MAX = 50;
const CAPTION_SEP = " – ";

/** Lettres latines sans accent. `Andréa` devient `Andrea`, pas `Andr-a`. */
function pliantFold(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ß/g, "ss")
    .replace(/ẞ/g, "SS")
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "OE")
    .replace(/æ/g, "ae")
    .replace(/Æ/g, "AE")
    .replace(/ø/gi, "o")
    .replace(/ł/gi, "l")
    .replace(/đ/gi, "d");
}

export function pliantCardName(value: string) {
  return pliantFold(value).replace(NAME_CHARS, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, NAME_MAX);
}

/** Texte du libellé Pliant : lettres, espaces, sans le jeu strict du titulaire. */
export function pliantReadable(value: string) {
  return pliantFold(value)
    .replace(/[^\p{L}\p{N} .'’&·-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fitPliantCaption(parts: string[], max: number) {
  const full = parts.join(CAPTION_SEP);
  if (full.length <= max) return full;
  if (parts.length === 1) return parts[0].slice(0, max);
  const reference = parts.length >= 3 ? parts[parts.length - 1] : "";
  const client = parts[0];
  const place = (parts.length >= 3 ? parts.slice(1, -1) : parts.slice(1)).join(CAPTION_SEP);
  if (reference) {
    const tail = `${CAPTION_SEP}${reference}`;
    const room = max - client.length - CAPTION_SEP.length - tail.length;
    if (room >= 1) {
      const cut = place.slice(0, room).replace(/[\s–-]+$/u, "");
      if (cut) return `${client}${CAPTION_SEP}${cut}${tail}`.slice(0, max);
    }
    const two = `${client}${CAPTION_SEP}${reference}`;
    if (two.length <= max) return two;
    const roomClient = max - tail.length;
    if (roomClient >= 1) {
      const cut = client.slice(0, roomClient).replace(/[\s–-]+$/u, "");
      if (cut) return `${cut}${tail}`.slice(0, max);
    }
    return reference.slice(0, max);
  }
  const room = max - client.length - CAPTION_SEP.length;
  if (room >= 1) {
    const cut = place.slice(0, room).replace(/[\s–-]+$/u, "");
    if (cut) return `${client}${CAPTION_SEP}${cut}`.slice(0, max);
  }
  return client.slice(0, max);
}

/**
 * Nom vu dans Pliant : client, hôtel ou fournisseur, référence.
 * `label` tient en 40 caractères, `purpose` en 200. Ce n’est pas le titulaire.
 */
export function pliantCardCaption(input: { client?: string | null; place?: string | null; reference?: string | null }) {
  const parts = [input.client, input.place, input.reference].map((part) => pliantReadable(part || "")).filter(Boolean);
  if (!parts.length) return null;
  return {
    label: fitPliantCaption(parts, LABEL_MAX),
    purpose: fitPliantCaption(parts, PURPOSE_MAX),
  };
}

function pliantKey(value: string | null | undefined) {
  return pliantReadable(value || "").toLowerCase();
}

const CAPTION_PART = /\s+(?:–|—|-)\s+/u;

function sharedLeadingWords(hotelKey: string, needle: string) {
  const hotelWords = hotelKey.split(" ").filter(Boolean);
  const nameWords = needle.split(" ").filter(Boolean);
  const shared: string[] = [];
  for (let i = 0; i < hotelWords.length && i < nameWords.length; i += 1) {
    if (hotelWords[i] !== nameWords[i]) break;
    shared.push(hotelWords[i]);
  }
  return shared.join(" ");
}

/** Le nom cite cet hôtel : le nom d’hôtel est dedans, ou c’est le début d’un nom plus long. */
function hotelCited(hotelKey: string, designation: string | null | undefined) {
  const needle = pliantKey(designation);
  if (!hotelKey || !needle) return false;
  if (needle.includes(hotelKey)) return true;
  if (needle.length >= 4 && hotelKey.includes(needle)) return true;
  if (sharedLeadingWords(hotelKey, needle).length >= 8) return true;
  const parts = (designation || "")
    .split(CAPTION_PART)
    .map((part) => pliantKey(part))
    .filter((key) => key.length >= 4 && key !== needle);
  return parts.some(
    (part) => hotelKey.includes(part) || part.includes(hotelKey) || sharedLeadingWords(hotelKey, part).length >= 8
  );
}

/**
 * Un nom saisi ne garde que les hôtels qu’il cite (sans accent, en minuscules).
 * Aucun nom, ou aucun hôtel dedans : on garde tous les hôtels.
 */
function hotelsNamedInDesignation(
  hotels: Array<string | null | undefined> | undefined,
  designation: string | null | undefined
) {
  const list = (hotels || []).map((hotel) => (hotel || "").trim()).filter(Boolean);
  if (!pliantKey(designation)) return { hotels: list, cited: false };
  const matched = list.filter((hotel) => hotelCited(pliantKey(hotel), designation));
  if (!matched.length) return { hotels: list, cited: false };
  return { hotels: matched, cited: true };
}

/** Morceau du nom d’hôtel qui correspond au nom saisi, avec la casse de la fiche. */
function hotelNameSlice(hotel: string, key: string) {
  const readable = pliantReadable(hotel);
  const folded = readable.toLowerCase();
  const at = folded.indexOf(key);
  if (at >= 0) return readable.slice(at, at + key.length).trim();
  const shared = sharedLeadingWords(folded, key);
  if (shared.length >= 8) return readable.slice(0, shared.length).trim();
  return "";
}

/** Le nom saisi est plus court que la fiche hôtel : ce morceau tient dans le libellé. */
function citedBrief(hotels: string[], middle: string) {
  const key = pliantKey(middle);
  if (key.length < 4 || !hotels.length) return "";
  const slices = hotels.map((hotel) => hotelNameSlice(hotel, key)).filter(Boolean);
  if (slices.length !== hotels.length) return "";
  return slices[0];
}

/**
 * « Client – Hôtel – Réf » est déjà le libellé. On ne garde que le milieu,
 * pour ne pas recoller le client et la référence.
 */
function designationPlace(
  designation: string | null | undefined,
  client: string | null | undefined,
  reference: string | null | undefined
) {
  const named = (designation || "").trim();
  if (!named) return "";
  const head = pliantKey(client);
  const tail = pliantKey(reference);
  const parts = named.split(CAPTION_PART).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 3 || !head || !tail) return named;
  if (pliantKey(parts[0]) !== head || pliantKey(parts[parts.length - 1]) !== tail) return named;
  return parts.slice(1, -1).join(" · ");
}

/**
 * Libellé (40) et objet (200). L’hôtel prime. La désignation s’ajoute
 * si elle tient encore ; sinon elle reste dans l’objet.
 * Un nom qui cite un hôtel ne garde que celui-là.
 */
export function pliantStayCaption(input: {
  client?: string | null;
  hotels?: Array<string | null | undefined>;
  designation?: string | null;
  reference?: string | null;
}) {
  const selected = hotelsNamedInDesignation(input.hotels, input.designation);
  const middle = designationPlace(input.designation, input.client, input.reference);
  const brief = selected.cited ? citedBrief(selected.hotels, middle) : "";
  const hotels = brief ? [brief] : selected.hotels;
  const hotelPlace = pliantCardPlace({ hotels });
  const designation = middle && pliantKey(middle) !== pliantKey(hotelPlace) ? middle : "";
  const fullPlace = pliantCardPlace({ hotels, designation });
  const full = pliantCardCaption({ client: input.client, place: fullPlace, reference: input.reference });
  const shown = pliantCardCaption({
    client: input.client,
    place: hotelPlace || designation || input.designation,
    reference: input.reference,
  });
  const label = full && full.label === full.purpose ? full.label : shown?.label || full?.label || "";
  const purpose = full?.purpose || shown?.purpose || label;
  if (!label && !purpose) return null;
  return { label, purpose };
}

/** Hôtel d’abord, puis la désignation si elle dit autre chose. Sans doublon. */
export function pliantCardPlace(input: { hotels?: Array<string | null | undefined>; designation?: string | null }) {
  const seen = new Set<string>();
  const parts: string[] = [];
  const add = (value: string | null | undefined) => {
    const text = (value || "").trim();
    const key = pliantReadable(text).toLowerCase();
    if (!text || !key || seen.has(key)) return;
    seen.add(key);
    parts.push(text);
  };
  for (const hotel of input.hotels || []) add(hotel);
  add(input.designation);
  return parts.join(" · ");
}

/** Désignation interne Pliant (`label`, 40 caractères). Vide si rien n’est saisi. */
export function pliantDesignation(value: string | null | undefined) {
  const text = (value || "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.slice(0, LABEL_MAX);
}

function cardOrdinal(existingCards: number | undefined) {
  return Math.max(0, Math.floor(Number(existingCards)) || 0) + 1;
}

/** Garde le suffixe même si le nom doit être raccourci pour tenir dans `max`. */
export function fitPliantText(base: string, suffix: string, max: number) {
  const head = base.trim();
  if (head.length + suffix.length <= max) return `${head}${suffix}`;
  if (suffix.length >= max) return suffix.slice(suffix.length - max);
  const room = max - suffix.length;
  const sliced = head.slice(0, room).replace(/[-\s]+$/g, "");
  return `${sliced || head.slice(0, room)}${suffix}`;
}

export function pliantCardNomination(input: { firstName: string; lastName: string; existingCards?: number }) {
  const first = pliantCardName(input.firstName) || "Client";
  const last = pliantCardName(input.lastName) || "Travelba";
  const ordinal = cardOrdinal(input.existingCards);
  const numbered = ordinal > 1;
  const customFirstName = first;
  const customLastName = numbered ? fitPliantText(last, `-${ordinal}`, NAME_MAX) : last;
  const label = numbered ? fitPliantText(`${first} ${last}`, ` ${ordinal}`, LABEL_MAX) : `${first} ${last}`.slice(0, LABEL_MAX);
  return { customFirstName, customLastName, label };
}

export async function customerPliantCardCount(
  supabase: Db,
  customerId: string,
) {
  const { data: bookings } = await supabase.from("crm_bookings").select("id").eq("customer_id", customerId);
  const ids = ((bookings || []) as { id?: string }[]).map((row) => row.id).filter((id): id is string => Boolean(id));
  if (!ids.length) return 0;
  const { data: cards } = await supabase.from("crm_visa_cards").select("pliant_card_id").in("booking_id", ids);
  return ((cards || []) as { pliant_card_id?: string | null }[]).filter(
    (row) => typeof row.pliant_card_id === "string" && row.pliant_card_id.trim().length > 0,
  ).length;
}

export function etaIlPliantCard(input: {
  firstName: string;
  lastName: string;
  travelerCount: number;
  bookingReference: string;
  rates?: EurFx;
  organizationId: string;
  cardConfig?: string;
  today?: string;
  startDate?: string | null;
  endDate?: string | null;
  existingCards?: number;
}) {
  const count = Math.max(1, Math.floor(Number(input.travelerCount)) || 1);
  const rates = input.rates || ECB_SNAPSHOT.rates;
  const cents = corridorCeilingCents("IL", count, rates) || 0;
  const money = { value: cents, currency: "EUR" };
  const name = pliantCardNomination({
    firstName: input.firstName,
    lastName: input.lastName,
    existingCards: input.existingCards,
  });
  const today = input.today || new Date().toISOString().slice(0, 10);
  const validFrom = today;
  const validTo = input.endDate && input.endDate >= validFrom ? input.endDate : validFrom;
  return {
    holderFirstName: name.customFirstName,
    holderLastName: name.customLastName,
    feeIls: count * ETA_IL_FEE_ILS,
    ceilingEur: centsToEur(cents),
    bookingReference: input.bookingReference,
    portal: ETA_IL_PORTAL,
    body: {
      organizationId: input.organizationId,
      cardConfig: input.cardConfig || "PLIANT_VIRTUAL",
      label: name.label,
      customFirstName: name.customFirstName,
      customLastName: name.customLastName,
      limit: money,
      transactionLimit: money,
      limitRenewFrequency: "TOTAL" as const,
      maxTransactionCount: Math.max(DEFAULT_PLIANT_TRANSACTIONS, count),
      validFrom,
      validTo,
      validTimezone: "Europe/Paris",
    },
  };
}

export function pliantRefusal(status: number, body: string) {
  let message = "";
  try {
    const json = JSON.parse(body) as { message?: unknown; error?: unknown; title?: unknown };
    const raw = [json.message, json.title, json.error].find((value) => typeof value === "string") as string | undefined;
    message = (raw || "").replace(/\s+/g, " ").trim();
  } catch {
    message = "";
  }
  const safe = message
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{20,}\b/gi, "•••")
    .replace(/(?:\d[ -]?){13,19}/g, "•••")
    .slice(0, 140);
  if (!safe || safe.includes("@")) return `Pliant a refusé la carte (${status}).`;
  return `Pliant a refusé la carte : ${safe}`;
}

/** Garde l’identifiant configuré s’il existe, sinon le seul identifiant renvoyé par Pliant. */
export function pickListedId(preferred: string, ids: string[]) {
  const clean = ids.filter((id) => id.trim());
  if (preferred && clean.includes(preferred)) return preferred;
  if (clean.length === 1) return clean[0];
  return null;
}

/**
 * Config émissible du compte, hors produit voyage.
 * Une demande à usage unique ne retombe pas sur `PLIANT_VIRTUAL`.
 * Une demande virtuelle (formalité) reste sur `PLIANT_VIRTUAL`.
 */
export function pickTravelConfig(
  preferred: string,
  configs: { cardConfig?: string | null; canBeIssued?: boolean | null; type?: string | null }[]
) {
  const open = configs.filter(
    (row) => row.canBeIssued !== false && row.cardConfig && !/TRAVEL/i.test(row.cardConfig)
  );
  if (pliantConfigIsSingleUse(preferred)) {
    const single = open.filter(
      (row) => row.type === "SINGLE_USE" || pliantConfigIsSingleUse(row.cardConfig || "")
    );
    if (preferred && single.some((row) => row.cardConfig === preferred)) return preferred;
    return single.find((row) => row.cardConfig === PLIANT_SINGLE_USE)?.cardConfig || single[0]?.cardConfig || null;
  }
  const virtual = open.filter((row) => row.type === "VIRTUAL" || /VIRTUAL/i.test(row.cardConfig || ""));
  if (preferred && virtual.some((row) => row.cardConfig === preferred)) return preferred;
  return virtual.find((row) => row.cardConfig === "PLIANT_VIRTUAL")?.cardConfig || virtual[0]?.cardConfig || null;
}
