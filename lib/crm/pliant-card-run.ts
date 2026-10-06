import "server-only";

import { pliantCardNomination, pliantDesignation } from "./eta-il-fee";
import { cardTransactionRules } from "./manual-stay-card";
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
  "pliant_card_id, customer_id, booking_id, label, last4, ceiling_cents, currency, status, limit_manual, transaction_limit_cents, max_transaction_count";

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
        transaction_limit_cents: row.transaction_limit_cents,
        max_transaction_count: row.max_transaction_count,
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
  const kept = await rememberedTransactionRules(admin, cardId, limitCents);
  await setPliantCardLimit(cardId, { value: limitCents, currency }, kept.count, {
    value: kept.transactionLimitCents,
    currency,
  });
  await rememberPliantCard(admin, {
    pliant_card_id: cardId,
    limit_cents: limitCents,
    currency,
    limit_manual: true,
    transaction_limit_cents: kept.transactionLimitCents,
    max_transaction_count: kept.count,
  });
}

/** Les 4 derniers chiffres, lus chez Pliant sans ouvrir le numéro complet. */
export async function showPliantLast4(
  admin: Admin,
  input: {
    bookingCards?: { pliant_card_id: string; last4?: string | null }[];
    arrivals?: { pliant_card_id: string | null; card_last4: string | null }[];
    registry?: { pliant_card_id: string; last4: string | null } | null;
  }
) {
  if (!pliantConfigured()) return;
  const missing = new Set<string>();
  for (const card of input.bookingCards || []) {
    if (card.pliant_card_id && !card.last4) missing.add(card.pliant_card_id);
  }
  for (const row of input.arrivals || []) {
    if (row.pliant_card_id && !row.card_last4) missing.add(row.pliant_card_id);
  }
  if (input.registry?.pliant_card_id && !input.registry.last4) missing.add(input.registry.pliant_card_id);
  for (const cardId of missing) {
    const last4 = (await readPliantCardFace(cardId)).last4;
    if (!last4) continue;
    for (const card of input.bookingCards || []) {
      if (card.pliant_card_id === cardId) card.last4 = last4;
    }
    for (const row of input.arrivals || []) {
      if (row.pliant_card_id === cardId) row.card_last4 = last4;
    }
    if (input.registry?.pliant_card_id === cardId) input.registry.last4 = last4;
    try {
      await rememberPliantCard(admin, { pliant_card_id: cardId, last4 });
      await admin.from("crm_booking_cards").update({ last4 }).eq("pliant_card_id", cardId).is("last4", null);
      await admin.from("crm_hotel_arrivals").update({ card_last4: last4 }).eq("pliant_card_id", cardId).is("card_last4", null);
    } catch {
      // Les chiffres restent affichés pour cette ouverture.
    }
  }
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
  input: {
    customerId: string;
    firstName: string;
    lastName: string;
    limitCents: number;
    currency: string;
    designation?: string | null;
    transactionAmount?: string;
    transactionCount?: string;
  }
) {
  if (!pliantConfigured()) throw new Error("Pliant n’est pas branché.");
  const open = await openCustomerCard(admin, input.customerId);
  if (open) return { cardId: open, created: false as const };
  const name = pliantCardNomination({ firstName: input.firstName, lastName: input.lastName });
  const designation = pliantDesignation(input.designation);
  if (!designation) throw new Error("Indiquez le nom de la carte.");
  const rules = cardTransactionRules({
    limitCents: input.limitCents,
    transactionAmount: input.transactionAmount || "",
    transactionCount: input.transactionCount || "",
  });
  if ("error" in rules) throw new Error(rules.error);
  const today = parisIsoDate(new Date());
  const money = { value: input.limitCents, currency: input.currency };
  const issued = await issuePliantCard(process.env.PLIANT_CARDHOLDER_ID || "", {
    organizationId: process.env.PLIANT_ORGANIZATION_ID || "",
    cardConfig: "PLIANT_VIRTUAL_TRAVEL",
    label: designation || name.label,
    customFirstName: name.customFirstName,
    customLastName: name.customLastName,
    limit: money,
    transactionLimit: { value: rules.transactionLimitCents, currency: input.currency },
    limitRenewFrequency: "TOTAL",
    maxTransactionCount: rules.maxTransactionCount,
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
    label: designation || face.label || name.label,
    last4: face.last4,
    limit_cents: input.limitCents,
    currency: input.currency,
    status: "active",
    limit_manual: true,
    transaction_limit_cents: rules.transactionLimitCents,
    max_transaction_count: rules.maxTransactionCount,
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
    transaction_limit_cents: numberOrNull(row.transaction_limit_cents),
    max_transaction_count: numberOrNull(row.max_transaction_count),
  };
}

async function rememberedTransactionRules(admin: Admin, cardId: string, limitCents: number) {
  try {
    const { data } = await admin
      .from("crm_pliant_cards")
      .select("max_transaction_count, transaction_limit_cents")
      .eq("pliant_card_id", cardId)
      .maybeSingle();
    const row = data as { max_transaction_count?: number | null; transaction_limit_cents?: number | null } | null;
    const count = numberOrNull(row?.max_transaction_count);
    const tx = numberOrNull(row?.transaction_limit_cents);
    return {
      count: count != null && count >= 1 ? count : 20,
      transactionLimitCents: tx != null && tx > 0 ? Math.min(tx, limitCents) : limitCents,
    };
  } catch {
    return { count: 20, transactionLimitCents: limitCents };
  }
}

function numberOrNull(value: unknown) {
  if (value == null || value === "") return null;
  const cents = Number(value);
  return Number.isFinite(cents) ? cents : null;
}
