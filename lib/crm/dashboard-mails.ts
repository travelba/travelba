import type { SupabaseClient } from "@supabase/supabase-js";
import { hotelMailSubjectKey } from "./hotel-desk";
import {
  classificationSuperseded,
  dashboardCourriers,
  HOTEL_COURRIER_CLASS_CLEAR,
  type DashboardCourrier,
  type HotelCourrierSource,
  type HotelCourrierTurn,
  type HotelPliantSpend,
} from "./hotel-courrier-board";
import { hotelDisplayName } from "./carnet";
import { missingDbColumn } from "./optional-column";
import { isActiveItem, type CrmBookingItem } from "./types";

export type DashboardMail = DashboardCourrier;

type RequestRow = {
  id: string;
  booking_id: string;
  booking_item_id: string;
  kind: string;
  status: string;
  subject: string | null;
  sent_subjects: string[] | null;
  sent_at: string | null;
  last_follow_up_at: string | null;
  replied_at: string | null;
  reply_body: string | null;
  follow_up_count: number | null;
  classified_at?: string | null;
};

type TurnRow = {
  id: string;
  request_id: string | null;
  booking_item_id: string | null;
  subject_key: string | null;
  body: string | null;
  received_at: string | null;
  direction: string | null;
  counts_as_reply: boolean | null;
};

type SpendRow = {
  booking_item_id: string | null;
  hotel_request_id: string | null;
  transaction_id: string;
  status: string | null;
  type: string | null;
  billing_cents: number | string | null;
  billing_currency: string | null;
  booked_at: string | null;
  booking_id?: string | null;
  card_label?: string | null;
  cost_item_id?: string | null;
};

type HotelItemRow = {
  id: string;
  booking_id: string;
  title: string | null;
  details: { hotel_name?: unknown } | null;
  lifecycle: string | null;
  amount: number | string | null;
  start_at: string | null;
  end_at: string | null;
};

type ArrivalNetRow = {
  booking_item_id: string | null;
  net_cents: number | string | null;
  currency: string | null;
};

function spendOf(row: SpendRow): HotelPliantSpend | null {
  if (!row.transaction_id) return null;
  return {
    bookingItemId: row.booking_item_id,
    hotelRequestId: row.hotel_request_id,
    transactionId: row.transaction_id,
    status: row.status,
    type: row.type,
    billingCents: row.billing_cents,
    billingCurrency: row.billing_currency,
    bookedAt: row.booked_at,
    bookingId: row.booking_id || null,
    cardPurpose: row.card_label || null,
    costItemId: row.cost_item_id || null,
  };
}

function centsFrom(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }
  return null;
}

function moneyCode(value: string | null | undefined) {
  const code = (value || "EUR").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : "EUR";
}

/** Net de l’arrivée s’il est connu, sinon le montant de la ligne, en centimes. Pas de change au rendu. */
function stayMoney(item: HotelItemRow, net: ArrivalNetRow | undefined) {
  const netCents = centsFrom(net?.net_cents ?? null);
  if (netCents != null && netCents > 0) return { cents: netCents, currency: moneyCode(net?.currency) };
  const major = typeof item.amount === "number" ? item.amount : typeof item.amount === "string" ? Number(item.amount) : Number.NaN;
  if (!Number.isFinite(major) || major <= 0) return { cents: null, currency: null };
  return { cents: Math.round(major * 100), currency: "EUR" };
}

/** Achats Pliant des hôtels. Échec ou fonction absente : on ne conclut pas « pas de paiement ». */
async function loadHotelPliantSpends(
  supabase: SupabaseClient,
  itemIds: string[],
  requestIds: string[]
): Promise<{ known: boolean; spends: HotelPliantSpend[] }> {
  if (!itemIds.length && !requestIds.length) return { known: true, spends: [] };
  const { data, error } = await supabase.rpc("crm_hotel_pliant_spend", {
    item_ids: itemIds,
    request_ids: requestIds,
  });
  if (error || !Array.isArray(data)) return { known: false, spends: [] };
  return {
    known: true,
    spends: (data as SpendRow[]).flatMap((row) => {
      const spend = spendOf(row);
      return spend ? [spend] : [];
    }),
  };
}

