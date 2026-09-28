import { ETA_IL_PORTAL } from "./eta-il-draft";
import {
  centsToEur,
  corridorCeilingCents,
  ECB_SNAPSHOT,
  VISA_OFFICIAL,
  type EurFx,
} from "./visa-fees";

/** Frais publiés sur israel-entry.piba.gov.il : 25 ILS par demande. */
export const ETA_IL_FEE_ILS = VISA_OFFICIAL.IL.amount;

const NAME_CHARS = /[^A-Za-z0-9äöüÄÖÜ.\-]+/g;
const LABEL_MAX = 40;
const NAME_MAX = 50;

export function pliantCardName(value: string) {
  return value.replace(NAME_CHARS, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, NAME_MAX);
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
  supabase: { from: (table: string) => any },
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
      cardConfig: input.cardConfig || "PLIANT_VIRTUAL_TRAVEL",
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

/** Message court pour le journal. Pas de corps brut : il peut contenir des identifiants. */
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
