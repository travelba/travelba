import { NextResponse } from "next/server";
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
  try {
    await syncRecentHotelReplies(admin);
  } catch {
    // La lecture des réponses déjà en base reste possible.
  }

  const { data, error } = await admin
    .from("crm_hotel_thread_messages")
    .select("id, booking_id, booking_item_id, body, received_at, counts_as_reply")
    .eq("counts_as_reply", true)
    .gt("received_at", since)
    .order("received_at", { ascending: true })
    .limit(20);

  if (error) return NextResponse.json({ notices: [] });

  const messages = (data || []) as {
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

  return NextResponse.json({ notices: hotelReplyNotices(rows, since) });
}
