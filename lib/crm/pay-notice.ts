import "server-only";

import { Resend } from "resend";
import { recordClientPayAlert } from "@/lib/crm/agency-log";
import { agencyEmailHtml, escapeHtml } from "@/lib/crm/email-html";
import { formatMoney } from "@/lib/crm/money";
import { AGENCY_MAIL_COPY } from "@/lib/crm/outbound-mail";
import { payIntentPath, payMethodPhrase, paySettledSummary } from "@/lib/crm/customer-activity";
import {
  admitIncomingNotice,
  ARGENT_QUEUE_HREF,
  redactPaymentSecrets,
  revolutNoticeKey,
  stripeNoticeKey,
  wireReceivedSummary,
} from "@/lib/crm/incoming-notice";
import { payerKindOf } from "@/lib/crm/payer";
import { scoreRevolutMatches, suggestedCustomerId, type RevolutMatchCustomer } from "@/lib/crm/revolut-match";
import { stayPayMethodOf } from "@/lib/crm/stripe-pay";
import type { StripeIntentInput } from "@/lib/crm/stripe-inbox";
import { productionOnlySecret } from "@/lib/crm/preview-secrets";
import { siteConfig } from "@/lib/site";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NoticeDb = { from: (table: string) => any };

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
export async function notifyClientPayment(admin: NoticeDb, input: ClientPayNotice) {
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
  if (await paymentKeySeen(admin, stripeNoticeKey(intentId))) return;
  const detail = input.result === "reçu" ? "Paiement reçu" : input.result === "abandonné" ? "Paiement abandonné" : "Paiement refusé";
  let already = false;
  try {
    const existing = await admin
      .from("crm_customer_activity")
      .select("id")
      .eq("customer_id", input.customerId)
      .eq("action", "pay_settled")
      .eq("path", path)
      .limit(1)
      .maybeSingle();
    already = Boolean(existing.data);
    if (!already) {
      await admin.from("crm_customer_activity").insert({
        customer_id: input.customerId,
        action: "pay_settled",
        summary: redactPaymentSecrets(summary),
        detail,
        path,
        booking_id: input.bookingId || null,
      });
    }
  } catch (err) {
    console.error("[pay] journal", err instanceof Error ? err.message : "écriture");
  }
  if (already) return;

  const who = input.customerName.trim() || "Un client";
  const how = payMethodPhrase(input.method, input.wallet);
  const money = formatMoney(amount, input.currency);
  const where = (input.reference || "").trim() ? ` · ${input.reference}` : "";
  const alert = redactPaymentSecrets(
    input.result === "reçu"
      ? `${who} a réglé ${money} par ${how}${where}.`
      : input.result === "abandonné"
        ? `${who} : paiement abandonné · ${money} · ${how}${where}.`
        : `${who} : paiement refusé · ${money} · ${how}${where}.`
  );
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
        ctaLabel: input.href === ARGENT_QUEUE_HREF ? "Voir À encaisser" : "Ouvrir la fiche",
        ctaHref: `${origin}${input.href}`,
      }),
    });
    if (error) console.error("[pay] e-mail agence non envoyé");
  } catch {
    console.error("[pay] e-mail agence non envoyé");
  }
}

async function paymentKeySeen(admin: NoticeDb, key: string) {
  if (key.startsWith("stripe:")) {
    const intentId = key.slice("stripe:".length);
    const activity = await admin
      .from("crm_customer_activity")
      .select("id")
      .eq("action", "pay_settled")
      .eq("path", payIntentPath(intentId))
      .limit(1);
    if (activity.data?.length) return true;
    const alert = await admin
      .from("crm_agency_alerts")
      .select("id")
      .eq("kind", "payment")
      .eq("entity_type", "stripe")
      .eq("entity_id", intentId)
      .limit(1);
    return Boolean(alert.data?.length);
  }
  if (key.startsWith("revolut:")) {
    const id = key.slice("revolut:".length);
    const alert = await admin
      .from("crm_agency_alerts")
      .select("id")
      .eq("kind", "payment")
      .eq("entity_type", "revolut")
      .eq("entity_id", id)
      .limit(1);
    return Boolean(alert.data?.length);
  }
  return false;
}

export type FreshRevolutWire = {
  id: string;
  direction: string;
  category: string | null;
  amount: number;
  currency: string;
  payer: string;
  reference: string | null;
  iban: string | null;
};

