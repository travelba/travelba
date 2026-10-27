import type { SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { toAuditRow } from "./audit-events";
import {
  boardingPassChannelBlock,
  boardingPassContentVariables,
  boardingPassDedupeKey,
  boardingPassFields,
  boardingPassFileName,
  boardingPassJournal,
  boardingPassPreview,
  boardingPassUnapprovedMessage,
  BOARDING_PASS_TEMPLATE_ENV,
  isBoardingPassFile,
  suggestBoardingPass,
} from "./boarding-pass-whatsapp";
import { boardingPassSignedPath } from "./boarding-pass-link";
import { McpWriteError } from "./mcp-write";
import { resolveContentSid, whatsappContentApproved } from "./twilio-content-sid";
import type { CrmBookingItem } from "./types";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendContentTemplate, type WhatsappSendResult } from "./whatsapp";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEMPLATE = "carte_embarquement" as const;
const DONE = new Set(["sent", "delivered", "read"]);

type MessageRow = {
  id: string;
  status?: string | null;
  twilio_sid?: string | null;
  dedupe_key?: string | null;
  template_key?: string | null;
  payload?: { document_id?: string } | null;
};

export type BoardingPassNotice = {
  document_id: string;
  dossier_id: string;
  reference: string | null;
  notifie: boolean;
  deja_envoye: boolean;
  statut: "envoye" | "deja_envoye" | "en_cours";
  modele: typeof TEMPLATE;
  raison: string | null;
};

export type BoardingPassNotifyDeps = {
  resolveSid?: (envName: string) => Promise<string>;
  approved?: (sid: string) => Promise<boolean>;
  send?: (input: {
    phone: string | null | undefined;
    contentSid: string;
    variables: Record<string, string> | null;
  }) => Promise<WhatsappSendResult>;
};

function client(admin?: SupabaseClient) {
  if (admin) return admin;
  if (typeof globalThis.WebSocket !== "function") {
    globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
  }
  return createServiceClient();
}

function documentIdOf(value: unknown) {
  const id = typeof value === "string" ? value.trim() : "";
  if (!UUID.test(id)) throw new McpWriteError("Document invalide.");
  return id;
}

function payloadDocument(row: MessageRow) {
  const payload = row.payload;
  if (!payload || typeof payload !== "object") return "";
  return typeof payload.document_id === "string" ? payload.document_id : "";
}

function sameDocument(row: MessageRow, documentId: string) {
  if (row.dedupe_key === boardingPassDedupeKey(documentId)) return true;
  const template = row.template_key || "";
  return payloadDocument(row) === documentId && (template === TEMPLATE || template === "cartes_embarquement");
}

function quiet(documentId: string, dossierId: string, reference: string | null, statut: BoardingPassNotice["statut"], raison: string): BoardingPassNotice {
  return {
    document_id: documentId,
    dossier_id: dossierId,
    reference,
    notifie: false,
    deja_envoye: statut === "deja_envoye",
    statut,
    modele: TEMPLATE,
    raison,
  };
}

/**
 * Envoie au client du dossier le PDF déjà déposé, via le modèle carte_embarquement.
 * Un envoi déjà parti, ou une file encore ouverte pour ce document, ne repart pas.
 */
