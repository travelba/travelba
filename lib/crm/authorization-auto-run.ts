import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAgencyContentSid } from "@/lib/crm/agency-templates-arm";
import {
  authorizationAutoSendEnabled,
  decideAuthorizationFollowUp,
  type AuthorizationKind,
} from "@/lib/crm/authorization-client-message";
import { deliverFreeMessage, freeMessageChannelBlock, freeMessagePreviewBlocked } from "@/lib/crm/free-message-send";
import { freeMessageTemplateText } from "@/lib/crm/free-message-copy";
import { FREE_MESSAGE_TEMPLATE_ENV } from "@/lib/crm/free-message-whatsapp";
import { notifyConciergeRequest } from "@/lib/crm/whatsapp-alert";
import { whatsappAddress } from "@/lib/crm/whatsapp";

const DAY_MS = 24 * 60 * 60 * 1000;

type CheckRow = {
  id: string;
  booking_id: string;
  traveler_id: string;
  status: string;
  valid_until: string | null;
  checked_at: string | null;
  dispatched_at: string | null;
  client_message_sent_at: string | null;
};

function tableFor(kind: AuthorizationKind) {
  return kind === "esta" ? "crm_esta_checks" : "crm_uk_eta_checks";
}

async function windowOpen(admin: SupabaseClient, customerId: string, phone: string | null, now: number) {
  const since = new Date(now - DAY_MS).toISOString();
  const byCustomer = await admin
    .from("crm_whatsapp_messages")
    .select("id")
    .eq("customer_id", customerId)
    .eq("direction", "inbound")
    .gte("created_at", since)
    .limit(1);
  if (!byCustomer.error && (byCustomer.data || []).length > 0) return true;
  if (!phone) return false;
  const byPhone = await admin
    .from("crm_whatsapp_messages")
    .select("id")
    .eq("phone", phone)
    .eq("direction", "inbound")
    .gte("created_at", since)
    .limit(1);
  if (byPhone.error) return false;
  return (byPhone.data || []).length > 0;
}

/**
 * Après un résultat écrit sur la ligne existante : message client si le réglage
 * est ouvert, alerte agence sinon pour introuvable, refusé, ou silence de deux heures.
 * Un seul envoi par contrôle (client_message_sent_at).
 */
