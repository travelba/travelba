import { ETA_IL_PORTAL } from "./eta-il-draft";
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

/**
 * Libellé (40) et objet (200). L’hôtel prime. La désignation s’ajoute
 * si elle tient encore ; sinon elle reste dans l’objet.
 */
export function pliantStayCaption(input: {
  client?: string | null;
  hotels?: Array<string | null | undefined>;
  designation?: string | null;
  reference?: string | null;
}) {
  const hotelPlace = pliantCardPlace({ hotels: input.hotels });
  const fullPlace = pliantCardPlace({ hotels: input.hotels, designation: input.designation });
  const full = pliantCardCaption({ client: input.client, place: fullPlace, reference: input.reference });
  const shown = pliantCardCaption({
    client: input.client,
    place: hotelPlace || input.designation,
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
      maxTransactionCount: count,
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

/** Carte virtuelle sans la liste de commerçants du produit voyage. */
export function pickTravelConfig(
  preferred: string,
  configs: { cardConfig?: string | null; canBeIssued?: boolean | null; type?: string | null }[]
) {
  const open = configs.filter(
    (row) => row.canBeIssued !== false && row.cardConfig && !/TRAVEL/i.test(row.cardConfig)
  );
  const virtual = open.filter((row) => row.type === "VIRTUAL" || /VIRTUAL/i.test(row.cardConfig || ""));
  if (preferred && virtual.some((row) => row.cardConfig === preferred)) return preferred;
  return virtual.find((row) => row.cardConfig === "PLIANT_VIRTUAL")?.cardConfig || virtual[0]?.cardConfig || null;
}