export async function notifyBoardingPass(
  input: Record<string, unknown>,
  admin?: SupabaseClient,
  deps?: BoardingPassNotifyDeps
): Promise<BoardingPassNotice> {
  const documentId = documentIdOf(input.document_id);
  const db = client(admin);
  const { data: doc, error: docError } = await db
    .from("crm_booking_documents")
    .select("id, booking_id, booking_item_id, kind, mime_type, file_name, storage_path")
    .eq("id", documentId)
    .maybeSingle();
  if (docError) throw new McpWriteError("Document introuvable.");
  if (!doc || !isBoardingPassFile(doc) || !doc.storage_path) {
    throw new McpWriteError("La pièce n’est pas une carte d’embarquement PDF de ce dossier.");
  }
  const bookingId = String(doc.booking_id || "");
  const { data: booking, error: bookingError } = await db
    .from("crm_bookings")
    .select("id, customer_id, reference")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError || !booking) throw new McpWriteError("Dossier introuvable.");
  const customerId = String(booking.customer_id || "");
  const reference = typeof booking.reference === "string" ? booking.reference : null;
  const { data: customer, error: customerError } = await db
    .from("crm_customers")
    .select("id, phone, auth_user_id, whatsapp_opt_in_at, whatsapp_opt_out_at")
    .eq("id", customerId)
    .maybeSingle();
  if (customerError || !customer) throw new McpWriteError("Client introuvable.");
  const block = boardingPassChannelBlock({
    phone: typeof customer.phone === "string" ? customer.phone : null,
    optInAt: typeof customer.whatsapp_opt_in_at === "string" ? customer.whatsapp_opt_in_at : null,
    optOutAt: typeof customer.whatsapp_opt_out_at === "string" ? customer.whatsapp_opt_out_at : null,
  });
  if (block) throw new McpWriteError(block);

  const { data: itemRows } = await db.from("crm_booking_items").select("*").eq("booking_id", bookingId);
  const { data: travelerRows } = await db
    .from("crm_booking_travelers")
    .select("first_name, last_name")
    .eq("booking_id", bookingId);
  const fields = boardingPassFields(
    suggestBoardingPass({
      doc,
      items: (itemRows || []) as CrmBookingItem[],
      travelers: (travelerRows || []) as { first_name?: string | null; last_name?: string | null }[],
    })
  );
  if (!fields) {
    throw new McpWriteError("Le prénom, le nom, le vol, le trajet, l’horaire ou le siège manque sur la carte. Rien n’est inventé.");
  }
  const filename = boardingPassFileName(fields);
  const preview = boardingPassPreview(TEMPLATE, fields);
  if (!filename || !preview) throw new McpWriteError("Le nom du fichier PDF n’a pas pu être préparé.");

  const { data: messageRows, error: messageError } = await db
    .from("crm_whatsapp_messages")
    .select("id, status, twilio_sid, dedupe_key, template_key, payload")
    .eq("booking_id", bookingId);
  if (messageError) throw new McpWriteError("Envoi impossible.");
  const same = ((messageRows || []) as MessageRow[]).filter((row) => sameDocument(row, documentId));
  const done = same.find((row) => Boolean(row.twilio_sid) || DONE.has(String(row.status || "")));
  if (done) return quiet(documentId, bookingId, reference, "deja_envoye", "Cette carte d’embarquement a déjà été envoyée.");
  const key = boardingPassDedupeKey(documentId);
  const pending = same.find((row) => row.dedupe_key === key && row.status === "queued");
  if (pending) return quiet(documentId, bookingId, reference, "en_cours", "Un envoi de cette carte est déjà en cours.");

  const resolveSid = deps?.resolveSid ?? ((envName: string) => resolveContentSid(envName));
  const approved = deps?.approved ?? ((sid: string) => whatsappContentApproved(sid));
  const contentSid = (await resolveSid(BOARDING_PASS_TEMPLATE_ENV.carte_embarquement)).trim();
  if (!contentSid || !(await approved(contentSid))) throw new McpWriteError(boardingPassUnapprovedMessage());

  const failed = same.find((row) => row.dedupe_key === key && row.status === "failed");
  let messageId = failed?.id || "";
  if (failed) {
    const updated = await db
      .from("crm_whatsapp_messages")
      .update({ status: "queued", error: null, body: preview, template_key: TEMPLATE })
      .eq("id", failed.id);
    if (updated.error) throw new McpWriteError("Envoi impossible.");
  } else {
    const inserted = await db
      .from("crm_whatsapp_messages")
      .insert({
        customer_id: customerId,
        booking_id: bookingId,
        dedupe_key: key,
        direction: "outbound",
        template_key: TEMPLATE,
        body: preview,
        payload: { document_id: documentId },
        status: "queued",
      })
      .select("id")
      .single();
    if (inserted.error) {
      if (inserted.error.code === "23505") {
        return quiet(documentId, bookingId, reference, "en_cours", "Un envoi de cette carte est déjà en cours.");
      }
      throw new McpWriteError("Envoi impossible.");
    }
    messageId = String(inserted.data?.id || "");
  }
  if (!messageId) throw new McpWriteError("Envoi impossible.");

  const mediaPath = boardingPassSignedPath(documentId, filename);
  const variables = mediaPath ? boardingPassContentVariables(mediaPath, fields) : null;
  if (!variables) {
    await db.from("crm_whatsapp_messages").update({ status: "failed", error: "pdf" }).eq("id", messageId);
    throw new McpWriteError("L’adresse du PDF n’a pas pu être signée.");
  }
  const send = deps?.send ?? sendContentTemplate;
  const result = await send({ phone: typeof customer.phone === "string" ? customer.phone : null, contentSid, variables });
  if (!result.ok) {
    await db
      .from("crm_whatsapp_messages")
      .update({ status: "failed", error: result.reason })
      .eq("id", messageId);
    throw new McpWriteError(result.reason === "rejected" ? "WhatsApp a refusé le message." : "WhatsApp n’est pas configuré.");
  }

  await db
    .from("crm_whatsapp_messages")
    .update({ status: "sent", twilio_sid: result.sid, error: null })
    .eq("id", messageId);
  const noted = boardingPassJournal({
    names: [fields.firstName],
    flight: fields.flight,
    route: fields.route,
    count: 1,
  });
  const activity = await db.from("crm_customer_activity").insert({
    customer_id: customerId,
    auth_user_id: typeof customer.auth_user_id === "string" ? customer.auth_user_id : null,
    action: noted.action,
    summary: noted.summary,
    detail: noted.detail,
    booking_id: bookingId,
  });
  if (activity.error) console.error("[carte-embarquement] journal", activity.error.code ?? "?");
  const audit = await db.from("crm_audit_events").insert(
    toAuditRow({
      actorKind: "auto",
      action: noted.action,
      bookingId,
      customerId,
      summary: noted.summary,
      detail: noted.detail ? { route: noted.detail } : {},
    })
  );
  if (audit.error) console.error("[carte-embarquement] audit", audit.error.code ?? "?");

  return {
    document_id: documentId,
    dossier_id: bookingId,
    reference,
    notifie: true,
    deja_envoye: false,
    statut: "envoye",
    modele: TEMPLATE,
    raison: null,
  };
}
