import "server-only";

import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordClientPayAlert } from "@/lib/crm/agency-log";
import { agencyEmailHtml, escapeHtml } from "@/lib/crm/email-html";
import { formatMoney } from "@/lib/crm/money";
import { AGENCY_MAIL_COPY } from "@/lib/crm/outbound-mail";
import { payIntentPath, payMethodPhrase, paySettledSummary } from "@/lib/crm/customer-activity";
import { productionOnlySecret } from "@/lib/crm/preview-secrets";
import { siteConfig } from "@/lib/site";

export type ClientPayNotice = {
  customerId: string;
  customerName: string;
  payer: "company" | "personal";
  method: string;
  wallet?: string | null;
  amountCents: number;
  currency: string;
  reference?: string | null;
  bookingId?: string | null;
  paymentIntentId: string;
  result: "reçu" | "refusé" | "abandonné";
};

function hrefFor(input: ClientPayNotice) {
  if (input.bookingId) return `/admin/reservations/${input.bookingId}`;
  return `/admin/clients/${input.customerId}`;
}

/**
 * Journal, alerte et e-mail agence. Ne crédite pas.
 * Un second appel du même PaymentIntent ne réécrit pas le journal et ne renvoie pas le mail.
 */
export async function notifyClientPayment(admin: SupabaseClient, input: ClientPayNotice) {
  const intentId = input.paymentIntentId.trim();
  if (!intentId || !input.customerId) return;
  const amount = Math.round(input.amountCents) / 100;
  const summary = paySettledSummary({
    payer: input.payer,
    method: input.method,
    wallet: input.wallet,
    amount,
    currency: input.currency,
    reference: input.reference,
    result: input.result,
  });
  const path = payIntentPath(intentId);
  const detail = input.result === "reçu" ? "Paiement reçu" : input.result === "abandonné" ? "Paiement abandonné" : "Paiement refusé";
  try {
    const existing = await admin
      .from("crm_customer_activity")
      .select("id")
      .eq("customer_id", input.customerId)
      .eq("action", "pay_settled")
      .eq("path", path)
      .limit(1)
      .maybeSingle();
    if (!existing.data) {
      await admin.from("crm_customer_activity").insert({
        customer_id: input.customerId,
        action: "pay_settled",
        summary,
        detail,
        path,
        booking_id: input.bookingId || null,
      });
    }
  } catch (err) {
    console.error("[pay] journal", err instanceof Error ? err.message : "écriture");
  }

  const who = input.customerName.trim() || "Un client";
  const how = payMethodPhrase(input.method, input.wallet);
  const money = formatMoney(amount, input.currency);
  const where = (input.reference || "").trim() ? ` · ${input.reference}` : "";
  const alert = input.result === "reçu"
    ? `${who} a réglé ${money} par ${how}${where}.`
    : input.result === "abandonné"
      ? `${who} : paiement abandonné · ${money} · ${how}${where}.`
      : `${who} : paiement refusé · ${money} · ${how}${where}.`;
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const prior = await admin
    .from("crm_agency_alerts")
    .select("id")
    .eq("kind", "payment")
    .eq("entity_id", input.customerId)
    .eq("summary", alert)
    .gte("created_at", since)
    .limit(1)
    .maybeSingle();
  await recordClientPayAlert({ customerId: input.customerId, summary: alert });
  if (!prior.data && input.result === "reçu") {
    await sendPayMail({
      name: who,
      money,
      method: how,
      reference: input.reference,
      href: hrefFor(input),
    });
  }
}

async function sendPayMail(input: { name: string; money: string; method: string; reference?: string | null; href: string }) {
  const apiKey = productionOnlySecret(process.env.RESEND_API_KEY);
  if (!apiKey) return;
  const from = process.env.CONTACT_FROM_EMAIL || siteConfig.contactEmail;
  const where = (input.reference || "").trim();
  const body = where
    ? `${input.name} a réglé ${input.money} par ${input.method} pour le dossier ${where}.`
    : `${input.name} a réglé ${input.money} par ${input.method}.`;
  try {
    const resend = new Resend(apiKey);
    const origin = (process.env.NEXT_PUBLIC_SITE_URL || "https://travelba.fr").replace(/\/$/, "");
    const { error } = await resend.emails.send({
      from: `${siteConfig.name} <${from}>`,
      to: [AGENCY_MAIL_COPY],
      subject: `Paiement reçu — ${input.name} — ${input.money}`,
      html: agencyEmailHtml({
        title: "Paiement reçu",
        preheader: body,
        bodyHtml: `<p style="margin:0;line-height:1.5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#0B192C">${escapeHtml(body)}</p>`,
        ctaLabel: "Ouvrir la fiche",
        ctaHref: `${origin}${input.href}`,
      }),
    });
    if (error) console.error("[pay] e-mail agence non envoyé");
  } catch {
    console.error("[pay] e-mail agence non envoyé");
  }
}
