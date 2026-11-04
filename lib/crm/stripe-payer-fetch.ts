import type Stripe from "stripe";
import {
  resolveStripePayer,
  type StripeCustomField,
  type StripePayerIdentity,
  type StripePayerSources,
} from "@/lib/crm/stripe-payer";

export type StripeCustomerCache = Map<string, Promise<{ email: string | null; name: string | null }>>;

export function createStripeCustomerCache(): StripeCustomerCache {
  return new Map();
}

function clean(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function idOf(value: unknown) {
  if (typeof value === "string") return clean(value);
  if (value && typeof value === "object" && "id" in value) return clean((value as { id?: unknown }).id);
  return null;
}

function fieldValue(field: Stripe.Checkout.Session.CustomField) {
  return clean(field.text?.value) || clean(field.dropdown?.value) || clean(field.numeric?.value);
}

function fieldLabel(field: Stripe.Checkout.Session.CustomField) {
  return clean(field.label?.custom) || clean(field.key) || "";
}

function sessionFields(session: Stripe.Checkout.Session): StripeCustomField[] {
  return (session.custom_fields || []).map((field) => ({ label: fieldLabel(field), value: fieldValue(field) }));
}

function productName(link: Stripe.PaymentLink) {
  const items = link.line_items?.data || [];
  for (const item of items) {
    const price = item.price;
    const product = price && typeof price === "object" ? price.product : null;
    if (product && typeof product === "object" && "name" in product) {
      const name = clean((product as { name?: unknown }).name);
      if (name) return name;
    }
    const description = clean(item.description);
    if (description) return description;
  }
  return null;
}

async function cachedCustomer(stripe: Stripe, cache: StripeCustomerCache, id: string) {
  const existing = cache.get(id);
  if (existing) return existing;
  const pending = stripe.customers
    .retrieve(id)
    .then((customer) => {
      if (customer.deleted) return { email: null, name: null };
      return { email: clean(customer.email), name: clean(customer.name) };
    })
    .catch(() => ({ email: null, name: null }));
  cache.set(id, pending);
  return pending;
}

export type StripePayerLookup = {
  intentId?: string | null;
  customerId?: string | null;
  invoiceId?: string | null;
  billingEmail?: string | null;
  billingName?: string | null;
  receiptEmail?: string | null;
  description?: string | null;
  metadata?: Record<string, string> | null;
};

/**
 * Complète l'identité. La session, le client et la facture ne sont lus
 * que s'il manque l'e-mail, le nom ou la désignation. Le client Stripe est mis en cache.
 */
export async function lookupStripePayer(
  stripe: Stripe,
  input: StripePayerLookup,
  cache: StripeCustomerCache = createStripeCustomerCache()
): Promise<StripePayerIdentity> {
  const sources: StripePayerSources = {
    billingEmail: input.billingEmail,
    billingName: input.billingName,
    receiptEmail: input.receiptEmail,
    description: input.description,
    metadata: input.metadata,
    invoiceId: clean(input.invoiceId),
  };
  const intentId = clean(input.intentId);
  const knownEmail = clean(input.billingEmail) || clean(input.receiptEmail);
  const knownName = clean(input.billingName);
  const knownDesignation = clean(input.description);
  if (intentId && (!knownEmail || !knownName || !knownDesignation)) {
    try {
      const page = await stripe.checkout.sessions.list({ payment_intent: intentId, limit: 1 });
      const session = page.data[0];
      if (session) {
        sources.checkoutSessionId = session.id;
        sources.sessionEmail = clean(session.customer_details?.email);
        sources.sessionName = clean(session.customer_details?.name);
        sources.customFields = sessionFields(session);
        sources.paymentLinkId = idOf(session.payment_link);
        sources.invoiceId = sources.invoiceId || idOf(session.invoice);
        const sessionCustomer = idOf(session.customer);
        if (sessionCustomer && !clean(input.customerId)) input = { ...input, customerId: sessionCustomer };
      }
    } catch (err) {
      console.error("[stripe] session", err instanceof Error ? err.message : "lecture");
    }
  }
  const customerId = clean(input.customerId);
  const emailSoFar = knownEmail || clean(sources.sessionEmail);
  const nameSoFar = knownName || clean(sources.sessionName);
  if (customerId && (!emailSoFar || !nameSoFar)) {
    const person = await cachedCustomer(stripe, cache, customerId);
    sources.customerEmail = person.email;
    sources.customerName = person.name;
  }
  const afterCustomer = resolveStripePayer(sources);
  if (sources.invoiceId && (!afterCustomer.email || !afterCustomer.name)) {
    try {
      const invoice = await stripe.invoices.retrieve(sources.invoiceId);
      sources.invoiceEmail = clean(invoice.customer_email);
      sources.invoiceName = clean(invoice.customer_name);
      sources.invoiceId = invoice.id;
    } catch (err) {
      console.error("[stripe] facture", err instanceof Error ? err.message : "lecture");
    }
  }
  const afterInvoice = resolveStripePayer(sources);
  if (!afterInvoice.designation && sources.paymentLinkId) {
    try {
      const link = await stripe.paymentLinks.retrieve(sources.paymentLinkId, {
        expand: ["line_items.data.price.product"],
      });
      sources.productName = productName(link);
    } catch (err) {
      console.error("[stripe] lien", err instanceof Error ? err.message : "lecture");
    }
  }
  return resolveStripePayer(sources);
}
