import "server-only";

import { pliantCardNomination } from "./eta-il-fee";
import { addIsoDays, parisIsoDate } from "./hotel-arrival";
import {
  mergePliantCard,
  type PliantCardDraft,
  type PliantCardPatch,
  type PliantCardStatus,
  type PliantSpendLine,
} from "./pliant-cards";
import {
  issuePliantCard,
  lockPliantCard,
  pliantConfigured,
  readPliantCardFace,
  setPliantCardLimit,
  unlockPliantCard,
} from "./pliant";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = { from: (table: string) => any };

const CARD_COLUMNS =
  "pliant_card_id, customer_id, booking_id, label, last4, ceiling_cents, currency, status, limit_manual";

export async function rememberPliantCard(admin: Admin, incoming: PliantCardPatch) {
  try {
    const { data } = await admin
      .from("crm_pliant_cards")
      .select(CARD_COLUMNS)
      .eq("pliant_card_id", incoming.pliant_card_id)
      .maybeSingle();
    const row = mergePliantCard(asDraft(data), incoming);
    const { error } = await admin.from("crm_pliant_cards").upsert(
      {
        pliant_card_id: row.pliant_card_id,
        customer_id: row.customer_id,
        booking_id: row.booking_id,
        label: row.label || "",
        last4: row.last4,
        ceiling_cents: row.limit_cents,
        currency: row.currency,
        status: row.status,
        limit_manual: row.limit_manual,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "pliant_card_id" }
    );
    if (error) console.error("[pliant] carte", error.message);
  } catch (err) {
    console.error("[pliant] carte", err instanceof Error ? err.message : "échec");
  }
}

export async function pliantLimitIsManual(admin: Admin, cardId: string) {
  try {
    const { data } = await admin
      .from("crm_pliant_cards")
      .select("limit_manual")
      .eq("pliant_card_id", cardId)
      .maybeSingle();
    return Boolean((data as { limit_manual?: boolean } | null)?.limit_manual);
  } catch {
    return false;
  }
}

export async function manualPliantCardIds(admin: Admin, cardIds: string[]) {
  const ids = [...new Set(cardIds.filter(Boolean))];
  if (!ids.length) return new Set<string>();
  try {
    const { data } = await admin
      .from("crm_pliant_cards")
      .select("pliant_card_id")
      .in("pliant_card_id", ids)
      .eq("limit_manual", true);
    return new Set(
      ((data || []) as { pliant_card_id?: string }[])
        .map((row) => row.pliant_card_id || "")
        .filter(Boolean)
    );
  } catch {
    return new Set<string>();
  }
}

export async function setRememberedCardLimit(
  admin: Admin,
  cardId: string,
  limit: { value: number; currency: string },
  count: number,
  manual: boolean
) {
  if (manual) return;
  await setPliantCardLimit(cardId, limit, count);
  await rememberPliantCard(admin, {
    pliant_card_id: cardId,
    limit_cents: limit.value,
    currency: limit.currency,
  });
}

export async function changePliantCardLimit(admin: Admin, cardId: string, limitCents: number, currency: string) {
  if (!pliantConfigured()) throw new Error("Pliant n’est pas branché.");
  await setPliantCardLimit(cardId, { value: limitCents, currency }, 20);
  await rememberPliantCard(admin, {
    pliant_card_id: cardId,
    limit_cents: limitCents,
    currency,
    limit_manual: true,
  });
}

export async function setPliantCardLocked(admin: Admin, cardId: string, locked: boolean) {
  if (!pliantConfigured()) throw new Error("Pliant n’est pas branché.");
  if (locked) await lockPliantCard(cardId);
  else await unlockPliantCard(cardId);
  await rememberPliantCard(admin, {
    pliant_card_id: cardId,
    status: locked ? "locked" : "active",
  });
}