/** Annonce un virement entrant nouvellement écrit. Ne crédite pas. Webhook et cron partagent l’id Revolut. */
export async function announceIncomingWires(admin: NoticeDb, wires: FreshRevolutWire[]) {
  const seen = new Set<string>();
  for (const wire of wires) {
    try {
      if (!admitIncomingNotice(seen, wire)) continue;
      if (await paymentKeySeen(admin, revolutNoticeKey(wire.id))) continue;
      const proposal = await proposedWire(admin, wire);
      const summary = wireReceivedSummary({
        amount: wire.amount,
        currency: wire.currency,
        payer: wire.payer,
        client: proposal?.label,
        reference: proposal?.reference || wire.reference,
      });
      if (proposal?.customerId) {
        await admin.from("crm_customer_activity").insert({
          customer_id: proposal.customerId,
          action: "pay_settled",
          summary,
          detail: "Virement reçu",
          path: `rv:${wire.id}`,
          booking_id: proposal.bookingId,
        });
      }
      const inserted = await admin.from("crm_agency_alerts").insert({
        kind: "payment",
        summary,
        staff_id: null,
        entity_type: "revolut",
        entity_id: wire.id,
      });
      if (inserted.error) continue;
      await sendPayMail({
        name: wire.payer.trim() || proposal?.label || "Un client",
        money: formatMoney(wire.amount, wire.currency || "EUR"),
        method: "virement",
        reference: proposal?.reference || null,
        href: ARGENT_QUEUE_HREF,
      });
    } catch (err) {
      console.error("[pay] virement", err instanceof Error ? err.message : "avis");
    }
  }
}

async function proposedWire(admin: NoticeDb, wire: FreshRevolutWire) {
  const { data } = await admin.from("crm_customers").select("id, first_name, last_name, company_name, iban");
  const people = (data || []) as RevolutMatchCustomer[];
  const { candidates } = scoreRevolutMatches(
    { counterparty_name: wire.payer, reference: wire.reference, counterparty_iban: wire.iban },
    people
  );
  const customerId = suggestedCustomerId(candidates);
  const label = candidates.find((row) => row.customer_id === customerId)?.label || "";
  const reference = ((wire.reference || "").match(/TB-\d{4}-\d+/i) || [])[0]?.toUpperCase() || "";
  let bookingId: string | null = null;
  if (reference) {
    const booking = await admin.from("crm_bookings").select("id").eq("reference", reference).limit(1);
    const row = (booking.data || [])[0] as { id?: string } | undefined;
    bookingId = row?.id || null;
  }
  if (!customerId && !reference) return null;
  return { customerId, label, reference, bookingId };
}

/** Paiement réussi écrit par le cron, pas par le webhook. Même alerte, même PaymentIntent, aucun second crédit. */
export async function noticeCaughtStripePayments(admin: NoticeDb, intents: StripeIntentInput[]) {
  for (const intent of intents) {
    try {
      const id = (intent.id || "").trim();
      if (!id || intent.status !== "succeeded") continue;
      const meta = intent.metadata || {};
      if (meta.purpose === "hotel_direct" || meta.pay_method === "revolut") continue;
      if (await paymentKeySeen(admin, stripeNoticeKey(id))) continue;
      const customerId = (meta.crm_customer_id || "").trim();
      const wallet = intent.charge?.wallet || null;
      const method = stayPayMethodOf(meta.pay_method) || (wallet === "google_pay" ? "google_pay" : meta.pay_method || intent.charge?.type || "card");
      const name = (intent.payer?.name || intent.charge?.name || intent.customerName || "").trim();
      if (customerId) {
        await notifyClientPayment(admin, {
          customerId,
          customerName: name,
          payer: payerKindOf(meta.payer_kind) || "personal",
          method,
          wallet,
          amountCents: Math.round(Number(intent.amount) || 0),
          currency: intent.currency || "eur",
          reference: (meta.reference || "").trim() || null,
          bookingId: (meta.crm_booking_id || "").trim() || null,
          paymentIntentId: id,
          result: "reçu",
        });
        continue;
      }
      const summary = redactPaymentSecrets(
        paySettledSummary({
          payer: payerKindOf(meta.payer_kind) || "personal",
          method,
          wallet,
          amount: Math.round(Number(intent.amount) || 0) / 100,
          currency: (intent.currency || "eur").toUpperCase(),
          reference: meta.reference,
          result: "reçu",
        })
      );
      const inserted = await admin.from("crm_agency_alerts").insert({
        kind: "payment",
        summary,
        staff_id: null,
        entity_type: "stripe",
        entity_id: id,
      });
      if (inserted.error) continue;
      await sendPayMail({
        name: name || "Un client",
        money: formatMoney(Math.round(Number(intent.amount) || 0) / 100, (intent.currency || "eur").toUpperCase()),
        method,
        reference: (meta.reference || "").trim() || null,
        href: ARGENT_QUEUE_HREF,
      });
    } catch (err) {
      console.error("[pay] rattrapage", err instanceof Error ? err.message : "avis");
    }
  }
}
