import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toAuditRow } from "./audit-events";
import {
  boardingPassChannelBlock,
  boardingPassContentVariables,
  boardingPassFields,
  boardingPassFileName,
  boardingPassJournal,
  boardingPassPreview,
  boardingPassTemplateForCount,
  BOARDING_PASS_TEMPLATE_ENV,
  checkinAirportPreview,
  checkinAirportVariables,
  checkinJournal,
  isBoardingPassFile,
  type BoardingPassFields,
  type CheckinSituation,
} from "./boarding-pass-whatsapp";
import { boardingPassSignedPath } from "./boarding-pass-link";
import { createServiceClient } from "@/lib/supabase/admin";
import { resolveContentSid } from "./twilio-content-sid";
import { sendContentTemplate } from "./whatsapp";

type CardInput = {
  documentId?: string;
  firstName?: string;
  lastName?: string;
  flight?: string;
  route?: string;
  when?: string;
  seat?: string;
};

export type BoardingPassSendInput = {
  confirm?: boolean;
  mode?: string;
  cards?: CardInput[];
  notice?: {
    firstName?: string;
    flight?: string;
    route?: string;
    when?: string;
    situation?: string;
  };
};

function situationOf(value: string | undefined): CheckinSituation | null {
  if (value === "echec" || value === "comptoir") return value;
  return null;
}

async function journal(input: {
  customerId: string;
  authUserId: string | null;
  bookingId: string;
  staffId: string;
  action: string;
  summary: string;
  detail: string | null;
  templateKey: string;
  body: string;
  twilioSid: string;
}) {
  const admin = createServiceClient();
  const activity = await admin.from("crm_customer_activity").insert({
    customer_id: input.customerId,
    auth_user_id: input.authUserId,
    action: input.action,
    summary: input.summary,
    detail: input.detail,
    booking_id: input.bookingId,
  });
  if (activity.error) console.error("[carte-embarquement] journal", activity.error.code ?? "?");
  const audit = await admin.from("crm_audit_events").insert(
    toAuditRow({
      actorKind: "human",
      actorId: input.staffId,
      action: input.action,
      bookingId: input.bookingId,
      customerId: input.customerId,
      summary: input.summary,
      detail: input.detail ? { route: input.detail } : {},
    })
  );
  if (audit.error) console.error("[carte-embarquement] audit", audit.error.code ?? "?");
  const message = await admin.from("crm_whatsapp_messages").insert({
    customer_id: input.customerId,
    booking_id: input.bookingId,
    direction: "outbound",
    template_key: input.templateKey,
    body: input.body,
    twilio_sid: input.twilioSid,
    status: "sent",
  });
  if (message.error) console.error("[carte-embarquement] message", message.error.code ?? "?");
}

/**
 * Envoi voulu par l’agence. `confirm` est obligatoire : sans lui, rien ne part.
 * Les PDF sont ceux du dossier dont le type est « carte d'embarquement ».
 */
