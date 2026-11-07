import type { SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { toAuditRow } from "./audit-events";
import { freeMessageSignedPath } from "./free-message-link";
import {
  FREE_MESSAGE_TEMPLATE,
  FREE_MESSAGE_TEMPLATE_ENV,
  freeMessageContentVariables,
  freeMessageDedupeKey,
  freeMessageFileName,
  freeMessagePendingMessage,
  freeMessagePreview,
  freeMessageText,
  isPdfDocument,
} from "./free-message-whatsapp";
import { McpWriteError } from "./mcp-write";
import { toE164 } from "./phone";
import { productionOnlySecret } from "./preview-secrets";
import { whatsappContentApproved } from "./twilio-content-sid";
import { isContentSid, serviceContentSidStore, type ContentSidStore } from "./whatsapp-content-sid-store";
import { proactiveWhatsappAllowed } from "./whatsapp-concierge";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendContentTemplate, whatsappAddress, type WhatsappSendResult } from "./whatsapp";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DONE = new Set(["sent", "delivered", "read"]);

type Audience = "tous" | "client" | "voyageur";
type Qui = "client" | "voyageur";

type StoredDoc = {
  id: string;
  storage_path: string;
  mime_type: string | null;
  file_name: string | null;
  customer_id: string;
  booking_id: string | null;
  traveler_id: string | null;
};

type CustomerRow = {
  id: string;
  phone: string | null;
  phone_secondary: string | null;
  auth_user_id: string | null;
  whatsapp_opt_in_at: string | null;
  whatsapp_opt_out_at: string | null;
};

type MessageRow = {
  id: string;
  status?: string | null;
  twilio_sid?: string | null;
  dedupe_key?: string | null;
  template_key?: string | null;
};

export type FreeMessageRecipient = {
  qui: Qui;
  notifie: boolean;
  raison: string | null;
  twilio_sid?: string | null;
};

export type FreeMessageResult = {
  document_id: string;
  dossier_id: string | null;
  client_id: string;
  fichier: string;
  modele: string;
  apercu: string;
  confirme: boolean;
  notifie: boolean;
  destinataires: FreeMessageRecipient[];
  note: string;
};

