import { NextResponse } from "next/server";
import { receivedPaymentPopup, storedAgencyAlert } from "@/lib/crm/agency-alerts";
import { requireStaff } from "@/lib/crm/auth";
import { hotelReplyNotices, type HotelReplyNoticeRow } from "@/lib/crm/hotel-reply-notice";
import { syncRecentHotelReplies } from "@/lib/crm/hotel-desk-run";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  const since = new URL(request.url).searchParams.get("since");
  if (!since || !Number.isFinite(Date.parse(since))) {
    return NextResponse.json({ notices: [] });
  }

  const admin = createServiceClient();
  let replied = 0;
  try {
    const synced = await syncRecentHotelReplies(admin);
    replied = synced.replied;
  } catch {
    // La lecture des réponses déjà en base reste possible.
  }

  const { data, error } = await admin
    .from("crm_hotel_thread_messages")
    .select("id, booking_id, booking_item_id, body, received_at, counts_as_reply")
    .eq("counts_as_reply", true)
    .gt("received_at", since)
    .order("received_at", { ascending: true })
    .limit(8);

  const messages = (error ? [] : data || []) as {
    id: string;
    booking_id: string;
    booking_item_id: string;
    body: string;
    received_at: string;
    counts_as_reply: boolean;
  }[];
  const itemIds = [...new Set(messages.map((row) => row.booking_item_id))];
  const { data: items } = itemIds.length
    ? await admin.from("crm_booking_items").select("id, title, details").in("id", itemIds)
    : { data: [] };
  const byItem = new Map(
    ((items || []) as { id: string; title: string | null; details: { hotel_name?: unknown } | null }[]).map((item) => [item.id, item])
  );

  const rows = messages.map((row) => {
    const item = byItem.get(row.booking_item_id);
    const hotelName = item?.details && typeof item.details.hotel_name === "string" ? item.details.hotel_name : "";
    const notice: HotelReplyNoticeRow = {
      id: row.id,
      bookingId: row.booking_id,
      itemId: row.booking_item_id,
      body: row.body || "",
      receivedAt: row.received_at,
      countsAsReply: row.counts_as_reply,
      hotelName,
      title: item?.title || "",
    };
    return notice;
  });

  const payments = await receivedPayments(admin, since);
  const bookings = await hotelBookingAlerts(admin, since);
  return NextResponse.json({ notices: hotelReplyNotices(rows, since), alerts: [...payments, ...bookings], replied });
}

async function receivedPayments(admin: ReturnType<typeof createServiceClient>, since: string) {
  const selected = await admin
    .from("crm_agency_alerts")
    .select("id, kind, summary, created_at, entity_id, entity_type")
    .eq("kind", "payment")
    .gt("created_at", since)
    .order("created_at", { ascending: true })
    .limit(8);
  if (selected.error) return [];
  return (
    (selected.data || []) as {
      id: string;
      kind: string;
      summary: string | null;
      created_at: string;
      entity_id: string | null;
      entity_type: string | null;
    }[]
  ).flatMap((row) => {
    const alert = receivedPaymentPopup({
      id: String(row.id),
      kind: row.kind,
      summary: row.summary,
      createdAt: row.created_at,
      entityId: row.entity_id,
      entityType: row.entity_type,
    });
    return alert ? [alert] : [];
  });
}

async function hotelBookingAlerts(admin: ReturnType<typeof createServiceClient>, since: string) {
  const selected = await admin
    .from("crm_agency_alerts")
    .select("id, kind, summary, created_at, entity_id, entity_type")
    .eq("kind", "hotel_booking")
    .is("read_at", null)
    .gt("created_at", since)
    .order("created_at", { ascending: true })
    .limit(8);
  if (selected.error) return [];
  return (
    (selected.data || []) as {
      id: string;
      kind: string;
      summary: string | null;
      created_at: string;
      entity_id: string | null;
      entity_type: string | null;
    }[]
  ).flatMap((row) => {
    const alert = storedAgencyAlert({
      id: String(row.id),
      kind: row.kind,
      summary: row.summary,
      createdAt: row.created_at,
      entityId: row.entity_id,
      entityType: row.entity_type,
    });
    return alert ? [alert] : [];
  });
}
