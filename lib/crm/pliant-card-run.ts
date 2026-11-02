import "server-only";

import { pliantCardCaption, pliantCardNomination, pliantDesignation } from "./eta-il-fee";
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
import { PLIANT_SINGLE_USE } from "./pliant-controls";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = { from: (table: string) => any };

const CARD_COLUMNS =
  "pliant_card_id, customer_id, booking_id, label, last4, ceiling_cents, currency, status, limit_manual, transaction_limit_cents, max_transaction_count, note";

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
        note: row.note,
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
  count: number | null,
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
    bookingCards?: { pliant_card_id: string; last4?: string | null; booking_id?: string | null }[];
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
      const bookingId = (input.bookingCards || []).find((card) => card.pliant_card_id === cardId)?.booking_id || null;
      await rememberPliantCard(admin, {
        pliant_card_id: cardId,
        last4,
        ...(bookingId ? { booking_id: bookingId } : {}),
      });
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
  const caption = pliantCardCaption({ client: input.lastName, place: input.designation });
  const rules = cardTransactionRules({
    limitCents: input.limitCents,
    transactionAmount: input.transactionAmount || "",
  });
  if ("error" in rules) throw new Error(rules.error);
  const today = parisIsoDate(new Date());
  const money = { value: input.limitCents, currency: input.currency };
  const issued = await issuePliantCard(process.env.PLIANT_CARDHOLDER_ID || "", {
    organizationId: process.env.PLIANT_ORGANIZATION_ID || "",
    cardConfig: PLIANT_SINGLE_USE,
    label: caption?.label || designation || name.label,
    purpose: caption?.purpose || designation || name.label,
    customFirstName: name.customFirstName,
    customLastName: name.customLastName,
    limit: money,
    transactionLimit: { value: rules.transactionLimitCents, currency: input.currency },
    limitRenewFrequency: "TOTAL",
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
    label: caption?.label || designation || face.label || name.label,
    last4: face.last4,
    limit_cents: input.limitCents,
    currency: input.currency,
    status: "active",
    limit_manual: true,
    transaction_limit_cents: rules.transactionLimitCents,
    max_transaction_count: null,
  });
  return { cardId: issued.cardId, created: true as const };
}

/** Plafond historique du bureau carte. Le bloc Carte Pliant du dossier passe `limit: null`. */
export async function pliantSpendsForCards(
  admin: Admin,
  cardIds: string[],
  options?: { limit?: number | null }
) {
  const ids = [...new Set(cardIds.filter(Boolean))];
  if (!ids.length) return [] as PliantSpendLine[];
  let query = admin
    .from("crm_pliant_transactions")
    .select(
      "id, merchant, status, type, billing_cents, billing_currency, transaction_cents, transaction_currency, booked_at, card_id, category, comment, holder_name, match_status, matched_transaction_id"
    )
    .in("card_id", ids)
    .order("booked_at", { ascending: false, nullsFirst: false });
  const cap = options?.limit === undefined ? 30 : options.limit;
  if (cap != null) query = query.limit(cap);
  const { data } = await query;
  return ((data || []) as {
    id: string;
    card_id: string | null;
    merchant: string | null;
    status: string | null;
    type: string | null;
    billing_cents: number | null;
    billing_currency: string | null;
    transaction_cents: number | null;
    transaction_currency: string | null;
    booked_at: string | null;
    category: string | null;
    comment: string | null;
    holder_name: string | null;
    match_status: PliantSpendLine["matchStatus"];
    matched_transaction_id: string | null;
  }[]).map((row) => ({
    id: row.id,
    cardId: row.card_id,
    merchant: row.merchant,
    status: row.status,
    type: row.type,
    billingCents: row.billing_cents,
    currency: row.billing_currency,
    bookedAt: row.booked_at,
    transactionCents: row.transaction_cents,
    transactionCurrency: row.transaction_currency,
    category: row.category,
    comment: row.comment,
    holderName: row.holder_name,
    matchStatus: row.match_status || "unmatched",
    matchedTransactionId: row.matched_transaction_id,
  }));
}

/** Relie chaque dépense déjà rattachée au voyage dont elle est un coût (`crm_trip_costs`). */
export async function withPliantSpendBookings(admin: Admin, spends: PliantSpendLine[]) {
  const ids = [...new Set(spends.filter((row) => row.matchStatus === "matched").map((row) => row.id))];
  if (!ids.length) return spends;
  const txRows: { id: string; booking_id: string | null }[] = [];
  for (let index = 0; index < ids.length; index += 100) {
    const { data } = await admin
      .from("crm_trip_costs")
      .select("source_id, booking_id")
      .eq("source", "pliant")
      .in("source_id", ids.slice(index, index + 100));
    txRows.push(
      ...((data || []) as { source_id: string; booking_id: string | null }[]).map((row) => ({ id: row.source_id, booking_id: row.booking_id }))
    );
  }
  const bookingIds = [...new Set(txRows.map((row) => row.booking_id).filter((id): id is string => Boolean(id)))];
  const references = new Map<string, string | null>();
  for (let index = 0; index < bookingIds.length; index += 100) {
    const { data } = await admin
      .from("crm_bookings")
      .select("id, reference")
      .in("id", bookingIds.slice(index, index + 100));
    for (const row of (data || []) as { id: string; reference: string | null }[]) {
      references.set(row.id, row.reference);
    }
  }
  const byTx = new Map(txRows.map((row) => [row.id, row.booking_id]));
  return spends.map((spend) => {
    const bookingId = byTx.get(spend.id) || null;
    return {
      ...spend,
      matchedBookingId: bookingId,
      matchedReference: bookingId ? references.get(bookingId) || null : null,
    };
  });
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
    note: typeof row.note === "string" && row.note.trim() ? row.note.trim().slice(0, 180) : null,
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
      count: count != null && count >= 1 ? count : null,
      transactionLimitCents: tx != null && tx > 0 ? Math.min(tx, limitCents) : limitCents,
    };
  } catch {
    return { count: null, transactionLimitCents: limitCents };
  }
}

function numberOrNull(value: unknown) {
  if (value == null || value === "") return null;
  const cents = Number(value);
  return Number.isFinite(cents) ? cents : null;
}
