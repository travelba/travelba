import type Stripe from "stripe";
import { type StripeChargeHint, type StripeIntentInput } from "@/lib/crm/stripe-inbox";

function personOf(customer: Stripe.PaymentIntent["customer"] | Stripe.Charge["customer"] | null | undefined) {
  if (!customer || typeof customer === "string") {
    return { id: typeof customer === "string" ? customer : null, name: null, email: null };
  }
  if ("deleted" in customer && customer.deleted) return { id: customer.id, name: null, email: null };
  return { id: customer.id, name: customer.name || null, email: customer.email || null };
}

export function snapshotFromPaymentIntent(intent: Stripe.PaymentIntent): StripeIntentInput {
  const charge = intent.latest_charge;
  const details = charge && typeof charge !== "string" ? charge.payment_method_details : null;
  const card = details && details.type === "card" ? details.card : null;
  const chargeCustomer =
    charge && typeof charge !== "string" ? personOf(charge.customer) : { id: null, name: null, email: null };
  const intentCustomer = personOf(intent.customer);
  const hint: StripeChargeHint | null =
    charge && typeof charge !== "string"
      ? {
          name: charge.billing_details?.name || chargeCustomer.name || intentCustomer.name,
          email: charge.billing_details?.email || charge.receipt_email || chargeCustomer.email || intentCustomer.email,
          type: details?.type ?? null,
          last4: card?.last4 ?? null,
          wallet: card?.wallet?.type ?? null,
        }
      : null;
  return {
    id: intent.id,
    status: intent.status,
    amount: intent.amount,
    currency: intent.currency,
    description: intent.description,
    receiptEmail: intent.receipt_email,
    created: intent.created,
    customerId: intentCustomer.id || chargeCustomer.id,
    customerName: intentCustomer.name || chargeCustomer.name,
    customerEmail: intentCustomer.email || chargeCustomer.email,
    metadata: intent.metadata,
    charge: hint,
  };
}
