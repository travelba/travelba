import { createServiceClient } from "@/lib/supabase/admin";
import { stayDestinationLine } from "@/lib/crm/stay-phrase";
import {
  approvedManualTemplates,
  foldThreads,
  pauseStillActive,
  sessionWindowOpenNow,
  threadKey,
  type InboxMessage,
  type InboxThread,
} from "@/lib/crm/whatsapp-inbox";
import { isVercelPreview } from "@/lib/crm/preview-secrets";

type RawMessage = {
  id: string;
  customer_id: string | null;
  booking_id: string | null;
  direction: string;
  body: string;
  status: string | null;
  template_key: string | null;
  created_at: string;
  phone?: string | null;
  author_staff_id?: string | null;
  media_path?: string | null;
  tools?: string[] | null;
};

const RICH =
  "id, customer_id, booking_id, direction, body, status, template_key, created_at, phone, author_staff_id, media_path, tools";
const BASE = "id, customer_id, booking_id, direction, body, status, template_key, created_at";

export type DockSnapshot = {
  threads: InboxThread[];
  templates: { key: string; label: string }[];
  previewBlocked: boolean;
};

export function emptyDockSnapshot(): DockSnapshot {
  return { threads: [], templates: approvedManualTemplates(), previewBlocked: isVercelPreview() };
}

export async function loadDockSnapshot(): Promise<DockSnapshot> {
  try {
    const admin = createServiceClient();
    const folded = await foldRows(admin, null);
    return { threads: folded.threads, templates: approvedManualTemplates(), previewBlocked: isVercelPreview() };
  } catch (err) {
    console.error("[whatsapp-dock]", err instanceof Error ? err.message : "lecture");
    return emptyDockSnapshot();
  }
}

export async function loadDockThread(fil: string): Promise<{ messages: InboxMessage[]; windowOpen: boolean }> {
  const admin = createServiceClient();
  const folded = await foldRows(admin, fil);
  const lastInbound = [...folded.messages]
    .filter((row) => row.direction === "inbound")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return { messages: folded.messages, windowOpen: sessionWindowOpenNow(lastInbound?.createdAt || null) };
}

async function foldRows(admin: ReturnType<typeof createServiceClient>, fil: string | null) {
  const loaded = await admin.from("crm_whatsapp_messages").select(RICH).order("created_at", { ascending: false }).limit(400);
  const rows = (
    loaded.error
      ? ((await admin.from("crm_whatsapp_messages").select(BASE).order("created_at", { ascending: false }).limit(400)).data || [])
      : loaded.data || []
  ) as RawMessage[];
  const customerIds = [...new Set(rows.map((row) => row.customer_id).filter(Boolean))] as string[];
  const bookingIds = [...new Set(rows.map((row) => row.booking_id).filter(Boolean))] as string[];
  const staffIds = [...new Set(rows.map((row) => row.author_staff_id).filter(Boolean))] as string[];
  const [customers, bookings, staff, threads, requests] = await Promise.all([
    customerIds.length
      ? admin.from("crm_customers").select("id, first_name, last_name, phone").in("id", customerIds)
      : Promise.resolve({ data: [] }),
    bookingIds.length
      ? admin.from("crm_bookings").select("id, reference, title, destination").in("id", bookingIds)
      : Promise.resolve({ data: [] }),
    staffIds.length ? admin.from("crm_staff").select("id, full_name").in("id", staffIds) : Promise.resolve({ data: [] }),
    admin.from("crm_whatsapp_threads").select("phone, paused_until, staff_read_at, customer_id"),
    admin.from("crm_whatsapp_requests").select("id, phone, message_id, status").eq("status", "open"),
  ]);
  const names = new Map(
    ((customers.data || []) as { id: string; first_name: string | null; last_name: string | null; phone: string | null }[]).map((row) => [
      row.id,
      { name: [row.first_name, row.last_name].filter(Boolean).join(" "), phone: row.phone },
    ])
  );
  const stays = new Map(
    ((bookings.data || []) as { id: string; reference: string; title: string | null; destination: string | null }[]).map((row) => [
      row.id,
      `${row.reference}${stayDestinationLine(row) ? ` · ${stayDestinationLine(row)}` : ""}`,
    ])
  );
  const agents = new Map(((staff.data || []) as { id: string; full_name: string | null }[]).map((row) => [row.id, row.full_name || "L’agence"]));
  const openRequests = ((requests.error ? [] : requests.data || []) as { id: string; phone: string | null; message_id: string | null }[]);
  const requestByMessage = new Map(openRequests.filter((row) => row.message_id).map((row) => [row.message_id as string, row.id]));
  const messages: InboxMessage[] = rows.map((row) => {
    const customer = row.customer_id ? names.get(row.customer_id) : null;
    return {
      id: row.id,
      phone: row.phone || customer?.phone || null,
      customerId: row.customer_id,
      customerName: customer?.name || null,
      bookingId: row.booking_id,
      bookingReference: row.booking_id ? stays.get(row.booking_id) || null : null,
      direction: row.direction === "inbound" ? "inbound" : "outbound",
      body: row.body,
      createdAt: row.created_at,
      status: row.status,
      templateKey: row.template_key,
      authorName: row.author_staff_id ? agents.get(row.author_staff_id) || "L’agence" : null,
      mediaPath: row.media_path || null,
      tools: Array.isArray(row.tools) ? row.tools : [],
      requestId: requestByMessage.get(row.id) || null,
    };
  });
  const threadRows = threads.error
    ? []
    : ((threads.data || []) as { phone: string; paused_until: string | null; staff_read_at?: string | null }[]);
  const paused = threadRows.filter((row) => pauseStillActive(row.paused_until)).map((row) => row.phone);
  const readAt: Record<string, string | null> = {};
  for (const row of threadRows) {
    if (row.staff_read_at) readAt[row.phone] = row.staff_read_at;
  }
  const escalated = openRequests.map((row) => row.phone).filter(Boolean) as string[];
  const folded = foldThreads(messages, { paused, escalated, readAt });
  if (!fil) return { threads: folded, messages: [] as InboxMessage[] };
  const mine = messages
    .filter((row) => threadKey(row) === fil)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { threads: folded.filter((row) => row.key === fil), messages: mine };
}