function subjectKeys(row: Pick<RequestRow, "subject" | "sent_subjects">) {
  const listed = (row.sent_subjects || []).map((subject) => hotelMailSubjectKey(subject)).filter(Boolean);
  if (listed.length) return new Set(listed);
  const current = hotelMailSubjectKey(row.subject || "");
  return new Set(current ? [current] : []);
}

function turnOf(row: TurnRow): HotelCourrierTurn | null {
  if (!row.id || !row.received_at) return null;
  if (row.direction !== "in" && row.direction !== "out") return null;
  return {
    id: row.id,
    at: row.received_at,
    direction: row.direction,
    body: row.body || "",
    countsAsReply: Boolean(row.counts_as_reply),
  };
}

const REQUEST_COLUMNS =
  "id, booking_id, booking_item_id, kind, status, subject, sent_subjects, sent_at, last_follow_up_at, replied_at, reply_body, follow_up_count, updated_at";

function requestQuery(supabase: SupabaseClient, columns: string) {
  return supabase
    .from("crm_hotel_requests")
    .select(columns)
    .in("status", ["sent", "follow_up", "replied"])
    .order("updated_at", { ascending: false })
    .limit(120);
}

/** Courriers hôtel encore à traiter : dernier message du fil, paiement, classement, dossier. */
export async function loadDashboardMails(supabase: SupabaseClient): Promise<DashboardMail[]> {
  const wide = await requestQuery(supabase, `${REQUEST_COLUMNS}, classified_at, classified_by, classified_by_name, classified_note`);
  const loaded =
    wide.error && missingDbColumn(wide.error, "classified_at") ? await requestQuery(supabase, REQUEST_COLUMNS) : wide;
  const { data, error } = loaded;

  if (error || !data?.length) return [];
  const requests = data as unknown as RequestRow[];
  const itemIds = [...new Set(requests.map((row) => row.booking_item_id))];
  const bookingIds = [...new Set(requests.map((row) => row.booking_id))];
  const requestIds = new Set(requests.map((row) => row.id));
  const paymentIds = requests.filter((row) => row.kind === "payment_link").map((row) => row.id);
  const paymentItems = [
    ...new Set(requests.filter((row) => row.kind === "payment_link").map((row) => row.booking_item_id)),
  ];
  const paymentBookingIds = [
    ...new Set(requests.filter((row) => row.kind === "payment_link").map((row) => row.booking_id)),
  ];

  const [{ data: items }, { data: bookings }, { data: thread }, payments, hotelLoad, netLoad] = await Promise.all([
    supabase.from("crm_booking_items").select("id, title, details, lifecycle, end_at").in("id", itemIds),
    supabase.from("crm_bookings").select("id, reference, status, end_date, archived_at").in("id", bookingIds),
    supabase
      .from("crm_hotel_thread_messages")
      .select("id, request_id, booking_item_id, subject_key, body, received_at, direction, counts_as_reply")
      .in("booking_item_id", itemIds),
    loadHotelPliantSpends(supabase, paymentItems, paymentIds),
    paymentBookingIds.length
      ? supabase
          .from("crm_booking_items")
          .select("id, booking_id, kind, title, details, lifecycle, amount, start_at, end_at")
          .in("booking_id", paymentBookingIds)
          .eq("kind", "hotel")
      : Promise.resolve({ data: [] as HotelItemRow[], error: null }),
    paymentItems.length
      ? supabase.from("crm_hotel_arrivals").select("booking_item_id, net_cents, currency").in("booking_item_id", paymentItems)
      : Promise.resolve({ data: [] as ArrivalNetRow[], error: null }),
  ]);

  const byItem = new Map(
    (
      (items || []) as {
        id: string;
        title: string | null;
        details: { hotel_name?: unknown } | null;
        lifecycle: string | null;
        end_at: string | null;
      }[]
    ).map((item) => [item.id, item])
  );
  const byBooking = new Map(
    (
      (bookings || []) as {
        id: string;
        reference: string | null;
        status: string | null;
        end_date: string | null;
        archived_at: string | null;
      }[]
    ).map((row) => [row.id, row])
  );
  const hotelsKnown = !hotelLoad.error;
  const hotelsByBooking = new Map<string, HotelItemRow[]>();
  if (hotelsKnown) {
    for (const item of (hotelLoad.data || []) as HotelItemRow[]) {
      if (!item.id || !item.booking_id || !isActiveItem(item)) continue;
      const list = hotelsByBooking.get(item.booking_id) || [];
      list.push(item);
      hotelsByBooking.set(item.booking_id, list);
    }
  }
  const nets = new Map<string, ArrivalNetRow>();
  if (!netLoad.error) {
    for (const row of (netLoad.data || []) as ArrivalNetRow[]) {
      if (row.booking_item_id) nets.set(row.booking_item_id, row);
    }
  }

  const turnsByRequest = new Map<string, HotelCourrierTurn[]>();
  const loose: TurnRow[] = [];
  for (const row of (thread || []) as TurnRow[]) {
    if (row.request_id && requestIds.has(row.request_id)) {
      const turn = turnOf(row);
      if (!turn) continue;
      const list = turnsByRequest.get(row.request_id) || [];
      list.push(turn);
      turnsByRequest.set(row.request_id, list);
      continue;
    }
    loose.push(row);
  }
  for (const row of loose) {
    const turn = turnOf(row);
    if (!turn || !row.booking_item_id || !row.subject_key) continue;
    const owner = requests.find(
      (request) => request.booking_item_id === row.booking_item_id && subjectKeys(request).has(row.subject_key || "")
    );
    if (!owner) continue;
    const list = turnsByRequest.get(owner.id) || [];
    list.push(turn);
    turnsByRequest.set(owner.id, list);
  }

  const sources: HotelCourrierSource[] = requests.map((row) => {
    const item = byItem.get(row.booking_item_id);
    const booking = byBooking.get(row.booking_id);
    const hotelName = item?.details && typeof item.details.hotel_name === "string" ? item.details.hotel_name : "";
    const turns = turnsByRequest.get(row.id) || [];
    const stayHotels = hotelsByBooking.get(row.booking_id) || [];
    const mine = stayHotels.find((hotel) => hotel.id === row.booking_item_id) || null;
    const siblings = stayHotels.filter((hotel) => hotel.id !== row.booking_item_id);
    const money = mine ? stayMoney(mine, nets.get(mine.id)) : { cents: null, currency: null };
    return {
      id: row.id,
      bookingId: row.booking_id,
      itemId: row.booking_item_id,
      kind: row.kind,
      status: row.status,
      sentAt: row.sent_at,
      lastFollowUpAt: row.last_follow_up_at,
      repliedAt: row.replied_at,
      replyBody: row.reply_body || "",
      hotelName,
      itemTitle: item?.title || "",
      reference: booking?.reference || "",
      replies: turns
        .filter((turn) => turn.direction === "in" && turn.countsAsReply)
        .map((turn) => ({ id: turn.id, body: turn.body, receivedAt: turn.at })),
      followUpCount: row.follow_up_count || 0,
      turns,
      bookingStatus: booking?.status || "",
      bookingArchived: Boolean(booking?.archived_at),
      bookingEnd: booking?.end_date || null,
      itemEnd: item?.end_at || mine?.end_at || null,
      itemLifecycle: item?.lifecycle || null,
      classifiedAt: row.classified_at || null,
      hotelCount: row.kind === "payment_link" && hotelsKnown && mine ? stayHotels.length : undefined,
      stayStart: mine?.start_at || null,
      stayAmountCents: money.cents,
      stayAmountCurrency: money.currency,
      siblingItemIds: siblings.map((hotel) => hotel.id),
      siblingHotelNames: siblings.map((hotel) => hotelDisplayName(hotel as CrmBookingItem)),
    };
  });

  for (const source of sources) {
    if (!classificationSuperseded(source.classifiedAt, source.turns || [])) continue;
    await supabase.from("crm_hotel_requests").update(HOTEL_COURRIER_CLASS_CLEAR).eq("id", source.id);
  }

  return dashboardCourriers(sources, payments.spends, payments.known);
}

/** Réponses d’hôtel encore à traiter, le même décompte que la liste du tableau de bord. */
export async function countHotelRepliesToTreat(supabase: SupabaseClient) {
  const mails = await loadDashboardMails(supabase);
  return mails.filter((mail) => mail.replyState === "treat").length;
}
