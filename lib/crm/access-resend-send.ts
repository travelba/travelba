import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { recordAgencyJournal } from "./agency-log";
import { RATE_LIMITED_MESSAGE, rateLimit, rateLimitKey } from "./rate-limit";
import { resolveContentSid } from "./twilio-content-sid";
import { sendContentTemplate, twilioReady, whatsappAddress } from "./whatsapp";
import {
  ACCESS_TEMPLATE_ENV,
  ACCESS_TEMPLATE_KEY,
  createAccessToken,
  deliverAccessResend,
  type AccessJournalRow,
} from "./access-resend";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AccessSendResult = {
  ok: boolean;
  statut: "sent" | "failed" | "refused";
  code: string;
  message: string;
  sid: string | null;
  httpStatus: number;
};

function refused(message: string, code: string, httpStatus: number): AccessSendResult {
  return { ok: false, statut: "refused", code, message, sid: null, httpStatus };
}

/**
 * Même envoi que le bouton « Renvoyer ses accès par WhatsApp ».
 * Le jeton en clair part chez Twilio et n’est écrit nulle part.
 */
export async function sendClientAccessWhatsapp(input: {
  customerId: string;
  staffId: string | null;
  actor: string;
  path: string;
  confirmer: boolean;
}): Promise<AccessSendResult> {
  if (input.confirmer !== true) {
    return refused(
      "Rien n’a été envoyé. Confirmez pour renvoyer les accès par WhatsApp. Aucun mot de passe n’est dans le message.",
      "confirm",
      400
    );
  }
  if (!UUID.test(input.customerId)) return refused("Client invalide.", "invalid", 400);

  const allowed = await rateLimit({
    key: rateLimitKey("acces-whatsapp", input.customerId),
    limit: 8,
    windowSeconds: 60 * 60,
  });
  if (!allowed) return refused(RATE_LIMITED_MESSAGE, "rate", 429);

  const admin = createServiceClient();
  const { data: customer, error: readError } = await admin
    .from("crm_customers")
    .select("id, email, phone, first_name, auth_user_id")
    .eq("id", input.customerId)
    .maybeSingle();
  if (readError) {
    console.error("[acces] fiche illisible");
    return refused("La fiche n’a pas pu être lue.", "read", 502);
  }
  if (!customer?.id) return refused("Client introuvable.", "not_found", 404);
  if (!customer.auth_user_id) return refused("Invitez d’abord ce client.", "no_auth", 409);
  if (!customer.email?.trim()) return refused("Ce client n’a pas d’e-mail.", "no_email", 409);

  const { data: staffRow, error: staffError } = await admin
    .from("crm_staff")
    .select("id")
    .eq("auth_user_id", customer.auth_user_id)
    .maybeSingle();
  if (staffError) {
    console.error("[acces] compte agence illisible");
    return refused("La fiche n’a pas pu être lue.", "read", 502);
  }
  if (staffRow) return refused("Réservé à un client.", "staff", 403);

  const to = whatsappAddress(customer.phone);
  if (!to) {
    return refused("Ajoutez un téléphone à la fiche : les accès partent par WhatsApp.", "no_phone", 409);
  }

  const templateSid = (await resolveContentSid(ACCESS_TEMPLATE_ENV)).trim();
  if (!templateSid || !twilioReady()) {
    await recordAgencyJournal({
      staffId: input.staffId,
      action: "send",
      entityType: "client",
      entityId: customer.id,
      summary: `Renvoi des accès WhatsApp refusé : le modèle n’est pas encore approuvé (${input.actor}).`.slice(0, 500),
      path: input.path,
    });
    return refused("Le modèle WhatsApp des accès n’est pas encore approuvé. Rien n’a été envoyé.", "not_configured", 409);
  }

  const token = createAccessToken();
  let journalId: string | null = null;
  const phone = customer.phone?.trim() || null;

  const result = await deliverAccessResend(
    {
      customerId: customer.id,
      email: customer.email,
      firstName: customer.first_name,
      phone,
      token,
      staffId: input.staffId,
      actor: input.actor,
    },
    {
      async revokeActive(customerId) {
        const { error } = await admin
          .from("crm_access_resend_tokens")
          .update({ revoked_at: new Date().toISOString() })
          .eq("customer_id", customerId)
          .is("revoked_at", null)
          .is("used_at", null);
        if (error) console.error("[acces] révocation");
        return !error;
      },
      async insertToken(row) {
        const { error } = await admin.from("crm_access_resend_tokens").insert({
          customer_id: row.customerId,
          token_hash: row.tokenHash,
          expires_at: row.expiresAt,
          created_by_staff_id: row.staffId,
        });
        if (error) console.error("[acces] empreinte");
        return !error;
      },
      async revokeHash(tokenHash) {
        const { error } = await admin
          .from("crm_access_resend_tokens")
          .update({ revoked_at: new Date().toISOString() })
          .eq("token_hash", tokenHash)
          .is("used_at", null);
        if (error) console.error("[acces] révocation du jeton");
      },
      send(variables) {
        return sendContentTemplate({ phone: customer.phone, contentSid: templateSid, variables });
      },
      async remember(row: AccessJournalRow) {
        if (!journalId) {
          const inserted = await admin
            .from("crm_whatsapp_messages")
            .insert({
              customer_id: row.customer_id,
              direction: "outbound",
              template_key: ACCESS_TEMPLATE_KEY,
              body: row.body,
              status: row.status,
              error: row.error,
              phone: row.phone,
              author_staff_id: row.author_staff_id,
              twilio_sid: row.twilio_sid,
              payload: row.payload,
            })
            .select("id")
            .single();
          if (inserted.error || !inserted.data?.id) {
            console.error("[acces] journal");
            return false;
          }
          journalId = inserted.data.id as string;
          return true;
        }
        const updated = await admin
          .from("crm_whatsapp_messages")
          .update({ status: row.status, error: row.error, twilio_sid: row.twilio_sid })
          .eq("id", journalId);
        if (updated.error) console.error("[acces] journal");
        return !updated.error;
      },
      audit(summary) {
        return recordAgencyJournal({
          staffId: input.staffId,
          action: "send",
          entityType: "client",
          entityId: customer.id,
          summary,
          path: input.path,
        });
      },
    }
  );

  if (!result.ok) {
    return { ok: false, statut: "failed", code: result.code, message: result.message, sid: null, httpStatus: 502 };
  }
  return { ok: true, statut: "sent", code: "sent", message: result.message, sid: result.sid, httpStatus: 200 };
}

