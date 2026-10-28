import { NextResponse } from "next/server";
import { agencyAlerts, type ConciergeChangeAlert } from "@/lib/crm/agency-alerts";
import { CONCIERGE_WRITE_SOURCE } from "@/lib/crm/concierge-client-write";
import { shouldNotifyInboundMail } from "@/lib/crm/email-reply-gate";
import { loadSentMailIndex } from "@/lib/crm/sent-mail";
import { requireStaff } from "@/lib/crm/auth";
import { hotelReplyNotices, type HotelReplyNoticeRow } from "@/lib/crm/hotel-reply-notice";
import { syncRecentHotelReplies } from "@/lib/crm/hotel-desk-run";
import { EMAIL_INBOX_QUEUE_STATUSES } from "@/lib/crm/types";
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
    .limit(20);

  if (error) return NextResponse.json({ notices: [], alerts: [], replied: 0 });

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

  const noticed = await admin
    .from("crm_email_ingest")
    .select("id, subject, received_at")
    .in("status", [...EMAIL_INBOX_QUEUE_STATUSES])
    .eq("crm_reply", true)
    .gt("received_at", since)
    .order("received_at", { ascending: true })
    .limit(8);

  let emailRows = (noticed.data || []) as { id: string; subject: string | null; received_at: string }[];
  if (noticed.error) {
    const all = await admin
      .from("crm_email_ingest")
      .select("id, subject, received_at, from_email, gmail_thread_id, label")
      .in("status", [...EMAIL_INBOX_QUEUE_STATUSES])
      .gt("received_at", since)
      .order("received_at", { ascending: true })
      .limit(8);
    const sent = await loadSentMailIndex(admin);
    emailRows = ((all.data || []) as {
      id: string;
      subject: string | null;
      received_at: string;
      from_email: string | null;
      gmail_thread_id: string | null;
      label: string | null;
    }[])
      .filter((row) =>
        shouldNotifyInboundMail(
          { label: row.label, from: row.from_email, subject: row.subject, threadId: row.gmail_thread_id },
          sent
        )
      )
      .map((row) => ({ id: row.id, subject: row.subject, received_at: row.received_at }));
  }

  const alerts = agencyAlerts({
    emails: emailRows.map((row) => ({
      id: row.id,
      subject: row.subject,
      receivedAt: row.received_at,
    })),
    chats: [],
    changes: await conciergeChanges(admin, since),
  });

  return NextResponse.json({ notices: hotelReplyNotices(rows, since), alerts, replied });
}

async function conciergeChanges(admin: ReturnType<typeof createServiceClient>, since: string): Promise<ConciergeChangeAlert[]> {
  const selected = await admin
    .from("crm_audit_events")
    .select("id, summary, created_at, booking_id")
    .eq("source", CONCIERGE_WRITE_SOURCE)
    .gt("created_at", since)
    .order("created_at", { ascending: true })
    .limit(8);
  if (!selected.error) {
    return ((selected.data || []) as { id: string; summary: string | null; created_at: string; booking_id: string | null }[]).map(
      (row) => ({
        id: String(row.id),
        summary: row.summary,
        createdAt: row.created_at,
        bookingId: row.booking_id,
      })
    );
  }
  const missing =
    selected.error.code === "42703" ||
    selected.error.code === "PGRST204" ||
    /schema cache|column/i.test(selected.error.message || "");
  if (!missing) return [];
  const fallback = await admin
    .from("crm_audit_events")
    .select("id, summary, created_at, booking_id, detail")
    .eq("action", "concierge_client")
    .gt("created_at", since)
    .order("created_at", { ascending: true })
    .limit(8);
  if (fallback.error) return [];
  return ((fallback.data || []) as {
    id: string;
    summary: string | null;
    created_at: string;
    booking_id: string | null;
    detail: { source?: unknown } | null;
  }[])
    .filter((row) => row.detail?.source === CONCIERGE_WRITE_SOURCE)
    .map((row) => ({
      id: String(row.id),
      summary: row.summary,
      createdAt: row.created_at,
      bookingId: row.booking_id,
    }));
}
