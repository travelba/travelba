import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { getStripe } from "@/lib/crm/stripe";

export async function POST(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const stripe = getStripe();
  if (!stripe) return jsonError("Paiement Stripe non configuré", 503);
  const body = await request.json().catch(() => null);
  const scheduleId = String(body?.schedule_id || "");
  if (!scheduleId) return jsonError("Échéance requise");

  const { data: schedule, error } = await auth.supabase
    .from("crm_payment_schedules")
    .select("id,label,amount,paid_amount,currency,status,due_on")
    .eq("id", scheduleId)
    .eq("customer_id", auth.customer.id)
    .maybeSingle();
  if (error) return jsonError(error.message, 500);
  if (!schedule || !["pending", "overdue"].includes(schedule.status)) {
    return jsonError("Cette échéance n’est pas payable", 409);
  }
  const remaining = Math.max(0, Number(schedule.amount) - Number(schedule.paid_amount));
  if (remaining <= 0) return jsonError("Cette échéance est déjà réglée", 409);

  const origin = new URL(request.url).origin;
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const fiveMinuteBucket = Math.floor(Date.now() / (5 * 60 * 1000));
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      customer: auth.customer.stripe_customer_id || undefined,
      customer_email: auth.customer.stripe_customer_id ? undefined : auth.customer.email,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: schedule.currency.toLowerCase(),
          unit_amount: Math.round(remaining * 100),
          product_data: { name: schedule.label, description: `Échéance du ${schedule.due_on}` },
        },
      }],
      metadata: {
        crm_schedule_id: schedule.id,
        crm_customer_id: auth.customer.id,
      },
      payment_intent_data: {
        metadata: {
          crm_schedule_id: schedule.id,
          crm_customer_id: auth.customer.id,
        },
      },
      integration_identifier: `travelba_${suffix}`,
      success_url: `${origin}/mon-compte/paiements?paiement=succes`,
      cancel_url: `${origin}/mon-compte/paiements?paiement=annule`,
    },
    { idempotencyKey: `crm-schedule-checkout/${schedule.id}/${Math.round(remaining * 100)}/${fiveMinuteBucket}` }
  );
  if (!session.url) return jsonError("Stripe n’a pas retourné de page de paiement", 502);
  return NextResponse.json({ url: session.url });
}