export async function flushAuthorizationWhatsapp(admin: SupabaseClient, kind: AuthorizationKind) {
  const table = tableFor(kind);
  const autoSend = authorizationAutoSendEnabled();
  const now = Date.now();
  const { data, error } = await admin
    .from(table)
    .select("id, booking_id, traveler_id, status, valid_until, checked_at, dispatched_at, client_message_sent_at")
    .in("status", ["approuve", "introuvable", "refuse", "a_verifier"])
    .order("updated_at", { ascending: false })
    .limit(40);
  if (error || !data?.length) return { sent: 0, alerts: 0 };

  let sent = 0;
  let alerts = 0;
  for (const row of data as CheckRow[]) {
    const open = await admin
      .from("crm_whatsapp_requests")
      .select("body")
      .eq("booking_id", row.booking_id)
      .eq("status", "open")
      .limit(20);
    const bodies = ((open.data || []) as { body: string | null }[]).map((item) => item.body || "");
    const [{ data: traveler }, { data: booking }] = await Promise.all([
      admin.from("crm_booking_travelers").select("first_name, last_name").eq("id", row.traveler_id).maybeSingle(),
      admin.from("crm_bookings").select("customer_id, reference").eq("id", row.booking_id).maybeSingle(),
    ]);
    const person = traveler as { first_name: string | null; last_name: string | null } | null;
    const stay = booking as { customer_id: string; reference: string | null } | null;
    const travelerName = [person?.first_name, person?.last_name].filter(Boolean).join(" ").trim() || "voyageur";
    const decision = decideAuthorizationFollowUp({
      kind,
      status: row.status,
      validUntil: row.valid_until,
      checkedAt: row.checked_at,
      dispatchedAt: row.dispatched_at,
      clientSentAt: row.client_message_sent_at,
      now,
      autoSend,
      alreadyAlerted: Boolean(
        decisionAlertSeen(bodies, kind, row.status === "a_verifier" ? "silence" : row.status, travelerName)
      ),
    });
    if (!decision.client && !decision.alert) continue;
    if (!stay?.customer_id) continue;

    if (decision.alert && !bodies.some((body) => body.startsWith(`${decision.alert?.title} — ${travelerName}`))) {
      const body = `${decision.alert.title} — ${travelerName}. ${decision.alert.body.replace(`${decision.alert.title}. `, "")}`;
      const { data: customer } = await admin
        .from("crm_customers")
        .select("phone")
        .eq("id", stay.customer_id)
        .maybeSingle();
      const phone = (customer as { phone: string | null } | null)?.phone || null;
      const inserted = await admin.from("crm_whatsapp_requests").insert({
        customer_id: stay.customer_id,
        phone,
        booking_id: row.booking_id,
        message_id: null,
        kind: decision.alert.kind,
        body,
        status: "open",
      });
      if (!inserted.error) {
        alerts += 1;
        await notifyConciergeRequest({
          kind: decision.alert.kind,
          body,
          customer_id: stay.customer_id,
          booking_id: row.booking_id,
          phone,
        });
      }
    }

    if (!decision.client || freeMessagePreviewBlocked()) continue;
    const { data: customer } = await admin
      .from("crm_customers")
      .select("phone, first_name, whatsapp_opt_in_at, whatsapp_opt_out_at")
      .eq("id", stay.customer_id)
      .maybeSingle();
    const account = customer as {
      phone: string | null;
      first_name: string | null;
      whatsapp_opt_in_at: string | null;
      whatsapp_opt_out_at: string | null;
    } | null;
    if (!account || !whatsappAddress(account.phone)) continue;
    const openWindow = await windowOpen(admin, stay.customer_id, account.phone, now);
    const contentSid = openWindow
      ? null
      : await resolveAgencyContentSid(FREE_MESSAGE_TEMPLATE_ENV.message_libre_texte);
    const blocked = freeMessageChannelBlock({
      phone: account.phone,
      optInAt: account.whatsapp_opt_in_at,
      optOutAt: account.whatsapp_opt_out_at,
      windowOpen: openWindow,
      modele: openWindow ? null : "message_libre_texte",
      templateReady: openWindow || Boolean(contentSid),
    });
    if (blocked) continue;
    const claimed = await admin
      .from(table)
      .update({ client_message_sent_at: new Date(now).toISOString() })
      .eq("id", row.id)
      .is("client_message_sent_at", null)
      .select("id");
    if (claimed.error || !claimed.data?.length) continue;
    const delivered = await deliverFreeMessage({
      phone: account.phone || "",
      windowOpen: openWindow,
      text: decision.client,
      firstName: account.first_name,
      file: null,
      contentSid,
      now,
    });
    if (!delivered.ok) {
      await admin.from(table).update({ client_message_sent_at: null }).eq("id", row.id);
      continue;
    }
    const journal = openWindow ? decision.client : freeMessageTemplateText(account.first_name, decision.client) || decision.client;
    await admin.from("crm_whatsapp_messages").insert({
      customer_id: stay.customer_id,
      booking_id: row.booking_id,
      direction: "outbound",
      template_key: openWindow ? "chat" : "message_libre_texte",
      body: journal,
      status: "sent",
      phone: account.phone,
      twilio_sid: delivered.sid,
    });
    sent += 1;
  }
  return { sent, alerts };
}

function decisionAlertSeen(bodies: string[], kind: AuthorizationKind, status: string, travelerName: string) {
  const name = kind === "esta" ? "ESTA" : "ETA";
  const title =
    status === "refuse" ? `${name} refusée` : status === "silence" || status === "a_verifier" ? `${name} sans résultat` : status === "introuvable" ? `${name} introuvable` : "";
  if (!title) return false;
  return bodies.some((body) => body.startsWith(`${title} — ${travelerName}`));
}
