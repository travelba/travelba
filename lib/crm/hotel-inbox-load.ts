import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { parisIsoDate } from "./hotel-arrival";
import {
  buildHotelInbox,
  HOTEL_INBOX_LOAD_ERROR,
  merchantResemblesHotel,
  type HotelInbox,
  type HotelInboxCard,
  type HotelInboxLink,
  type HotelInboxRequest,
  type HotelInboxTurn,
  type HotelPaymentEvidence,
} from "./hotel-inbox";
import type { HotelPliantSpend } from "./hotel-courrier-board";
import { missingDbColumn } from "./optional-column";
import { pliantSpendSettlement, suggestCostTargets } from "./trip-costs";
import { loadCostTargets } from "./trip-costs-db";

const EMPTY: HotelInbox = { payment: [], replies: [], unanswered: [], waiting: [], rest: [], paid: [], endedUnpaid: [] };

type ItemRow = {
  id: string;
  booking_id: string;
  title: string | null;
  details: { hotel_name?: unknown; city?: unknown } | null;
  lifecycle: string | null;
  start_at: string | null;
  end_at: string | null;
};

type BookingRow = {
  id: string;
  reference: string | null;
  status: string | null;
  end_date: string | null;
  archived_at: string | null;
  customer_id: string | null;
};

type RequestRow = {
  id: string;
  booking_id: string;
  booking_item_id: string;
  kind: string;
  status: string;
  sent_at: string | null;
  last_follow_up_at: string | null;
  replied_at: string | null;
  reply_body: string | null;
  follow_up_count: number | null;
  classified_at?: string | null;
};

type MessageRow = {
  id: string;
  request_id: string | null;
  booking_item_id: string | null;
  body: string | null;
  received_at: string | null;
  direction: string | null;
  counts_as_reply: boolean | null;
  link: string | null;
  from_email: string | null;
};

const REQUEST_COLUMNS =
  "id, booking_id, booking_item_id, kind, status, sent_at, last_follow_up_at, replied_at, reply_body, follow_up_count";

/** Identifiants seulement. Jamais l’empreinte du code ni le chemin de la carte déposée. */
const CARD_LINK_COLUMNS = "booking_item_id, hotel_request_id, pliant_card_id";

const TX_COLUMNS = "id, card_id, status, type, billing_cents, billing_currency, booked_at";

/** Même plafond que l’ancienne lecture SQL : 80 séjours par requête. */
const SPEND_BATCH = 80;

const UUID_TEXT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Minuit à Paris, en UTC, pour filtrer `end_at` en SQL. */
export function parisMidnightIso(nowMs: number) {
  const day = parisIsoDate(new Date(nowMs));
  const utcMidnight = new Date(`${day}T00:00:00Z`);
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23" }).format(utcMidnight)
  );
  return new Date(utcMidnight.getTime() - (Number.isFinite(hour) ? hour : 0) * 3_600_000).toISOString();
}