export type FreeMessageDeps = {
  resolveSid?: (store?: ContentSidStore) => Promise<string>;
  approved?: (sid: string) => Promise<boolean>;
  send?: (input: {
    phone: string | null | undefined;
    contentSid: string;
    variables: Record<string, string> | null;
  }) => Promise<WhatsappSendResult>;
  sign?: (documentId: string, filename: string) => string | null;
  store?: ContentSidStore;
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

function audienceOf(value: unknown): Audience {
  if (value == null || value === "") return "tous";
  if (value === "tous" || value === "client" || value === "voyageur") return value;
  throw new McpWriteError("Destinataires : voyageur, client ou tous.");
}

function handset(value: string | null | undefined) {
  const text = (value || "").trim();
  if (!text) return null;
  return toE164(text, "FR");
}

function sameHandset(customer: CustomerRow, phone: string | null) {
  const traveler = handset(phone);
  if (!traveler) return false;
  return [customer.phone, customer.phone_secondary].some((value) => handset(value) === traveler);
}

function channelBlock(customer: { phone: string | null; whatsapp_opt_in_at: string | null; whatsapp_opt_out_at: string | null }, qui: Qui) {
  if (!whatsappAddress(customer.phone)) return "Pas de téléphone pour WhatsApp.";
  if (!proactiveWhatsappAllowed(customer)) {
    return qui === "voyageur" ? "Le voyageur n’a pas activé WhatsApp." : "Le client n’a pas activé WhatsApp.";
  }
  return null;
}

async function storedSid(store: ContentSidStore) {
  try {
    return (await store.read(FREE_MESSAGE_TEMPLATE_ENV)) || "";
  } catch {
    return "";
  }
}

async function defaultResolveSid(store: ContentSidStore = serviceContentSidStore()) {
  const stored = await storedSid(store);
  if (stored) return stored;
  const fromEnv = productionOnlySecret(process.env[FREE_MESSAGE_TEMPLATE_ENV]);
  return isContentSid(fromEnv) ? fromEnv : "";
}

async function loadCustomer(db: SupabaseClient, id: string) {
  const { data, error } = await db
    .from("crm_customers")
    .select("id, phone, phone_secondary, auth_user_id, whatsapp_opt_in_at, whatsapp_opt_out_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as CustomerRow;
  return {
    id: String(row.id),
    phone: typeof row.phone === "string" ? row.phone : null,
    phone_secondary: typeof row.phone_secondary === "string" ? row.phone_secondary : null,
    auth_user_id: typeof row.auth_user_id === "string" ? row.auth_user_id : null,
    whatsapp_opt_in_at: typeof row.whatsapp_opt_in_at === "string" ? row.whatsapp_opt_in_at : null,
    whatsapp_opt_out_at: typeof row.whatsapp_opt_out_at === "string" ? row.whatsapp_opt_out_at : null,
  };
}

async function loadDocument(db: SupabaseClient, id: string): Promise<StoredDoc> {
  const bookingDoc = await db
    .from("crm_booking_documents")
    .select("id, booking_id, mime_type, file_name, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (bookingDoc.error) throw new McpWriteError("Pièce introuvable.");
  if (bookingDoc.data?.storage_path && bookingDoc.data.booking_id) {
    const booking = await db
      .from("crm_bookings")
      .select("id, customer_id")
      .eq("id", bookingDoc.data.booking_id)
      .maybeSingle();
    if (booking.error || !booking.data?.customer_id) throw new McpWriteError("Dossier introuvable.");
    const row = bookingDoc.data;
    if (!isPdfDocument(row.mime_type, row.file_name)) throw new McpWriteError("Le fichier doit être un PDF.");
    return {
      id: String(row.id),
      storage_path: String(row.storage_path),
      mime_type: typeof row.mime_type === "string" ? row.mime_type : null,
      file_name: typeof row.file_name === "string" ? row.file_name : null,
      customer_id: String(booking.data.customer_id),
      booking_id: String(row.booking_id),
      traveler_id: null,
    };
  }
  const travel = await db
    .from("crm_travel_documents")
    .select("id, customer_id, booking_id, traveler_id, mime_type, file_name, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (travel.error) throw new McpWriteError("Pièce introuvable.");
  const row = travel.data;
  if (!row?.storage_path || !row.customer_id) throw new McpWriteError("Pièce introuvable.");
  if (!isPdfDocument(row.mime_type, row.file_name)) throw new McpWriteError("Le fichier doit être un PDF.");
  return {
    id: String(row.id),
    storage_path: String(row.storage_path),
    mime_type: typeof row.mime_type === "string" ? row.mime_type : null,
    file_name: typeof row.file_name === "string" ? row.file_name : null,
    customer_id: String(row.customer_id),
    booking_id: typeof row.booking_id === "string" ? row.booking_id : null,
    traveler_id: typeof row.traveler_id === "string" ? row.traveler_id : null,
  };
}

async function travelerPhone(db: SupabaseClient, doc: StoredDoc, customer: CustomerRow) {
  if (!doc.traveler_id || !doc.booking_id) {
    return { kind: "missing" as const };
  }
  const { data } = await db
    .from("crm_booking_travelers")
    .select("id, booking_id, companion_id, is_account_holder")
    .eq("id", doc.traveler_id)
    .maybeSingle();
  const traveler = data as {
    id?: string;
    booking_id?: string;
    companion_id?: string | null;
    is_account_holder?: boolean;
  } | null;
  if (!traveler || traveler.booking_id !== doc.booking_id) return { kind: "missing" as const };
  if (traveler.is_account_holder) return { kind: "same" as const };
  let phone: string | null = null;
  if (traveler.companion_id) {
    const companion = await db.from("crm_travel_companions").select("phone").eq("id", traveler.companion_id).maybeSingle();
    phone = handset((companion.data as { phone?: string | null } | null)?.phone);
  }
  if (!phone) return { kind: "nophone" as const };
  if (sameHandset(customer, phone)) return { kind: "same" as const };
  const optedOut = await db.from("crm_customers").select("id, phone, whatsapp_opt_out_at").eq("phone", phone);
  const rows = (optedOut.data || []) as { whatsapp_opt_out_at?: string | null }[];
  if (rows.some((row) => row.whatsapp_opt_out_at)) return { kind: "optout" as const };
  return { kind: "phone" as const, phone };
}

type Plan = { qui: Qui; phone: string | null; travelerId: string | null; raison: string | null };

async function plansFor(db: SupabaseClient, doc: StoredDoc, customer: CustomerRow, audience: Audience): Promise<Plan[]> {
  const clientPlan = (): Plan => {
    const raison = channelBlock(customer, "client");
    return { qui: "client", phone: raison ? null : customer.phone, travelerId: null, raison };
  };
  const travelerPlan = async (): Promise<Plan> => {
    const found = await travelerPhone(db, doc, customer);
    if (found.kind === "missing") {
      return { qui: "voyageur", phone: null, travelerId: doc.traveler_id, raison: "La pièce n’est pas liée à un voyageur." };
    }
    if (found.kind === "same") {
      if (audience === "voyageur") {
        const raison = channelBlock(customer, "voyageur");
        return { qui: "voyageur", phone: raison ? null : customer.phone, travelerId: doc.traveler_id, raison };
      }
      return { qui: "voyageur", phone: null, travelerId: doc.traveler_id, raison: "Même numéro que le client." };
    }
    if (found.kind === "nophone") {
      return { qui: "voyageur", phone: null, travelerId: doc.traveler_id, raison: "Le voyageur n’a pas de numéro WhatsApp." };
    }
    if (found.kind === "optout") {
      return { qui: "voyageur", phone: null, travelerId: doc.traveler_id, raison: "WhatsApp n’est pas accepté." };
    }
    if (!whatsappAddress(found.phone)) {
      return { qui: "voyageur", phone: null, travelerId: doc.traveler_id, raison: "Pas de téléphone pour WhatsApp." };
    }
    return { qui: "voyageur", phone: found.phone, travelerId: doc.traveler_id, raison: null };
  };
  if (audience === "voyageur") return [await travelerPlan()];
  if (audience === "client" || !doc.traveler_id) return [clientPlan()];
  return [clientPlan(), await travelerPlan()];
}

async function priorMessages(db: SupabaseClient, doc: StoredDoc) {
  const query = db.from("crm_whatsapp_messages").select("id, status, twilio_sid, dedupe_key, template_key");
  const filtered = doc.booking_id ? query.eq("booking_id", doc.booking_id) : query.eq("customer_id", doc.customer_id);
  const { data, error } = await filtered;
  if (error) throw new McpWriteError("Envoi impossible.");
  return (data || []) as MessageRow[];
}

function noteFor(confirme: boolean, notifie: boolean) {
  if (!confirme) return "Rien n’a été envoyé. Relancez avec confirmer: true pour envoyer ce message et le PDF.";
  if (notifie) return "Le message est parti avec le PDF. Ce n’est pas le modèle d’autorisation.";
  return "Rien n’est parti.";
}

/**
 * Aperçu, puis envoi si confirmer est true.
 * Le PDF est déjà déposé (dossier ou espace client). Aucun modèle visa.
 */
export async function envoyerMessageLibre(
  input: Record<string, unknown>,
  admin?: SupabaseClient,
  deps?: FreeMessageDeps
): Promise<FreeMessageResult> {
  const documentId = documentIdOf(input.document_id);
  const custom = freeMessageText(typeof input.message === "string" ? input.message : "");
  if (!custom) throw new McpWriteError("Le message est vide, trop long, ou contient un numéro de pièce.");
  const preview = freeMessagePreview(custom);
  if (!preview) throw new McpWriteError("Le message n’a pas pu être préparé.");
  const audience = audienceOf(input.destinataires);
  const forcer = input.forcer === true;
  const confirme = input.confirmer === true;
  const db = client(admin);
  const doc = await loadDocument(db, documentId);
  const customer = await loadCustomer(db, doc.customer_id);
  if (!customer) throw new McpWriteError("Client introuvable.");
  const filename = freeMessageFileName(doc.file_name);
  const plans = await plansFor(db, doc, customer, audience);
  const base = {
    document_id: doc.id,
    dossier_id: doc.booking_id,
    client_id: doc.customer_id,
    fichier: filename,
    modele: FREE_MESSAGE_TEMPLATE,
    apercu: preview,
    confirme,
  };
  if (!confirme) {
    return {
      ...base,
      notifie: false,
      destinataires: plans.map((plan) => ({ qui: plan.qui, notifie: false, raison: plan.raison })),
      note: noteFor(false, false),
    };
  }

  const store = deps?.store;
  const resolveSid = deps?.resolveSid ?? (() => defaultResolveSid(store));
  const approved = deps?.approved ?? ((sid: string) => whatsappContentApproved(sid));
  const contentSid = (await resolveSid(store)).trim();
  if (!contentSid || !(await approved(contentSid))) throw new McpWriteError(freeMessagePendingMessage());

  const rows = await priorMessages(db, doc);
  const send = deps?.send ?? sendContentTemplate;
  const sign = deps?.sign ?? freeMessageSignedPath;
  const destinataires: FreeMessageRecipient[] = [];
  for (const plan of plans) {
    if (!plan.phone || plan.raison) {
      destinataires.push({ qui: plan.qui, notifie: false, raison: plan.raison || "Message non parti." });
      continue;
    }
    const key = freeMessageDedupeKey(doc.id, plan.qui, plan.travelerId, custom);
    const same = rows.filter((row) => row.dedupe_key === key || (forcer && row.dedupe_key?.startsWith(`${key}:`)));
    const done = same.find((row) => DONE.has(row.status || "") && row.template_key === FREE_MESSAGE_TEMPLATE);
    if (done && !forcer) {
      destinataires.push({ qui: plan.qui, notifie: false, raison: "Déjà envoyé.", twilio_sid: done.twilio_sid || null });
      continue;
    }
    if (same.some((row) => row.status === "queued") && !forcer) {
      destinataires.push({ qui: plan.qui, notifie: false, raison: "Un envoi est déjà en cours." });
      continue;
    }
    const dedupeKey = done && forcer ? `${key}:${Date.now()}` : key;
    const failed = same.find((row) => row.status === "failed" && row.dedupe_key === dedupeKey);
    let messageId = failed?.id || "";
    if (failed) {
      const updated = await db
        .from("crm_whatsapp_messages")
        .update({ status: "queued", error: null, body: preview, template_key: FREE_MESSAGE_TEMPLATE })
        .eq("id", failed.id);
      if (updated.error) {
        destinataires.push({ qui: plan.qui, notifie: false, raison: "Envoi impossible." });
        continue;
      }
    } else {
      const inserted = await db
        .from("crm_whatsapp_messages")
        .insert({
          customer_id: doc.customer_id,
          booking_id: doc.booking_id,
          dedupe_key: dedupeKey,
          direction: "outbound",
          template_key: FREE_MESSAGE_TEMPLATE,
          body: preview,
          payload: { document_id: doc.id, qui: plan.qui, ...(plan.travelerId ? { traveler_id: plan.travelerId } : {}) },
          status: "queued",
        })
        .select("id")
        .single();
      if (inserted.error) {
        destinataires.push({
          qui: plan.qui,
          notifie: false,
          raison: inserted.error.code === "23505" ? "Un envoi est déjà en cours." : "Envoi impossible.",
        });
        continue;
      }
      messageId = String(inserted.data?.id || "");
    }
    if (!messageId) {
      destinataires.push({ qui: plan.qui, notifie: false, raison: "Envoi impossible." });
      continue;
    }
    const mediaPath = sign(doc.id, filename);
    const variables = mediaPath ? freeMessageContentVariables(mediaPath, custom) : null;
    if (!variables) {
      await db.from("crm_whatsapp_messages").update({ status: "failed", error: "pdf" }).eq("id", messageId);
      destinataires.push({ qui: plan.qui, notifie: false, raison: "L’adresse du PDF n’a pas pu être signée." });
      continue;
    }
    const result = await send({ phone: plan.phone, contentSid, variables });
    if (!result.ok) {
      await db.from("crm_whatsapp_messages").update({ status: "failed", error: result.reason }).eq("id", messageId);
      destinataires.push({
        qui: plan.qui,
        notifie: false,
        raison: result.reason === "no_phone" ? "Pas de téléphone pour WhatsApp." : result.reason === "not_configured" ? "WhatsApp n’est pas configuré." : "WhatsApp a refusé le message.",
      });
      continue;
    }
    await db.from("crm_whatsapp_messages").update({ status: "sent", twilio_sid: result.sid, error: null }).eq("id", messageId);
    const activity = await db.from("crm_customer_activity").insert({
      customer_id: doc.customer_id,
      auth_user_id: customer.auth_user_id,
      action: "whatsapp_message_libre",
      summary: "Message libre envoyé",
      detail: filename,
      booking_id: doc.booking_id,
    });
    if (activity.error) console.error("[message-libre] journal", activity.error.code ?? "?");
    const audit = await db.from("crm_audit_events").insert(
      toAuditRow({
        actorKind: "human",
        action: "whatsapp_message_libre",
        bookingId: doc.booking_id,
        customerId: doc.customer_id,
        summary: "Message libre envoyé, document joint.",
        detail: { fichier: filename, qui: plan.qui },
        source: "mcp",
      })
    );
    if (audit.error) console.error("[message-libre] audit", audit.error.code ?? "?");
    destinataires.push({ qui: plan.qui, notifie: true, raison: null, twilio_sid: result.sid });
  }
  const notifie = destinataires.some((row) => row.notifie);
  return { ...base, notifie, destinataires, note: noteFor(true, notifie) };
}