export async function sendBoardingPassWhatsapp(
  supabase: SupabaseClient,
  input: BoardingPassSendInput & { bookingId: string; staffId: string; staffUserId: string | null }
): Promise<{ ok: true; sent: number } | { ok: false; error: string; sent: number }> {
  if (input.confirm !== true) return { ok: false, error: "Confirmation requise avant l’envoi.", sent: 0 };
  const { data: booking, error: bookingError } = await supabase
    .from("crm_bookings")
    .select("id, customer_id, reference")
    .eq("id", input.bookingId)
    .maybeSingle();
  if (bookingError || !booking) return { ok: false, error: "Dossier introuvable.", sent: 0 };
  const customerId = String(booking.customer_id || "");
  const { data: customer } = await supabase
    .from("crm_customers")
    .select("id, phone, auth_user_id, whatsapp_opt_in_at, whatsapp_opt_out_at")
    .eq("id", customerId)
    .maybeSingle();
  const block = boardingPassChannelBlock({
    phone: typeof customer?.phone === "string" ? customer.phone : null,
    optInAt: typeof customer?.whatsapp_opt_in_at === "string" ? customer.whatsapp_opt_in_at : null,
    optOutAt: typeof customer?.whatsapp_opt_out_at === "string" ? customer.whatsapp_opt_out_at : null,
  });
  if (block || !customer) return { ok: false, error: block || "Client introuvable.", sent: 0 };

  if (input.mode === "aeroport") return sendAirport(input, customerId, customer);

  const cards = Array.isArray(input.cards) ? input.cards : [];
  const template = boardingPassTemplateForCount(cards.length);
  if (!template) return { ok: false, error: "Aucune carte d’embarquement à envoyer.", sent: 0 };
  const contentSid = await resolveContentSid(BOARDING_PASS_TEMPLATE_ENV[template]);
  if (!contentSid) return { ok: false, error: "Le modèle WhatsApp n’est pas encore approuvé.", sent: 0 };

  const prepared: { fields: BoardingPassFields; documentId: string; filename: string; preview: string }[] = [];
  for (const card of cards) {
    const documentId = String(card.documentId || "");
    const fields = boardingPassFields(card);
    if (!fields) return { ok: false, error: "Chaque carte doit indiquer le prénom, le nom, le vol, le trajet, l’horaire et le siège.", sent: 0 };
    const filename = boardingPassFileName(fields);
    const preview = boardingPassPreview(template, fields);
    if (!filename || !preview) return { ok: false, error: "Le nom du fichier PDF n’a pas pu être préparé.", sent: 0 };
    const { data: doc } = await supabase
      .from("crm_booking_documents")
      .select("id, kind, mime_type, file_name, storage_path")
      .eq("id", documentId)
      .eq("booking_id", input.bookingId)
      .maybeSingle();
    if (!doc || !isBoardingPassFile(doc) || !doc.storage_path) {
      return { ok: false, error: "La pièce n’est pas une carte d’embarquement PDF de ce dossier.", sent: 0 };
    }
    prepared.push({ fields, documentId, filename, preview });
  }

  let sent = 0;
  for (const row of prepared) {
    const mediaPath = boardingPassSignedPath(row.documentId, row.filename);
    const variables = mediaPath ? boardingPassContentVariables(mediaPath, row.fields) : null;
    if (!variables) return { ok: false, error: "L’adresse du PDF n’a pas pu être signée.", sent };
    const result = await sendContentTemplate({
      phone: customer.phone,
      contentSid,
      variables,
    });
    if (!result.ok) {
      const detail = result.reason === "rejected" ? "WhatsApp a refusé le message." : "WhatsApp n’est pas configuré.";
      return { ok: false, error: sent ? `${sent} carte est partie. ${detail}` : detail, sent };
    }
    const noted = boardingPassJournal({
      names: [row.fields.firstName],
      flight: row.fields.flight,
      route: row.fields.route,
      count: 1,
    });
    await journal({
      customerId,
      authUserId: typeof customer.auth_user_id === "string" ? customer.auth_user_id : input.staffUserId,
      bookingId: input.bookingId,
      staffId: input.staffId,
      action: noted.action,
      summary: noted.summary,
      detail: noted.detail,
      templateKey: template,
      body: row.preview,
      twilioSid: result.sid,
    });
    sent += 1;
  }
  return { ok: true, sent };
}

async function sendAirport(
  input: BoardingPassSendInput & { bookingId: string; staffId: string; staffUserId: string | null },
  customerId: string,
  customer: { phone?: string | null; auth_user_id?: string | null }
): Promise<{ ok: true; sent: number } | { ok: false; error: string; sent: number }> {
  const situation = situationOf(input.notice?.situation);
  const fields = {
    firstName: input.notice?.firstName || "",
    flight: input.notice?.flight || "",
    route: input.notice?.route || "",
    when: input.notice?.when || "",
    situation: situation || ("echec" as const),
  };
  if (!situation) return { ok: false, error: "Indiquez si l’enregistrement a échoué ou s’il reste à le terminer à l’aéroport.", sent: 0 };
  const preview = checkinAirportPreview(fields);
  const variables = checkinAirportVariables(fields);
  if (!preview || !variables) {
    return { ok: false, error: "Le message doit indiquer le prénom, le vol, le trajet et l’horaire.", sent: 0 };
  }
  const contentSid = await resolveContentSid(BOARDING_PASS_TEMPLATE_ENV.enregistrement_aeroport);
  if (!contentSid) return { ok: false, error: "Le modèle WhatsApp n’est pas encore approuvé.", sent: 0 };
  const result = await sendContentTemplate({ phone: customer.phone, contentSid, variables });
  if (!result.ok) {
    return { ok: false, error: result.reason === "rejected" ? "WhatsApp a refusé le message." : "WhatsApp n’est pas configuré.", sent: 0 };
  }
  const noted = checkinJournal(fields);
  await journal({
    customerId,
    authUserId: typeof customer.auth_user_id === "string" ? customer.auth_user_id : input.staffUserId,
    bookingId: input.bookingId,
    staffId: input.staffId,
    action: noted.action,
    summary: noted.summary,
    detail: noted.detail,
    templateKey: "enregistrement_aeroport",
    body: preview,
    twilioSid: result.sid,
  });
  return { ok: true, sent: 1 };
}