function chunks<T>(values: T[], size: number) {
  const out: T[][] = [];
  for (let index = 0; index < values.length; index += size) out.push(values.slice(index, index + size));
  return out;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function idsIn<T>(
  load: (ids: string[]) => PromiseLike<{ data: T[] | null; error: { message?: string } | null }>,
  ids: string[],
  size = 60
) {
  const rows: T[] = [];
  for (const slice of chunks([...new Set(ids)], size)) {
    const { data, error } = await load(slice);
    if (error) throw new Error(error.message || "Lecture impossible");
    rows.push(...(data || []));
  }
  return rows;
}

/** Séjours dont le départ n’est pas encore passé, filtre en SQL. */
async function activeItemIds(supabase: SupabaseClient, nowMs: number) {
  const start = parisMidnightIso(nowMs);
  const today = parisIsoDate(new Date(nowMs));
  const [{ data: dated, error: datedError }, { data: open, error: openError }] = await Promise.all([
    supabase.from("crm_booking_items").select("id").eq("kind", "hotel").gte("end_at", start),
    supabase.from("crm_booking_items").select("id, booking_id").eq("kind", "hotel").is("end_at", null),
  ]);
  if (datedError) throw new Error(datedError.message);
  if (openError) throw new Error(openError.message);
  const ids = new Set(((dated || []) as { id: string }[]).map((row) => row.id));
  const undated = (open || []) as { id: string; booking_id: string }[];
  if (undated.length) {
    const bookingIds = [...new Set(undated.map((row) => row.booking_id))];
    const bookings = await idsIn(
      (slice) =>
        supabase
          .from("crm_bookings")
          .select("id")
          .in("id", slice)
          .or(`end_date.gte.${today},end_date.is.null`),
      bookingIds
    );
    const openBookings = new Set((bookings as { id: string }[]).map((row) => row.id));
    for (const row of undated) {
      if (openBookings.has(row.booking_id)) ids.add(row.id);
    }
  }
  return [...ids];
}

async function loadRequests(supabase: SupabaseClient, itemIds: string[]) {
  const rows: RequestRow[] = [];
  let columns = `${REQUEST_COLUMNS}, classified_at`;
  for (const slice of chunks([...new Set(itemIds)], 60)) {
    const first = await supabase
      .from("crm_hotel_requests")
      .select(columns)
      .in("booking_item_id", slice)
      .in("status", ["sent", "follow_up", "replied"]);
    if (first.error && missingDbColumn(first.error, "classified_at")) {
      columns = REQUEST_COLUMNS;
      const retry = await supabase
        .from("crm_hotel_requests")
        .select(columns)
        .in("booking_item_id", slice)
        .in("status", ["sent", "follow_up", "replied"]);
      if (retry.error) throw new Error(retry.error.message);
      rows.push(...((retry.data || []) as unknown as RequestRow[]));
      continue;
    }
    if (first.error) throw new Error(first.error.message);
    rows.push(...((first.data || []) as unknown as RequestRow[]));
  }
  return rows;
}

type CardLinkRow = { booking_item_id: string | null; hotel_request_id: string | null; pliant_card_id: string | null };

type ArrivalRow = { booking_item_id: string | null; pliant_card_id: string | null };

type CostRow = { booking_item_id: string | null; source_id: string | null };

type TxRow = {
  id: string;
  card_id: string | null;
  status: string | null;
  type: string | null;
  billing_cents: number | string | null;
  billing_currency: string | null;
  booked_at: string | null;
};

function cardText(value: string | null | undefined) {
  return (value || "").trim();
}

/** Achats Pliant d’un hôtel : carte du séjour, lien carte, ou coût déjà pointé. */
export function pliantSpendsForHotels(input: {
  itemIds: string[];
  requestIds: string[];
  arrivals: ArrivalRow[];
  links: CardLinkRow[];
  costs: CostRow[];
  transactions: TxRow[];
}): HotelPliantSpend[] {
  const items = new Set(input.itemIds);
  const requests = new Set(input.requestIds);
  const byCard = new Map<string, TxRow[]>();
  const byId = new Map<string, TxRow>();
  for (const tx of input.transactions) {
    if (!tx.id) continue;
    byId.set(tx.id, tx);
    const cardId = cardText(tx.card_id);
    if (!cardId) continue;
    const list = byCard.get(cardId) || [];
    list.push(tx);
    byCard.set(cardId, list);
  }
  const spends: HotelPliantSpend[] = [];
  const seen = new Set<string>();
  const push = (tx: TxRow, itemId: string | null, requestId: string | null) => {
    const key = `${itemId || ""}|${requestId || ""}|${tx.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    spends.push({
      bookingItemId: itemId,
      hotelRequestId: requestId,
      transactionId: tx.id,
      status: tx.status,
      type: tx.type,
      billingCents: tx.billing_cents,
      billingCurrency: tx.billing_currency,
      bookedAt: tx.booked_at,
    });
  };
  const bind = (itemId: string | null, requestId: string | null, cardId: string) => {
    const itemOk = Boolean(itemId && items.has(itemId));
    const requestOk = Boolean(requestId && requests.has(requestId));
    if (!itemOk && !requestOk) return;
    for (const tx of byCard.get(cardId) || []) push(tx, itemOk ? itemId : null, requestOk ? requestId : null);
  };
  for (const row of input.arrivals) bind(row.booking_item_id, null, cardText(row.pliant_card_id));
  for (const row of input.links) bind(row.booking_item_id, row.hotel_request_id, cardText(row.pliant_card_id));
  for (const row of input.costs) {
    const sourceId = cardText(row.source_id);
    const tx = byId.get(sourceId);
    if (!row.booking_item_id || !items.has(row.booking_item_id) || !tx) continue;
    push(tx, row.booking_item_id, null);
  }
  return spends;
}

async function readOptional<T>(label: string, load: () => Promise<T[]>): Promise<T[] | null> {
  try {
    return await load();
  } catch (error) {
    console.error(`[hotel-inbox] ${label}`, error instanceof Error ? error.message : "lecture");
    return null;
  }
}

/** Liens Pliant. Un refus de lecture se dégrade : la boîte ne se vide pas. */
async function loadCardLinks(supabase: SupabaseClient, itemIds: string[], requestIds: string[]) {
  const [byItem, byRequest] = await Promise.all([
    itemIds.length
      ? readOptional("liens", () =>
          idsIn(
            (slice) =>
              supabase.from("crm_card_links").select(CARD_LINK_COLUMNS).eq("source", "pliant").in("booking_item_id", slice),
            itemIds,
            SPEND_BATCH
          )
        )
      : Promise.resolve([] as CardLinkRow[]),
    requestIds.length
      ? readOptional("liens", () =>
          idsIn(
            (slice) =>
              supabase.from("crm_card_links").select(CARD_LINK_COLUMNS).eq("source", "pliant").in("hotel_request_id", slice),
            requestIds,
            SPEND_BATCH
          )
        )
      : Promise.resolve([] as CardLinkRow[]),
  ]);
  return [...(byItem || []), ...(byRequest || [])];
}

async function loadSpends(
  supabase: SupabaseClient,
  itemIds: string[],
  requestIds: string[],
  arrivals: ArrivalRow[],
  links: CardLinkRow[],
  arrivalsKnown: boolean
) {
  try {
    const costs = itemIds.length
      ? await idsIn(
          (slice) =>
            supabase.from("crm_trip_costs").select("booking_item_id, source_id").eq("source", "pliant").in("booking_item_id", slice),
          itemIds,
          SPEND_BATCH
        )
      : [];
    const cardIds = [
      ...arrivals.map((row) => cardText(row.pliant_card_id)),
      ...links.map((row) => cardText(row.pliant_card_id)),
    ].filter(Boolean);
    const sourceIds = (costs as CostRow[]).map((row) => cardText(row.source_id)).filter((id) => UUID_TEXT.test(id));
    const [byCard, bySource] = await Promise.all([
      cardIds.length
        ? idsIn(
            (slice) => supabase.from("crm_pliant_transactions").select(TX_COLUMNS).in("card_id", slice),
            cardIds,
            SPEND_BATCH
          )
        : Promise.resolve([] as TxRow[]),
      sourceIds.length
        ? idsIn((slice) => supabase.from("crm_pliant_transactions").select(TX_COLUMNS).in("id", slice), sourceIds, SPEND_BATCH)
        : Promise.resolve([] as TxRow[]),
    ]);
    return {
      known: arrivalsKnown,
      spends: pliantSpendsForHotels({
        itemIds,
        requestIds,
        arrivals,
        links,
        costs: costs as CostRow[],
        transactions: [...(byCard as TxRow[]), ...(bySource as TxRow[])],
      }),
    };
  } catch (error) {
    console.error("[hotel-inbox] paiements", error instanceof Error ? error.message : "lecture");
    return { known: false, spends: [] as HotelPliantSpend[] };
  }
}

/**
 * Fils d’hôtel groupés. Aucun appel Gmail, aucune écriture.
 * Le client est le service role : les liens de carte et les coûts ne sont pas lisibles par la session agence.
 */
export async function loadHotelInbox(supabase: SupabaseClient, nowMs = Date.now()): Promise<HotelInbox> {
  try {
    const activeIds = await activeItemIds(supabase, nowMs);
    const hinted = await hintedItemIds(supabase);
    const extraIds = hinted.filter((id) => !activeIds.includes(id));
    const endedIds = extraIds.length ? await endedItemIds(supabase, extraIds, nowMs) : [];
    const itemIds = [...new Set([...activeIds, ...endedIds])];
    if (!itemIds.length) return EMPTY;

    const requests = await loadRequests(supabase, itemIds);
    if (!requests.length) return EMPTY;
    const requestIds = requests.map((row) => row.id);
    const usedItems = [...new Set(requests.map((row) => row.booking_item_id))];
    const bookingIds = [...new Set(requests.map((row) => row.booking_id))];
    const [items, bookings, messages, cards, arrivalRows] = await Promise.all([
      idsIn(
        (slice) => supabase.from("crm_booking_items").select("id, booking_id, title, details, lifecycle, start_at, end_at").in("id", slice),
        usedItems
      ),
      idsIn(
        (slice) =>
          supabase.from("crm_bookings").select("id, reference, status, end_date, archived_at, customer_id").in("id", slice),
        bookingIds
      ),
      idsIn(
        (slice) =>
          supabase
            .from("crm_hotel_thread_messages")
            .select("id, request_id, booking_item_id, body, received_at, direction, counts_as_reply, link, from_email")
            .in("booking_item_id", slice),
        usedItems
      ),
      idsIn(
        (slice) =>
          supabase
            .from("crm_booking_cards")
            .select("id, booking_id, pliant_card_id, label, last4, limit_cents, currency, status, created_at")
            .in("booking_id", slice),
        bookingIds
      ),
      readOptional("arrivées", () =>
        idsIn(
          (slice) => supabase.from("crm_hotel_arrivals").select("booking_item_id, pliant_card_id").in("booking_item_id", slice),
          usedItems,
          SPEND_BATCH
        )
      ),
    ]);
    const arrivals = (arrivalRows || []) as ArrivalRow[];
    const cardLinks = await loadCardLinks(supabase, usedItems, requestIds);
    const spends = await loadSpends(supabase, usedItems, requestIds, arrivals, cardLinks, arrivalRows != null);
    const customers = await idsIn(
      (slice) => supabase.from("crm_customers").select("id, first_name, last_name").in("id", slice),
      (bookings as BookingRow[]).map((row) => row.customer_id || "").filter(Boolean)
    );
    const byItem = new Map((items as ItemRow[]).map((row) => [row.id, row]));
    const byBooking = new Map((bookings as BookingRow[]).map((row) => [row.id, row]));
    const byCustomer = new Map(
      (customers as { id: string; first_name: string | null; last_name: string | null }[]).map((row) => [row.id, row])
    );
    const turnsByRequest = new Map<string, HotelInboxTurn[]>();
    const looseByItem = new Map<string, HotelInboxTurn[]>();
    for (const row of messages as MessageRow[]) {
      if (!row.id || !row.received_at || (row.direction !== "in" && row.direction !== "out")) continue;
      const turn: HotelInboxTurn = {
        id: row.id,
        at: row.received_at,
        direction: row.direction,
        body: row.body || "",
        from: row.from_email || "",
        link: row.link,
        countsAsReply: Boolean(row.counts_as_reply),
      };
      if (row.request_id) {
        const list = turnsByRequest.get(row.request_id) || [];
        list.push(turn);
        turnsByRequest.set(row.request_id, list);
      } else if (row.booking_item_id) {
        const list = looseByItem.get(row.booking_item_id) || [];
        list.push(turn);
        looseByItem.set(row.booking_item_id, list);
      }
    }
    const sources: HotelInboxRequest[] = (requests as RequestRow[]).map((row) => {
      const item = byItem.get(row.booking_item_id);
      const booking = byBooking.get(row.booking_id);
      const customer = booking?.customer_id ? byCustomer.get(booking.customer_id) : undefined;
      const turns = [...(turnsByRequest.get(row.id) || []), ...(looseByItem.get(row.booking_item_id) || [])];
      if (!turns.some((turn) => turn.direction === "out") && row.sent_at) {
        turns.push({ id: `out:${row.id}`, at: row.sent_at, direction: "out", body: "", from: "", link: null, countsAsReply: false });
      }
      if (!turns.some((turn) => turn.direction === "in") && row.replied_at) {
        turns.push({
          id: row.id,
          at: row.replied_at,
          direction: "in",
          body: row.reply_body || "",
          from: "",
          link: null,
          countsAsReply: true,
        });
      }
      const first = text(customer?.first_name);
      const last = text(customer?.last_name);
      return {
        id: row.id,
        bookingId: row.booking_id,
        itemId: row.booking_item_id,
        kind: row.kind,
        status: row.status,
        sentAt: row.sent_at,
        lastFollowUpAt: row.last_follow_up_at,
        followUpCount: row.follow_up_count || 0,
        classifiedAt: row.classified_at || null,
        hotelName: text(item?.details?.hotel_name) || text(item?.title) || "Hôtel",
        city: text(item?.details?.city),
        reference: text(booking?.reference),
        clientName: [first, last].filter(Boolean).join(" "),
        clientFirst: first,
        clientLast: last,
        stayStart: item?.start_at || null,
        itemEnd: item?.end_at || null,
        bookingEnd: booking?.end_date || null,
        bookingStatus: booking?.status || "",
        bookingArchived: Boolean(booking?.archived_at),
        itemLifecycle: item?.lifecycle || null,
        turns,
      };
    });
    const inboxCards: HotelInboxCard[] = (
      cards as {
        id: string;
        booking_id: string;
        pliant_card_id: string;
        label: string | null;
        last4: string | null;
        limit_cents: number | null;
        currency: string | null;
        status: string | null;
        created_at: string | null;
      }[]
    ).map((row) => ({
      id: row.id,
      bookingId: row.booking_id,
      pliantCardId: row.pliant_card_id,
      label: text(row.label),
      last4: row.last4,
      limitCents: row.limit_cents || 0,
      currency: row.currency || "EUR",
      status: row.status || "",
      createdAt: row.created_at || "",
    }));
    const inboxLinks: HotelInboxLink[] = [
      ...(
        cardLinks as { booking_item_id: string | null; hotel_request_id: string | null; pliant_card_id: string | null }[]
      ).map((row) => ({
        itemId: row.booking_item_id,
        requestId: row.hotel_request_id,
        pliantCardId: row.pliant_card_id || "",
      })),
      ...(arrivals as { booking_item_id: string | null; pliant_card_id: string | null }[]).map((row) => ({
        itemId: row.booking_item_id,
        requestId: null,
        pliantCardId: row.pliant_card_id || "",
      })),
    ];
    const evidence = await loadPaymentEvidence(supabase, {
      bookingIds,
      hotelItems: sources.map((row) => ({ bookingId: row.bookingId, hotelName: row.hotelName })),
      cards: inboxCards,
    });
    return buildHotelInbox(
      sources,
      spends.spends,
      spends.known || evidence.known,
      inboxCards,
      inboxLinks,
      nowMs,
      evidence.rows
    );
  } catch (error) {
    console.error("[hotel-inbox]", error instanceof Error ? error.message : "lecture");
    return { ...EMPTY, loadError: HOTEL_INBOX_LOAD_ERROR };
  }
}

async function hintedItemIds(supabase: SupabaseClient) {
  const [{ data: messages, error: messageError }, { data: letters, error: letterError }] = await Promise.all([
    supabase
      .from("crm_hotel_thread_messages")
      .select("booking_item_id")
      .eq("direction", "in")
      .or(
        [
          "link.not.is.null",
          'body.ilike."%payment link%"',
          'body.ilike."%lien de paiement%"',
          'body.ilike."%secure link%"',
          "body.ilike.%prepay%",
          "body.ilike.%pre-authori%",
          "body.ilike.%préautor%",
          'body.ilike."%virtual card%"',
          'body.ilike."%carte virtuelle%"',
          "body.ilike.%invoice%",
          "body.ilike.%proforma%",
          "body.ilike.%facture%",
          "body.ilike.%virement%",
        ].join(",")
      )
      .order("received_at", { ascending: false })
      .limit(80),
    supabase
      .from("crm_hotel_requests")
      .select("booking_item_id")
      .eq("kind", "payment_link")
      .in("status", ["sent", "follow_up", "replied"])
      .order("updated_at", { ascending: false })
      .limit(80),
  ]);
  if (messageError && letterError) return [];
  const ids = new Set<string>();
  for (const row of (messageError ? [] : messages || []) as { booking_item_id: string | null }[]) {
    if (row.booking_item_id) ids.add(row.booking_item_id);
  }
  for (const row of (letterError ? [] : letters || []) as { booking_item_id: string | null }[]) {
    if (row.booking_item_id) ids.add(row.booking_item_id);
  }
  return [...ids];
}

async function endedItemIds(supabase: SupabaseClient, itemIds: string[], nowMs: number) {
  const start = parisMidnightIso(nowMs);
  const today = parisIsoDate(new Date(nowMs));
  const rows = await idsIn(
    (slice) => supabase.from("crm_booking_items").select("id, booking_id, end_at").in("id", slice).eq("kind", "hotel"),
    itemIds
  );
  const startMs = Date.parse(start);
  const dated = (rows as { id: string; booking_id: string; end_at: string | null }[]).filter(
    (row) => row.end_at && Number.isFinite(Date.parse(row.end_at)) && Date.parse(row.end_at) < startMs
  );
  const undated = (rows as { id: string; booking_id: string; end_at: string | null }[]).filter((row) => !row.end_at);
  const ended = new Set(dated.map((row) => row.id));
  if (undated.length) {
    const bookings = await idsIn(
      (slice) => supabase.from("crm_bookings").select("id, end_date").in("id", slice).lt("end_date", today),
      undated.map((row) => row.booking_id)
    );
    const past = new Set((bookings as { id: string }[]).map((row) => row.id));
    for (const row of undated) {
      if (past.has(row.booking_id)) ended.add(row.id);
    }
  }
  return [...ended];
}

type EvidenceCostRow = {
  id: string;
  booking_id: string;
  booking_item_id: string | null;
  source: string | null;
  source_id: string | null;
  amount_eur: number | string | null;
  supplier: string | null;
  occurred_on: string | null;
  state?: string | null;
};

type EvidenceSpendRow = {
  id: string;
  card_id: string | null;
  status: string | null;
  type: string | null;
  merchant: string | null;
  billing_cents: number | null;
  billing_currency: string | null;
  transaction_cents: number | null;
  transaction_currency: string | null;
  booked_at: string | null;
  card_label: string | null;
  match_status: string | null;
  customer_id: string | null;
  matched_customer_id: string | null;
};

const EVIDENCE_SPEND_COLUMNS =
  "id, card_id, status, type, merchant, billing_cents, billing_currency, transaction_cents, transaction_currency, booked_at, card_label, match_status, customer_id, matched_customer_id";

function euros(value: number | string | null | undefined) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

/**
 * Coûts du séjour, du dossier, dépenses des cartes du dossier, et propositions déjà calculées.
 * Lecture seule : aucun rattachement.
 */
async function loadPaymentEvidence(
  supabase: SupabaseClient,
  input: {
    bookingIds: string[];
    hotelItems: { bookingId: string; hotelName: string }[];
    cards: HotelInboxCard[];
  }
): Promise<{ known: boolean; rows: HotelPaymentEvidence[] }> {
  const bookingIds = [...new Set(input.bookingIds.filter(Boolean))];
  if (!bookingIds.length) return { known: true, rows: [] };
  try {
    const costs = await readTripCosts(supabase, bookingIds);
    const itemIds = [...new Set(costs.map((row) => row.booking_item_id).filter((id): id is string => Boolean(id)))];
    const kinds = new Map<string, string>();
    if (itemIds.length) {
      const items = await idsIn(
        (slice) => supabase.from("crm_booking_items").select("id, kind").in("id", slice),
        itemIds
      );
      for (const row of items as { id: string; kind: string | null }[]) kinds.set(row.id, row.kind || "");
    }
    const cardByPliant = new Map<string, { bookingId: string; label: string }>();
    for (const card of input.cards) {
      if (!card.pliantCardId) continue;
      cardByPliant.set(card.pliantCardId, { bookingId: card.bookingId, label: card.label });
    }
    const sourceIds = costs.filter((row) => row.source === "pliant" && row.source_id).map((row) => row.source_id as string);
    const spends = await readEvidenceSpends(supabase, sourceIds, [...cardByPliant.keys()]);
    const spendById = new Map(spends.map((row) => [row.id, row]));
    const rows: HotelPaymentEvidence[] = [];
    const seen = new Set<string>();

    for (const cost of costs) {
      const amount = euros(cost.amount_eur);
      if (!(amount > 0) || !cost.booking_id) continue;
      const kind = cost.booking_item_id ? kinds.get(cost.booking_item_id) || "" : "";
      const place = !cost.booking_item_id || kind === "expense" ? "dossier" : kind === "hotel" ? "stay" : null;
      if (!place) continue;
      if (cost.source === "revolut") {
        rows.push({
          id: cost.source_id || cost.id,
          source: "revolut",
          bookingId: cost.booking_id,
          bookingItemId: cost.booking_item_id,
          place,
          status: "BOOKED",
          amount,
          currency: "EUR",
          at: cost.occurred_on,
          merchant: cost.supplier,
          cardLabel: null,
          confidence: null,
        });
        continue;
      }
      if (cost.source !== "pliant") continue;
      const spend = cost.source_id ? spendById.get(cost.source_id) : undefined;
      const card = spend?.card_id ? cardByPliant.get(spend.card_id) : undefined;
      if (spend?.id) seen.add(spend.id);
      rows.push({
        id: spend?.id || cost.source_id || cost.id,
        source: "pliant",
        bookingId: cost.booking_id,
        bookingItemId: cost.booking_item_id,
        place,
        status: (spend?.status || (cost.state === "pending" ? "PENDING" : "BOOKED")).toUpperCase(),
        type: spend?.type || "PURCHASE",
        billingCents: spend?.billing_cents ?? Math.round(amount * 100),
        currency: spend?.billing_currency || "EUR",
        at: spend?.booked_at || cost.occurred_on,
        merchant: spend?.merchant || cost.supplier,
        cardLabel: card?.label || spend?.card_label || null,
        confidence: null,
      });
    }

    for (const spend of spends) {
      if (seen.has(spend.id) || !spend.card_id) continue;
      const card = cardByPliant.get(spend.card_id);
      if (!card) continue;
      seen.add(spend.id);
      rows.push({
        id: spend.id,
        source: "pliant",
        bookingId: card.bookingId,
        bookingItemId: null,
        place: "card",
        status: spend.status,
        type: spend.type,
        billingCents: spend.billing_cents,
        currency: spend.billing_currency || "EUR",
        at: spend.booked_at,
        merchant: spend.merchant,
        cardLabel: card.label || spend.card_label,
        confidence: null,
      });
    }

    const hotelsByBooking = new Map<string, string[]>();
    for (const item of input.hotelItems) {
      const list = hotelsByBooking.get(item.bookingId) || [];
      if (item.hotelName && !list.includes(item.hotelName)) list.push(item.hotelName);
      hotelsByBooking.set(item.bookingId, list);
    }
    try {
      rows.push(...(await readProposals(supabase, hotelsByBooking, cardByPliant, seen)));
    } catch (error) {
      console.error("[hotel-inbox]", error instanceof Error ? error.message : "propositions");
    }
    return { known: true, rows };
  } catch (error) {
    console.error("[hotel-inbox]", error instanceof Error ? error.message : "paiements");
    return { known: false, rows: [] };
  }
}

async function readTripCosts(supabase: SupabaseClient, bookingIds: string[]) {
  const rows: EvidenceCostRow[] = [];
  let columns = "id, booking_id, booking_item_id, source, source_id, amount_eur, supplier, occurred_on, state";
  for (const slice of chunks(bookingIds, 60)) {
    const first = await supabase.from("crm_trip_costs").select(columns).in("booking_id", slice);
    if (first.error && missingDbColumn(first.error, "state")) {
      columns = "id, booking_id, booking_item_id, source, source_id, amount_eur, supplier, occurred_on";
      const retry = await supabase.from("crm_trip_costs").select(columns).in("booking_id", slice);
      if (retry.error) throw new Error(retry.error.message);
      rows.push(...((retry.data || []) as unknown as EvidenceCostRow[]));
      continue;
    }
    if (first.error) throw new Error(first.error.message);
    rows.push(...((first.data || []) as unknown as EvidenceCostRow[]));
  }
  return rows;
}

async function readEvidenceSpends(supabase: SupabaseClient, sourceIds: string[], cardIds: string[]) {
  const rows: EvidenceSpendRow[] = [];
  const seen = new Set<string>();
  function push(data: EvidenceSpendRow[]) {
    for (const row of data) {
      if (!row.id || seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
    }
  }
  for (const slice of chunks([...new Set(sourceIds)], 60)) {
    const { data, error } = await supabase.from("crm_pliant_transactions").select(EVIDENCE_SPEND_COLUMNS).in("id", slice);
    if (error) throw new Error(error.message);
    push((data || []) as EvidenceSpendRow[]);
  }
  for (const slice of chunks([...new Set(cardIds)], 40)) {
    const { data, error } = await supabase.from("crm_pliant_transactions").select(EVIDENCE_SPEND_COLUMNS).in("card_id", slice);
    if (error) throw new Error(error.message);
    push((data || []) as EvidenceSpendRow[]);
  }
  return rows;
}

/** Dépenses non pointées dont le commerçant ressemble à un hôtel du fil, confiance haute seulement. */
async function readProposals(
  supabase: SupabaseClient,
  hotelsByBooking: Map<string, string[]>,
  cardByPliant: Map<string, { bookingId: string; label: string }>,
  attached: Set<string>
) {
  const names = [...hotelsByBooking.values()].flat();
  if (!names.length) return [] as HotelPaymentEvidence[];
  const { data, error } = await supabase
    .from("crm_pliant_transactions")
    .select(EVIDENCE_SPEND_COLUMNS)
    .eq("match_status", "unmatched")
    .in("status", ["PENDING", "BOOKED", "CONFIRMED"])
    .in("type", ["PURCHASE", "CASH_WITHDRAWAL"])
    .order("booked_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  const open = ((data || []) as EvidenceSpendRow[]).filter(
    (row) => row.id && !attached.has(row.id) && names.some((hotel) => merchantResemblesHotel(row.merchant, hotel))
  );
  if (!open.length) return [] as HotelPaymentEvidence[];
  const targets = await loadCostTargets(supabase);
  const rows: HotelPaymentEvidence[] = [];
  for (const spend of open) {
    const settlement = pliantSpendSettlement({
      id: spend.id,
      status: spend.status,
      type: spend.type,
      merchant: spend.merchant,
      billing_cents: spend.billing_cents,
      billing_currency: spend.billing_currency,
      transaction_cents: spend.transaction_cents,
      transaction_currency: spend.transaction_currency,
      booked_at: spend.booked_at,
    });
    if (!settlement || settlement.draft.amountEur === 0) continue;
    const card = spend.card_id ? cardByPliant.get(spend.card_id) : undefined;
    const suggestions = suggestCostTargets(
      {
        text: spend.merchant,
        party: spend.merchant,
        amount: Math.abs(settlement.draft.amountEur),
        originalAmount: settlement.draft.originalAmount,
        originalCurrency: settlement.draft.originalCurrency,
        cardBookingIds: card ? [card.bookingId] : [],
        cardName: spend.card_label,
        customerId: spend.customer_id || spend.matched_customer_id,
        date: spend.booked_at ? String(spend.booked_at).slice(0, 10) : null,
      },
      targets
    );
    for (const hit of suggestions) {
      if (hit.confidence !== "haute" || !hotelsByBooking.has(hit.bookingId)) continue;
      const hotels = hotelsByBooking.get(hit.bookingId) || [];
      if (!hotels.some((hotel) => merchantResemblesHotel(spend.merchant, hotel))) continue;
      rows.push({
        id: spend.id,
        source: "pliant",
        bookingId: hit.bookingId,
        bookingItemId: null,
        place: "proposal",
        status: spend.status,
        type: spend.type,
        billingCents: spend.billing_cents,
        currency: spend.billing_currency || "EUR",
        at: spend.booked_at,
        merchant: spend.merchant,
        cardLabel: card?.label || spend.card_label,
        confidence: "haute",
      });
      break;
    }
  }
  return rows;
}
