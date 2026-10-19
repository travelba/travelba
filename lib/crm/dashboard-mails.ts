import type { SupabaseClient } from "@supabase/supabase-js";
import {
  dashboardCourriers,
  type DashboardCourrier,
  type HotelCourrierSource,
  type HotelPliantSpend,
} from "./hotel-courrier-board";

export type DashboardMail = DashboardCourrier;

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
  };
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

/** Courriers hôtel partis, du plus récent au plus ancien, avec réponse et paiement Pliant. */
export async function loadDashboardMails(supabase: SupabaseClient): Promise<DashboardMail[]> {
  const { data, error } = await supabase
    .from("crm_hotel_requests")
    .select("id, booking_id, booking_item_id, kind, status, sent_at, last_follow_up_at, replied_at, reply_body, updated_at")
    .in("status", ["sent", "follow_up", "replied"])
    .order("updated_at", { ascending: false })
    .limit(40);

  if (error || !data?.length) return [];
  const requests = data as RequestRow[];
  const itemIds = [...new Set(requests.map((row) => row.booking_item_id))];
  const bookingIds = [...new Set(requests.map((row) => row.booking_id))];
  const requestIds = requests.map((row) => row.id);
  const paymentIds = requests.filter((row) => row.kind === "payment_link").map((row) => row.id);
  const paymentItems = [
    ...new Set(requests.filter((row) => row.kind === "payment_link").map((row) => row.booking_item_id)),
  ];

  const [{ data: items }, { data: bookings }, { data: replies }, payments] = await Promise.all([
    supabase.from("crm_booking_items").select("id, title, details").in("id", itemIds),
    supabase.from("crm_bookings").select("id, reference").in("id", bookingIds),
    supabase
      .from("crm_hotel_thread_messages")
      .select("id, request_id, body, received_at")
      .eq("direction", "in")
      .eq("counts_as_reply", true)
      .in("request_id", requestIds),
    loadHotelPliantSpends(supabase, paymentItems, paymentIds),
  ]);

  const byItem = new Map(
    ((items || []) as { id: string; title: string | null; details: { hotel_name?: unknown } | null }[]).map((item) => [
      item.id,
      item,
    ])
  );
  const references = new Map(
    ((bookings || []) as { id: string; reference: string | null }[]).map((row) => [row.id, row.reference || ""])
  );
  const repliesByRequest = new Map<string, HotelCourrierSource["replies"]>();
  for (const reply of (replies || []) as {
    id: string;
    request_id: string | null;
    body: string | null;
    received_at: string | null;
  }[]) {
    if (!reply.request_id || !reply.received_at) continue;
    const list = repliesByRequest.get(reply.request_id) || [];
    list.push({ id: reply.id, body: reply.body || "", receivedAt: reply.received_at });
    repliesByRequest.set(reply.request_id, list);
  }

  const sources: HotelCourrierSource[] = requests.map((row) => {
    const item = byItem.get(row.booking_item_id);
    const hotelName = item?.details && typeof item.details.hotel_name === "string" ? item.details.hotel_name : "";
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
      reference: references.get(row.booking_id) || "",
      replies: repliesByRequest.get(row.id) || [],
    };
  });

  return dashboardCourriers(sources, payments.spends, payments.known);
}
