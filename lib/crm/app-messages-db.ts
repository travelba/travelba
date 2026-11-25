import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";
import {
  AppMessagesUnavailable,
  inboxOrder,
  type MessageDb,
  type MessageRow,
  type ThreadRow,
} from "@/lib/crm/app-messages";

type DbError = { code?: string; message?: string } | null;

function missing(error: DbError) {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

function throwIfMissing(error: DbError) {
  if (missing(error)) throw new AppMessagesUnavailable();
  if (error) throw new Error(error.code || "messages");
}

function threadOf(row: Record<string, unknown>): ThreadRow {
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    bookingId: typeof row.booking_id === "string" ? row.booking_id : null,
    customerUnread: Number(row.customer_unread) || 0,
    agencyUnread: Number(row.agency_unread) || 0,
    lastMessageAt: typeof row.last_message_at === "string" ? row.last_message_at : null,
    lastPreview: typeof row.last_preview === "string" ? row.last_preview : null,
  };
}

function messageOf(row: Record<string, unknown>): MessageRow {
  return {
    id: String(row.id),
    threadId: String(row.thread_id),
    customerId: String(row.customer_id),
    authorKind: row.author_kind === "agency" ? "agency" : "customer",
    authorStaffId: typeof row.author_staff_id === "string" ? row.author_staff_id : null,
    body: typeof row.body === "string" ? row.body : "",
    attachmentPath: typeof row.attachment_path === "string" ? row.attachment_path : null,
    attachmentName: typeof row.attachment_name === "string" ? row.attachment_name : null,
    attachmentMime: typeof row.attachment_mime === "string" ? row.attachment_mime : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : "",
    readAt: typeof row.read_at === "string" ? row.read_at : null,
  };
}

function threadWrite(row: ThreadRow) {
  return {
    id: row.id,
    customer_id: row.customerId,
    booking_id: row.bookingId,
    customer_unread: row.customerUnread,
    agency_unread: row.agencyUnread,
    last_message_at: row.lastMessageAt,
    last_preview: row.lastPreview,
    updated_at: new Date().toISOString(),
  };
}

/** Adaptateur service role. La RLS reste la seconde garde : le client n’écrit pas tout seul. */
export function appMessageDb(): MessageDb {
  const admin = createServiceClient();
  return {
    async threadByCustomer(customerId) {
      const { data, error } = await admin.from("crm_app_threads").select("*").eq("customer_id", customerId).maybeSingle();
      throwIfMissing(error);
      return data ? threadOf(data as Record<string, unknown>) : null;
    },
    async threadById(id) {
      const { data, error } = await admin.from("crm_app_threads").select("*").eq("id", id).maybeSingle();
      throwIfMissing(error);
      return data ? threadOf(data as Record<string, unknown>) : null;
    },
    async insertThread(row) {
      const { data, error } = await admin.from("crm_app_threads").insert(threadWrite(row)).select("*").maybeSingle();
      if (error?.code === "23505") {
        const existing = await admin.from("crm_app_threads").select("*").eq("customer_id", row.customerId).maybeSingle();
        throwIfMissing(existing.error);
        if (existing.data) return threadOf(existing.data as Record<string, unknown>);
      }
      throwIfMissing(error);
      return data ? threadOf(data as Record<string, unknown>) : row;
    },
    async saveThread(row) {
      const { error } = await admin.from("crm_app_threads").update(threadWrite(row)).eq("id", row.id);
      throwIfMissing(error);
    },
    async listMessages(threadId) {
      const { data, error } = await admin
        .from("crm_app_messages")
        .select("*")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true })
        .limit(200);
      throwIfMissing(error);
      return ((data || []) as Record<string, unknown>[]).map(messageOf);
    },
    async insertMessage(row) {
      const { error } = await admin.from("crm_app_messages").insert({
        id: row.id,
        thread_id: row.threadId,
        customer_id: row.customerId,
        author_kind: row.authorKind,
        author_staff_id: row.authorStaffId,
        body: row.body,
        attachment_path: row.attachmentPath,
        attachment_name: row.attachmentName,
        attachment_mime: row.attachmentMime,
        created_at: row.createdAt,
        read_at: row.readAt,
      });
      throwIfMissing(error);
      return row;
    },
    async saveMessages(rows) {
      for (const row of rows) {
        const { error } = await admin.from("crm_app_messages").update({ read_at: row.readAt }).eq("id", row.id);
        throwIfMissing(error);
      }
    },
    async listThreads() {
      const { data, error } = await admin
        .from("crm_app_threads")
        .select("*")
        .order("agency_unread", { ascending: false })
        .order("last_message_at", { ascending: false })
        .limit(80);
      throwIfMissing(error);
      return inboxOrder(((data || []) as Record<string, unknown>[]).map(threadOf));
    },
  };
}
