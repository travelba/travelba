import { randomUUID } from "node:crypto";

export const MESSAGE_MAX = 4000;
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class AppMessagesUnavailable extends Error {
  constructor() {
    super("schema");
    this.name = "AppMessagesUnavailable";
  }
}

export type ThreadRow = {
  id: string;
  customerId: string;
  bookingId: string | null;
  customerUnread: number;
  agencyUnread: number;
  lastMessageAt: string | null;
  lastPreview: string | null;
};

export type MessageRow = {
  id: string;
  threadId: string;
  customerId: string;
  authorKind: "customer" | "agency";
  authorStaffId: string | null;
  body: string;
  attachmentPath: string | null;
  attachmentName: string | null;
  attachmentMime: string | null;
  createdAt: string;
  readAt: string | null;
};

export type MessageDb = {
  threadByCustomer(customerId: string): Promise<ThreadRow | null>;
  threadById(id: string): Promise<ThreadRow | null>;
  insertThread(row: ThreadRow): Promise<ThreadRow>;
  saveThread(row: ThreadRow): Promise<void>;
  listMessages(threadId: string): Promise<MessageRow[]>;
  insertMessage(row: MessageRow): Promise<MessageRow>;
  saveMessages(rows: MessageRow[]): Promise<void>;
  listThreads(): Promise<ThreadRow[]>;
};

export function clipBody(raw: string) {
  const text = raw.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").trim();
  if (text.length > MESSAGE_MAX) return { ok: false as const, error: "Le message est trop long." };
  return { ok: true as const, text };
}

export function messagePreview(text: string, photo: boolean) {
  const clean = text.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  if (clean) return clean.slice(0, 140);
  return photo ? "Photo" : "";
}

export function agencyReplyPush(preview: string) {
  const body = preview.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);
  return { title: "Message de l’agence", body: body || "L’agence vous a écrit." };
}

export function agencyMessageNotice(input: { name: string; preview: string }) {
  const who = input.name.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Un client";
  const preview = input.preview.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 140) || "Photo";
  return {
    subject: "Message dans l’application",
    text: `${who} a écrit dans l’application. ${preview}`,
  };
}

/** JPEG, PNG ou WebP, par l’en-tête du fichier. Le type annoncé seul ne suffit pas. */
export function sniffPhoto(bytes: Uint8Array, claimed: string) {
  if (bytes.byteLength < 12 || bytes.byteLength > PHOTO_MAX_BYTES) return null;
  const mime = claimed.split(";")[0].trim().toLowerCase();
  if (mime.startsWith("text/") || mime === "application/pdf") return null;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const webp =
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;
  if (jpeg) return "image/jpeg" as const;
  if (png) return "image/png" as const;
  if (webp) return "image/webp" as const;
  if (mime) return null;
  return null;
}

export function messageFilePath(customerId: string, messageId: string, mime: string) {
  if (!UUID.test(customerId) || !UUID.test(messageId)) return null;
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : mime === "image/jpeg" ? "jpg" : "";
  if (!ext) return null;
  return `customers/${customerId}/messages/${messageId}.${ext}`;
}

export function ownsAttachment(customerId: string, path: string | null) {
  if (!path) return true;
  const prefix = `customers/${customerId}/messages/`;
  return path.startsWith(prefix) && !path.includes("..") && !path.slice(prefix.length).includes("/");
}

export function canReadThread(viewer: { kind: "customer" | "staff"; customerId: string }, thread: { customerId: string }) {
  if (viewer.kind === "staff") return true;
  return viewer.customerId === thread.customerId;
}

function emptyThread(customerId: string, id: string, at: string): ThreadRow {
  return {
    id,
    customerId,
    bookingId: null,
    customerUnread: 0,
    agencyUnread: 0,
    lastMessageAt: at,
    lastPreview: null,
  };
}

async function touch(db: MessageDb, thread: ThreadRow, preview: string, at: string, bookingId: string | null, author: "customer" | "agency") {
  thread.lastMessageAt = at;
  thread.lastPreview = preview || thread.lastPreview;
  if (bookingId) thread.bookingId = bookingId;
  if (author === "customer") thread.agencyUnread += 1;
  else thread.customerUnread += 1;
  await db.saveThread(thread);
}

