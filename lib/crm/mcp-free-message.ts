import type { SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { createServiceClient } from "@/lib/supabase/admin";
import { currentMcpAccess } from "./mcp-auth";
import { McpWriteError } from "./mcp-write";
import { toE164 } from "./phone";
import { nextParisMorning } from "./whatsapp-takeover";
import { whatsappContentApproved } from "./twilio-content-sid";
import { resolveAgencyContentSid } from "./agency-templates-arm";
import { isContentSid, type ContentSidStore } from "./whatsapp-content-sid-store";
import { loadFreeMessageDocument } from "./free-message-file";
import {
  deliverFreeMessage,
  freeMessageChannelBlock,
  freeMessagePreviewBlocked,
  planFreeMessage,
} from "./free-message-send";
import { FREE_MESSAGE_TEMPLATE_ENV, type FreeMessageTemplate } from "./free-message-whatsapp";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 24 * 60 * 60 * 1000;

function client(admin?: SupabaseClient) {
  if (admin) return admin;
  if (typeof globalThis.WebSocket !== "function") {
    globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
  }
  return createServiceClient();
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function uuid(value: string, label: string) {
  if (!UUID.test(value)) throw new McpWriteError(`${label} invalide.`);
  return value;
}

type BookingRow = { id: string; reference: string | null; customer_id: string };
type CustomerRow = {
  id: string;
  first_name: string | null;
  phone: string | null;
  whatsapp_opt_in_at: string | null;
  whatsapp_opt_out_at: string | null;
};

async function loadBooking(db: SupabaseClient, input: Record<string, unknown>) {
  const id = text(input.dossier_id);
  const reference = text(input.reference);
  if (!id && !reference) return null;
  if (id) uuid(id, "Dossier");
  let query = db.from("crm_bookings").select("id, reference, customer_id");
  query = id ? query.eq("id", id) : query.eq("reference", reference);
  const { data, error } = await query.limit(2);
  if (error) throw new McpWriteError("Dossier introuvable.");
  const rows = (data || []) as BookingRow[];
  if (!rows.length) throw new McpWriteError("Dossier introuvable.");
  if (rows.length > 1) throw new McpWriteError("Plusieurs dossiers portent cette référence. Indiquez l’identifiant.");
  return rows[0];
}

async function loadCustomer(db: SupabaseClient, customerId: string) {
  const { data, error } = await db
    .from("crm_customers")
    .select("id, first_name, phone, whatsapp_opt_in_at, whatsapp_opt_out_at")
    .eq("id", customerId)
    .maybeSingle();
  if (error || !data) throw new McpWriteError("Client introuvable.");
  return data as CustomerRow;
}

async function windowOpen(db: SupabaseClient, customerId: string, phone: string | null, now: Date) {
  const since = new Date(now.getTime() - DAY_MS).toISOString();
  const byCustomer = await db
    .from("crm_whatsapp_messages")
    .select("id")
    .eq("customer_id", customerId)
    .eq("direction", "inbound")
    .gte("created_at", since)
    .limit(1);
  if (!byCustomer.error && (byCustomer.data || []).length > 0) return true;
  if (!phone) return false;
  const byPhone = await db
    .from("crm_whatsapp_messages")
    .select("id")
    .eq("phone", phone)
    .eq("direction", "inbound")
    .gte("created_at", since)
    .limit(1);
  if (byPhone.error) return false;
  return (byPhone.data || []).length > 0;
}

async function templateReady(
  template: FreeMessageTemplate,
  fetchImpl: typeof fetch,
  store: ContentSidStore | undefined,
  approved: (sid: string) => Promise<boolean>
) {
  const env = FREE_MESSAGE_TEMPLATE_ENV[template];
  const sid = await resolveAgencyContentSid(env, fetchImpl, store);
  if (!isContentSid(sid)) return { sid: null, ready: false };
  return { sid, ready: await approved(sid) };
}

/**
 * Message WhatsApp libre. Sans `confirmer`, aperçu seulement.
 * Fenêtre de 24 h : le texte part tel quel. Hors fenêtre : le modèle message_libre.
 */
export async function envoyerMessageLibre(
  input: Record<string, unknown>,
  admin?: SupabaseClient,
  deps?: {
    fetchImpl?: typeof fetch;
    store?: ContentSidStore;
    now?: Date;
    approved?: (sid: string) => Promise<boolean>;
    sendSession?: (message: { to: string; body: string; mediaUrl?: string | null }) => Promise<{ ok: true; sid: string } | { ok: false; detail?: string }>;
    sendTemplate?: (message: { phone: string; contentSid: string; variables: Record<string, string> }) => Promise<
      { ok: true; sid: string } | { ok: false; detail?: string }
    >;
  }
) {
  const db = client(admin);
  const clientId = text(input.client_id) || text(input.customer_id);
  if (clientId) uuid(clientId, "Client");
  const booking = await loadBooking(db, input);
  if (!clientId && !booking) throw new McpWriteError("Indiquez le client ou le dossier.");
  if (clientId && booking && booking.customer_id !== clientId) {
    throw new McpWriteError("Ce dossier n’est pas sur ce client.");
  }
  const customer = await loadCustomer(db, clientId || booking!.customer_id);
  const documentId = text(input.document_id);
  let file: Awaited<ReturnType<typeof loadFreeMessageDocument>> = null;
  if (documentId) {
    uuid(documentId, "Pièce");
    file = await loadFreeMessageDocument(db, documentId);
    if (!file?.storagePath) throw new McpWriteError("Pièce introuvable.");
    if (file.customerId !== customer.id) throw new McpWriteError("Cette pièce n’est pas sur ce client.");
    if (booking && file.bookingId && file.bookingId !== booking.id) throw new McpWriteError("Cette pièce n’est pas sur ce dossier.");
  }

  const now = deps?.now ?? new Date();
  const phone = toE164(customer.phone || "", "FR") || null;
  const open = await windowOpen(db, customer.id, phone, now);
  const message = typeof input.texte === "string" ? input.texte : "";
  const planned = planFreeMessage({
    windowOpen: open,
    text: message,
    firstName: customer.first_name,
    file: file
      ? { id: file.id, mime: file.mime, fileName: file.fileName, docType: file.docType }
      : null,
  });
  if (!planned.ok) throw new McpWriteError(planned.error);

  const fetchImpl = deps?.fetchImpl ?? fetch;
  const approve = deps?.approved ?? ((sid: string) => whatsappContentApproved(sid, fetchImpl));
  let contentSid: string | null = null;
  let ready = planned.plan.canal === "session";
  if (planned.plan.modele) {
    const resolved = await templateReady(planned.plan.modele, fetchImpl, deps?.store, approve);
    contentSid = resolved.sid;
    ready = resolved.ready;
  }

  const piece = file ? { id: file.id, fichier: file.fileName } : null;
  const base = {
    client_id: customer.id,
    dossier_id: booking?.id || file?.bookingId || null,
    reference: booking?.reference || null,
    prenom: customer.first_name,
    canal: planned.plan.canal,
    fenetre_24h: open,
    modele: planned.plan.modele,
    modele_pret: ready,
    texte: planned.plan.texte,
    piece,
  };

  if (input.confirmer !== true) {
    const block = freeMessageChannelBlock({
      phone,
      optInAt: customer.whatsapp_opt_in_at,
      optOutAt: customer.whatsapp_opt_out_at,
      windowOpen: open,
      modele: planned.plan.modele,
      templateReady: ready,
      previewBlocked: false,
    });
    return {
      ...base,
      ok: true,
      apercu: true,
      envoye: false,
      twilio_sid: null,
      message: block || "Rien n’a été envoyé. confirmer true pour envoyer.",
    };
  }

  const block = freeMessageChannelBlock({
    phone,
    optInAt: customer.whatsapp_opt_in_at,
    optOutAt: customer.whatsapp_opt_out_at,
    windowOpen: open,
    modele: planned.plan.modele,
    templateReady: ready,
    previewBlocked: freeMessagePreviewBlocked(),
  });
  if (block) throw new McpWriteError(block);
  if (!phone) throw new McpWriteError("Pas de téléphone pour WhatsApp.");

  const dedupe = `message-libre:${customer.id}:${now.getTime()}`;
  const staff = currentMcpAccess().staff;
  const inserted = await db
    .from("crm_whatsapp_messages")
    .insert({
      customer_id: customer.id,
      booking_id: booking?.id || file?.bookingId || null,
      dedupe_key: dedupe,
      direction: "outbound",
      template_key: planned.plan.modele || "message_libre_session",
      body: planned.plan.texte,
      status: "queued",
      phone,
      author_staff_id: staff?.id || null,
      media_path: file?.storagePath || null,
      payload: { actor: currentMcpAccess().actor },
    })
    .select("id")
    .maybeSingle();
  if (inserted.error || !inserted.data) throw new McpWriteError("Le message n’a pas pu être enregistré. Rien n’a été envoyé.");
  const rowId = String((inserted.data as { id: string }).id);

  const sent = await deliverFreeMessage(
    {
      phone,
      windowOpen: open,
      text: message,
      firstName: customer.first_name,
      file: file ? { id: file.id, mime: file.mime, fileName: file.fileName, docType: file.docType } : null,
      contentSid,
      now: now.getTime(),
    },
    { sendSession: deps?.sendSession, sendTemplate: deps?.sendTemplate }
  );
  if (!sent.ok) {
    await db.from("crm_whatsapp_messages").update({ status: "failed", error: sent.error }).eq("id", rowId);
    throw new McpWriteError(sent.error);
  }
  await db.from("crm_whatsapp_messages").update({ status: "sent", twilio_sid: sent.sid, error: null }).eq("id", rowId);
  if (phone) {
    const paused = await db.from("crm_whatsapp_threads").upsert({
      phone,
      customer_id: customer.id,
      paused_at: now.toISOString(),
      paused_until: nextParisMorning(now).toISOString(),
      paused_by: staff?.id || null,
      updated_at: now.toISOString(),
    });
    if (paused.error) console.error("[message-libre] pause", paused.error.code || "error");
  }
  return {
    ...base,
    ok: true,
    apercu: false,
    envoye: true,
    modele_pret: true,
    twilio_sid: sent.sid,
    message: "Message envoyé.",
  };
}
