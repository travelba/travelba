import type Stripe from "stripe";
import { crmPaymentLinkParams } from "@/lib/crm/stripe-payer";

/** Seul chemin de création d'un lien Stripe depuis le CRM. */
export async function createCrmPaymentLink(
  stripe: Stripe,
  input: {
    email?: string | null;
    reference?: string | null;
    bookingId?: string | null;
    customerId?: string | null;
    priceId?: string | null;
  }
) {
  const draft = crmPaymentLinkParams(input);
  if (!draft.ok) return draft;
  const link = await stripe.paymentLinks.create(draft.params);
  return { ok: true as const, id: link.id, url: link.url, email: draft.email };
}
