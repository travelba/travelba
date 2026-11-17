import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { parisIsoDate } from "./hotel-arrival";
import {
  buildHotelInbox,
  type HotelInbox,
  type HotelInboxCard,
  type HotelInboxLink,
  type HotelInboxRequest,
  type HotelInboxTurn,
} from "./hotel-inbox";
import type { HotelPliantSpend } from "./hotel-courrier-board";
import { missingDbColumn } from "./optional-column";

const EMPTY: HotelInbox = { payment: [], replies: [], unanswered: [], waiting: [], rest: [], endedUnpaid: [] };

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
  load: (ids: string[]) => PromiseLike<{ data: T[] | null; error: { message?: string } | null }>
  ,
  ids: string[]
) {
  const rows: T[] = [];
  for (const slice of chunks([...new Set(ids)], 60)) {
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

async function loadSpends(supabase: SupabaseClient, itemIds: string[], requestIds: string[]) {
  const spends: HotelPliantSpend[] = [];
  const itemSlices = chunks(itemIds, 80);
  const requestSlices = chunks(requestIds, 80);
  const passes = Math.max(itemSlices.length, requestSlices.length, 1);
  for (let index = 0; index < passes; index += 1) {
    const { data, error } = await supabase.rpc("crm_hotel_pliant_spend", {
      item_ids: itemSlices[index] || [],
      request_ids: requestSlices[index] || [],
    });
    if (error || !Array.isArray(data)) return { known: false, spends: [] as HotelPliantSpend[] };
    for (const row of data as {
      booking_item_id: string | null;
      hotel_request_id: string | null;
      transaction_id: string;
      status: string | null;
      type: string | null;
      billing_cents: number | string | null;
      billing_currency: string | null;
      booked_at: string | null;
    }[]) {
      if (!row.transaction_id) continue;
      spends.push({
        bookingItemId: row.booking_item_id,
        hotelRequestId: row.hotel_request_id,
        transactionId: row.transaction_id,
        status: row.status,
        type: row.type,
        billingCents: row.billing_cents,
        billingCurrency: row.billing_currency,
        bookedAt: row.booked_at,
      });
    }
  }
  return { known: true, spends };
}

/** Fils d’hôtel groupés. Aucun appel Gmail, aucune écriture. */
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
    const [items, bookings, messages, spends, cards, cardLinks, arrivals] = await Promise.all([
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
      loadSpends(supabase, usedItems, requestIds),
      idsIn(
        (slice) =>
          supabase
            .from("crm_booking_cards")
            .select("id, booking_id, pliant_card_id, label, last4, limit_cents, currency, status, created_at")
            .in("booking_id", slice),
        bookingIds
      ),
      idsIn(
        (slice) =>
          supabase
            .from("crm_card_links")
            .select("booking_item_id, hotel_request_id, pliant_card_id")
            .eq("source", "pliant")
            .in("booking_item_id", slice),
        usedItems
      ),
      idsIn(
        (slice) => supabase.from("crm_hotel_arrivals").select("booking_item_id, pliant_card_id").in("booking_item_id", slice),
        usedItems
      ),
    ]);
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
    return buildHotelInbox(sources, spends.spends, spends.known, inboxCards, inboxLinks, nowMs);
  } catch (error) {
    console.error("[hotel-inbox]", error instanceof Error ? error.message : "lecture");
    return EMPTY;
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
