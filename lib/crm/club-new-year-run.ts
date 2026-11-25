import "server-only";

import { productionOnlySecret } from "@/lib/crm/preview-secrets";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  CLUB_NEW_YEAR_TO,
  CLUB_OFFER_ENDS_ON,
  NEW_YEAR_TEMPLATE,
  newYearExtensionEnabled,
  planNewYearExtension,
  whatsappNewYearPayload,
  type NewYearMember,
} from "./club-new-year";

type Row = {
  id: string;
  first_name: string | null;
  phone: string | null;
  club_rank: string | null;
  club_ends_on: string | null;
};

async function sendTemplate(payload: ReturnType<typeof whatsappNewYearPayload>) {
  const token = productionOnlySecret(process.env.WHATSAPP_TOKEN);
  const phoneId = (process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
  const version = (process.env.WHATSAPP_GRAPH_VERSION || "v21.0").replace(/[^\w.]/g, "") || "v21.0";
  if (!token || !phoneId) return { ok: false as const, id: null as string | null, detail: "whatsapp_absent" };
  try {
    const response = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await response.json().catch(() => null)) as { messages?: { id?: string }[] } | null;
    if (!response.ok) return { ok: false as const, id: null, detail: `whatsapp_${response.status}` };
    return { ok: true as const, id: json?.messages?.[0]?.id || null, detail: "envoye" };
  } catch {
    return { ok: false as const, id: null, detail: "whatsapp_erreur" };
  }
}

/** Liste les membres, et n’écrit ni n’envoie que si le créneau est ouvert et le flag vaut 1. */
export async function runNewYearExtension(now = new Date()) {
  const client = createServiceClient();
  const membersQuery = await client
    .from("crm_customers")
    .select("id, first_name, phone, club_rank, club_ends_on")
    .eq("club_rank", "platinum")
    .eq("club_ends_on", CLUB_OFFER_ENDS_ON);
  if (membersQuery.error) {
    return { ok: false as const, error: "La liste n’a pas pu être lue." };
  }
  const sentQuery = await client
    .from("crm_club_year_extensions")
    .select("customer_id, status")
    .eq("from_on", CLUB_OFFER_ENDS_ON)
    .eq("to_on", CLUB_NEW_YEAR_TO);
  const already = new Set(
    ((sentQuery.data || []) as { customer_id: string; status: string }[])
      .filter((row) => row.status === "envoye" || row.status === "sans_telephone")
      .map((row) => row.customer_id)
  );
  const members: NewYearMember[] = ((membersQuery.data || []) as Row[]).map((row) => ({
    id: row.id,
    firstName: row.first_name || "",
    phone: row.phone,
    clubRank: row.club_rank,
    endsOn: row.club_ends_on,
  }));
  const plan = planNewYearExtension({
    now,
    enabled: newYearExtensionEnabled(process.env),
    members,
    alreadySent: already,
  });
  if (plan.dryRun) {
    return {
      ok: true as const,
      dryRun: true,
      due: plan.due,
      enabled: plan.enabled,
      from: plan.from,
      to: plan.to,
      recipients: plan.recipients.map((row) => ({
        id: row.id,
        prenom: row.firstName,
        telephone: Boolean(row.phone),
        envoi: row.send,
      })),
      sent: [] as string[],
    };
  }

  const template = (process.env.WHATSAPP_TEMPLATE_BONNE_ANNEE || NEW_YEAR_TEMPLATE).trim() || NEW_YEAR_TEMPLATE;
  const lang = (process.env.WHATSAPP_TEMPLATE_LANG || "fr").trim() || "fr";
  const sent: string[] = [];
  for (const row of plan.recipients) {
    const claimed = await client.from("crm_club_year_extensions").insert({
      customer_id: row.id,
      from_on: plan.from,
      to_on: plan.to,
      status: "en_cours",
    });
    if (claimed.error) continue;
    const updated = await client.from("crm_customers").update({ club_ends_on: plan.to }).eq("id", row.id).eq("club_ends_on", plan.from);
    if (updated.error) {
      await client
        .from("crm_club_year_extensions")
        .update({ status: "echec", detail: "date" })
        .eq("customer_id", row.id)
        .eq("from_on", plan.from)
        .eq("to_on", plan.to);
      continue;
    }
    if (!row.send || !row.phone) {
      await client
        .from("crm_club_year_extensions")
        .update({ status: "sans_telephone", detail: "date_posee" })
        .eq("customer_id", row.id)
        .eq("from_on", plan.from)
        .eq("to_on", plan.to);
      continue;
    }
    const delivery = await sendTemplate(
      whatsappNewYearPayload({ to: row.phone, template, lang, firstName: row.firstName })
    );
    await client
      .from("crm_club_year_extensions")
      .update({
        status: delivery.ok ? "envoye" : "echec",
        detail: delivery.id || delivery.detail,
      })
      .eq("customer_id", row.id)
      .eq("from_on", plan.from)
      .eq("to_on", plan.to);
    if (delivery.ok) sent.push(row.id);
  }
  return {
    ok: true as const,
    dryRun: false,
    due: true,
    enabled: true,
    from: plan.from,
    to: plan.to,
    recipients: plan.recipients.map((row) => ({ id: row.id, prenom: row.firstName, envoi: row.send })),
    sent,
  };
}
