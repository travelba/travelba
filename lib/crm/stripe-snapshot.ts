import type Stripe from "stripe";
import { type StripeChargeHint, type StripeIntentInput } from "@/lib/crm/stripe-inbox";

export function snapshotFromPaymentIntent(intent: Stripe.PaymentIntent): StripeIntentInput {
  const charge = intent.latest_charge;
  const details = charge && typeof charge !== "string" ? charge.payment_method_details : null;
  const card = details && details.type === "card" ? details.card : null;
  const hint: StripeChargeHint | null =
    charge && typeof charge !== "string"
      ? {
          name: charge.billing_details?.name ?? null,
          email: charge.billing_details?.email ?? null,
          type: details?.type ?? null,
          last4: card?.last4 ?? null,
          wallet: card?.wallet?.type ?? null,
        }
      : null;
  const customer = intent.customer;
  return {
    id: intent.id,
    status: intent.status,
    amount: intent.amount,
    currency: intent.currency,
    description: intent.description,
    receiptEmail: intent.receipt_email,
    created: intent.created,
    customerId: !customer ? null : typeof customer === "string" ? customer : customer.id,
    metadata: intent.metadata,
    charge: hint,
  };
}