export async function postCustomerMessage(
  db: MessageDb,
  input: {
    customerId: string;
    body: string;
    bookingId?: string | null;
    attachmentPath?: string | null;
    attachmentName?: string | null;
    attachmentMime?: string | null;
    messageId?: string;
    now?: Date;
  }
) {
  const clipped = clipBody(input.body || "");
  if (!clipped.ok) return { ok: false as const, error: clipped.error };
  const photo = Boolean(input.attachmentPath);
  if (!clipped.text && !photo) return { ok: false as const, error: "Écrivez un message ou joignez une photo." };
  if (!ownsAttachment(input.customerId, input.attachmentPath || null)) {
    return { ok: false as const, error: "La photo n’a pas pu être jointe." };
  }
  const now = input.now || new Date();
  const at = now.toISOString();
  let thread = await db.threadByCustomer(input.customerId);
  if (!thread) {
    thread = emptyThread(input.customerId, randomUUID(), at);
    thread = await db.insertThread(thread);
  }
  const preview = messagePreview(clipped.text, photo);
  const message: MessageRow = {
    id: input.messageId && UUID.test(input.messageId) ? input.messageId : randomUUID(),
    threadId: thread.id,
    customerId: input.customerId,
    authorKind: "customer",
    authorStaffId: null,
    body: clipped.text,
    attachmentPath: input.attachmentPath || null,
    attachmentName: photo ? (input.attachmentName || "photo").slice(0, 120) : null,
    attachmentMime: input.attachmentMime || null,
    createdAt: at,
    readAt: null,
  };
  await db.insertMessage(message);
  await touch(db, thread, preview, at, input.bookingId || null, "customer");
  return { ok: true as const, thread, message, preview };
}

export async function postAgencyReply(
  db: MessageDb,
  input: { threadId: string; staffId: string | null; body: string; now?: Date }
) {
  if (!UUID.test(input.threadId)) return { ok: false as const, error: "Fil introuvable." };
  if (input.staffId && !UUID.test(input.staffId)) return { ok: false as const, error: "Fil introuvable." };
  const thread = await db.threadById(input.threadId);
  if (!thread) return { ok: false as const, error: "Fil introuvable." };
  const clipped = clipBody(input.body || "");
  if (!clipped.ok) return { ok: false as const, error: clipped.error };
  if (!clipped.text) return { ok: false as const, error: "Écrivez une réponse." };
  const now = input.now || new Date();
  const at = now.toISOString();
  const preview = messagePreview(clipped.text, false);
  const message: MessageRow = {
    id: randomUUID(),
    threadId: thread.id,
    customerId: thread.customerId,
    authorKind: "agency",
    authorStaffId: input.staffId,
    body: clipped.text,
    attachmentPath: null,
    attachmentName: null,
    attachmentMime: null,
    createdAt: at,
    readAt: null,
  };
  await db.insertMessage(message);
  await touch(db, thread, preview, at, null, "agency");
  return { ok: true as const, thread, message, preview };
}

async function mark(db: MessageDb, thread: ThreadRow, author: "customer" | "agency", at: string) {
  const rows = await db.listMessages(thread.id);
  const pending = rows.filter((row) => row.authorKind === author && !row.readAt);
  for (const row of pending) row.readAt = at;
  if (pending.length) await db.saveMessages(pending);
  if (author === "agency") thread.customerUnread = 0;
  else thread.agencyUnread = 0;
  await db.saveThread(thread);
  return rows;
}

/** Le client ouvre son fil et marque les réponses de l’agence comme lues. */
export async function openCustomerThread(db: MessageDb, customerId: string, now = new Date()) {
  const thread = await db.threadByCustomer(customerId);
  if (!thread) return { thread: null, messages: [] as MessageRow[] };
  if (!canReadThread({ kind: "customer", customerId }, thread)) return { thread: null, messages: [] as MessageRow[] };
  const messages = await mark(db, thread, "agency", now.toISOString());
  return { thread, messages };
}

/** Lecture sans accusé. L’aperçu MCP ne marque pas le fil comme lu. */
export async function peekThread(db: MessageDb, threadId: string) {
  if (!UUID.test(threadId)) return null;
  const thread = await db.threadById(threadId);
  if (!thread) return null;
  return { thread, messages: await db.listMessages(thread.id) };
}

/** L’agence ouvre un fil et marque les messages du client comme lus. */
export async function openStaffThread(db: MessageDb, threadId: string, now = new Date()) {
  if (!UUID.test(threadId)) return null;
  const thread = await db.threadById(threadId);
  if (!thread || !canReadThread({ kind: "staff", customerId: "" }, thread)) return null;
  const messages = await mark(db, thread, "customer", now.toISOString());
  return { thread, messages };
}

export async function customerUnreadCount(db: MessageDb, customerId: string) {
  const thread = await db.threadByCustomer(customerId);
  if (!thread || !canReadThread({ kind: "customer", customerId }, thread)) return 0;
  return thread.customerUnread;
}

export function inboxOrder(rows: ThreadRow[]) {
  return [...rows].sort((a, b) => {
    const unread = Number(b.agencyUnread > 0) - Number(a.agencyUnread > 0);
    if (unread) return unread;
    return (b.lastMessageAt || "").localeCompare(a.lastMessageAt || "");
  });
}