export async function issueCustomerPliantCard(
  admin: Admin,
  input: { customerId: string; firstName: string; lastName: string; limitCents: number; currency: string }
) {
  if (!pliantConfigured()) throw new Error("Pliant n’est pas branché.");
  const open = await openCustomerCard(admin, input.customerId);
  if (open) return { cardId: open, created: false as const };
  const name = pliantCardNomination({ firstName: input.firstName, lastName: input.lastName });
  const today = parisIsoDate(new Date());
  const money = { value: input.limitCents, currency: input.currency };
  const issued = await issuePliantCard(process.env.PLIANT_CARDHOLDER_ID || "", {
    organizationId: process.env.PLIANT_ORGANIZATION_ID || "",
    cardConfig: "PLIANT_VIRTUAL_TRAVEL",
    label: name.label,
    customFirstName: name.customFirstName,
    customLastName: name.customLastName,
    limit: money,
    transactionLimit: money,
    limitRenewFrequency: "TOTAL",
    maxTransactionCount: 20,
    validFrom: today,
    validTo: addIsoDays(today, 365),
    validTimezone: "Europe/Paris",
  });
  if (!issued.cardId) throw new Error("Pliant n’a pas créé la carte.");
  const face = await readPliantCardFace(issued.cardId);
  await rememberPliantCard(admin, {
    pliant_card_id: issued.cardId,
    customer_id: input.customerId,
    booking_id: null,
    label: face.label || name.label,
    last4: face.last4,
    limit_cents: input.limitCents,
    currency: input.currency,
    status: "active",
    limit_manual: true,
  });
  return { cardId: issued.cardId, created: true as const };
}

export async function pliantSpendsForCards(admin: Admin, cardIds: string[]) {
  const ids = [...new Set(cardIds.filter(Boolean))];
  if (!ids.length) return [] as PliantSpendLine[];
  const { data } = await admin
    .from("crm_pliant_transactions")
    .select("id, merchant, status, type, billing_cents, billing_currency, booked_at, card_id")
    .in("card_id", ids)
    .order("booked_at", { ascending: false, nullsFirst: false })
    .limit(30);
  return ((data || []) as {
    id: string;
    merchant: string | null;
    status: string | null;
    type: string | null;
    billing_cents: number | null;
    billing_currency: string | null;
    booked_at: string | null;
  }[]).map((row) => ({
    id: row.id,
    merchant: row.merchant,
    status: row.status,
    type: row.type,
    billingCents: row.billing_cents,
    currency: row.billing_currency,
    bookedAt: row.booked_at,
  }));
}

export async function pliantCardForBooking(admin: Admin, bookingId: string) {
  const { data } = await admin
    .from("crm_pliant_cards")
    .select(CARD_COLUMNS)
    .eq("booking_id", bookingId)
    .order("updated_at", { ascending: false })
    .limit(1);
  return asDraft(((data || []) as unknown[])[0]);
}

export async function pliantCardForCustomer(admin: Admin, customerId: string) {
  const { data } = await admin
    .from("crm_pliant_cards")
    .select(CARD_COLUMNS)
    .eq("customer_id", customerId)
    .is("booking_id", null)
    .order("created_at", { ascending: false })
    .limit(1);
  return asDraft(((data || []) as unknown[])[0]);
}

async function openCustomerCard(admin: Admin, customerId: string) {
  const { data } = await admin
    .from("crm_pliant_cards")
    .select("pliant_card_id, status")
    .eq("customer_id", customerId)
    .is("booking_id", null)
    .eq("status", "active")
    .limit(1);
  const row = ((data || []) as { pliant_card_id?: string }[])[0];
  return row?.pliant_card_id || null;
}

function asDraft(data: unknown): PliantCardDraft | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Partial<PliantCardDraft> & { ceiling_cents?: number | null };
  if (!row.pliant_card_id) return null;
  const status: PliantCardStatus = row.status === "locked" ? "locked" : "active";
  return {
    pliant_card_id: row.pliant_card_id,
    customer_id: row.customer_id ?? null,
    booking_id: row.booking_id ?? null,
    label: row.label || null,
    last4: row.last4 ?? null,
    limit_cents: numberOrNull(row.ceiling_cents),
    currency: row.currency || "EUR",
    status,
    limit_manual: row.limit_manual === true,
  };
}

function numberOrNull(value: unknown) {
  if (value == null || value === "") return null;
  const cents = Number(value);
  return Number.isFinite(cents) ? cents : null;
}
