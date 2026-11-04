/** Identité du payeur Stripe. Aucun PAN, aucun appel réseau. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIECE = /^\d{4}$/;
const SECRET_VALUE = /^(cus_|pi_|ch_|cs_|plink_|pm_|in_|price_|prod_)/;

export type StripeCustomField = { label?: string | null; value?: string | null };

export type StripePayerSources = {
  billingEmail?: string | null;
  billingName?: string | null;
  receiptEmail?: string | null;
  description?: string | null;
  metadata?: Record<string, string> | null;
  sessionEmail?: string | null;
  sessionName?: string | null;
  checkoutSessionId?: string | null;
  paymentLinkId?: string | null;
  customFields?: StripeCustomField[] | null;
  productName?: string | null;
  customerEmail?: string | null;
  customerName?: string | null;
  invoiceId?: string | null;
  invoiceEmail?: string | null;
  invoiceName?: string | null;
};

export type StripePayerRaw = {
  customer_email: string | null;
  customer_name: string | null;
  checkout_session_id: string | null;
  payment_link_id: string | null;
  custom_fields: { label: string; value: string }[];
  invoice_id: string | null;
};

export type StripePayerIdentity = {
  email: string | null;
  name: string | null;
  designation: string | null;
  raw: StripePayerRaw;
};

export type PayerSuggestionReason = "email" | "stripe_history" | "piece";

export type PayerSuggestion = {
  customerId: string;
  reason: PayerSuggestionReason;
  score: number;
  bookingId: string | null;
  reference: string | null;
};

export type PayerHistory = { stripeCustomerId: string; customerId: string };

export type PayerPiece = {
  number: string;
  customerId: string;
  bookingId?: string | null;
  reference?: string | null;
};

function clean(value: string | null | undefined) {
  const text = (value || "").trim();
  return text || null;
}

function first(values: Array<string | null | undefined>) {
  for (const value of values) {
    const text = clean(value);
    if (text) return text;
  }
  return null;
}

function emailKey(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

/** Texte saisi dans les champs du lien. Une suite de chiffres de carte est ignorée. */
export function customFieldText(fields: StripeCustomField[] | null | undefined) {
  const parts: string[] = [];
  for (const field of fields || []) {
    const value = clean(field.value);
    if (!value || /\d{13,19}/.test(value.replace(/\s+/g, ""))) continue;
    parts.push(value);
  }
  return parts.length ? parts.join(" · ") : null;
}

export function customFieldRows(fields: StripeCustomField[] | null | undefined) {
  const rows: { label: string; value: string }[] = [];
  for (const field of fields || []) {
    const value = clean(field.value);
    if (!value || /\d{13,19}/.test(value.replace(/\s+/g, ""))) continue;
    rows.push({ label: (clean(field.label) || "").slice(0, 80), value: value.slice(0, 200) });
    if (rows.length >= 3) break;
  }
  return rows;
}

/** Désignation lue dans les metadata, après la description, les champs et le nom du produit. */
export function designationFromMetadata(metadata: Record<string, string> | null | undefined) {
  const meta = metadata || {};
  const preferred = ["designation", "libelle", "description", "reference", "dossier", "dossier_ref", "booking_reference"];
  for (const key of preferred) {
    const value = clean(meta[key]);
    if (value && !SECRET_VALUE.test(value) && !UUID.test(value)) return value;
  }
  for (const [key, raw] of Object.entries(meta)) {
    if (/customer|booking_id|method|payer|company|purpose|pay_/.test(key)) continue;
    const value = clean(raw);
    if (!value || value.length > 80 || SECRET_VALUE.test(value) || UUID.test(value)) continue;
    return value;
  }
  return null;
}

/**
 * E-mail : facturation, reçu, session, client Stripe, facture.
 * Nom : facturation, session, client Stripe, facture.
 * Désignation : description, champs du lien, nom du produit, metadata.
 */
export function resolveStripePayer(input: StripePayerSources): StripePayerIdentity {
  return {
    email: first([input.billingEmail, input.receiptEmail, input.sessionEmail, input.customerEmail, input.invoiceEmail]),
    name: first([input.billingName, input.sessionName, input.customerName, input.invoiceName]),
    designation: first([
      input.description,
      customFieldText(input.customFields),
      input.productName,
      designationFromMetadata(input.metadata),
    ]),
    raw: {
      customer_email: clean(input.customerEmail),
      customer_name: clean(input.customerName),
      checkout_session_id: clean(input.checkoutSessionId),
      payment_link_id: clean(input.paymentLinkId),
      custom_fields: customFieldRows(input.customFields),
      invoice_id: clean(input.invoiceId),
    },
  };
}

/** Quatre chiffres seuls : numéro de facture, de devis ou de pièce MB3M. */
export function pieceDigits(value: string | null | undefined) {
  const text = (value || "").trim();
  return PIECE.test(text) ? text : null;
}

export function numberMatches(stored: string | null | undefined, digits: string) {
  const text = (stored || "").trim();
  if (!text || !PIECE.test(digits)) return false;
  if (text === digits) return true;
  return new RegExp(`(?:^|\\D)${digits}(?:\\D|$)`).test(text);
}

export function isInvoicePieceKind(kind: string | null | undefined) {
  const value = (kind || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  return /facture|invoice|devis|quote|proforma/.test(value);
}

/**
 * Proposition, jamais un crédit. E-mail d'abord, sinon un client Stripe déjà
 * rapproché. Un numéro à quatre chiffres s'ajoute, même si l'e-mail a déjà parlé.
 */
export function suggestStripePayers(input: {
  email?: string | null;
  stripeCustomerId?: string | null;
  designation?: string | null;
  customers: { id: string; email?: string | null }[];
  history?: PayerHistory[];
  pieces?: PayerPiece[];
}): PayerSuggestion[] {
  const out: PayerSuggestion[] = [];
  const email = emailKey(input.email);
  if (email) {
    const hits = input.customers.filter((customer) => emailKey(customer.email) === email);
    if (hits.length === 1) {
      out.push({ customerId: hits[0].id, reason: "email", score: 80, bookingId: null, reference: null });
    }
  }
  const stripeCustomer = (input.stripeCustomerId || "").trim();
  if (!out.some((item) => item.reason === "email") && stripeCustomer) {
    const ids = [
      ...new Set(
        (input.history || [])
          .filter((item) => item.stripeCustomerId === stripeCustomer && item.customerId)
          .map((item) => item.customerId)
      ),
    ];
    if (ids.length === 1) {
      out.push({ customerId: ids[0], reason: "stripe_history", score: 75, bookingId: null, reference: null });
    }
  }
  const digits = pieceDigits(input.designation);
  if (digits) {
    const matched = (input.pieces || []).filter((piece) => numberMatches(piece.number, digits) && piece.customerId);
    const ids = [...new Set(matched.map((piece) => piece.customerId))];
    if (ids.length === 1) {
      const booking = matched.find((piece) => piece.bookingId) || matched[0];
      const existing = out.find((item) => item.customerId === ids[0]);
      if (existing) {
        existing.bookingId = existing.bookingId || booking.bookingId || null;
        existing.reference = existing.reference || booking.reference || null;
      } else {
        out.push({
          customerId: ids[0],
          reason: "piece",
          score: 70,
          bookingId: booking.bookingId || null,
          reference: booking.reference || null,
        });
      }
    }
  }
  return out;
}

export type CrmPaymentLinkParams = {
  line_items: { price: string; quantity: number }[];
  customer_creation: "always";
  metadata: Record<string, string>;
  payment_intent_data: { description: string; metadata: Record<string, string> };
};

/** Un lien créé par le CRM exige l'e-mail et pose la référence du dossier dans les metadata. */
export function crmPaymentLinkParams(input: {
  email?: string | null;
  reference?: string | null;
  bookingId?: string | null;
  customerId?: string | null;
  priceId?: string | null;
}): { ok: true; email: string; params: CrmPaymentLinkParams } | { ok: false; error: string } {
  const email = clean(input.email);
  if (!email || !EMAIL.test(email)) {
    return { ok: false, error: "L’e-mail du client est obligatoire pour créer le lien." };
  }
  const reference = clean(input.reference);
  if (!reference) return { ok: false, error: "La référence du dossier est obligatoire." };
  const priceId = clean(input.priceId);
  if (!priceId) return { ok: false, error: "Le prix du lien est obligatoire." };
  const metadata: Record<string, string> = { reference };
  const bookingId = clean(input.bookingId);
  const customerId = clean(input.customerId);
  if (bookingId) metadata.crm_booking_id = bookingId;
  if (customerId) metadata.crm_customer_id = customerId;
  return {
    ok: true,
    email,
    params: {
      line_items: [{ price: priceId, quantity: 1 }],
      customer_creation: "always",
      metadata,
      payment_intent_data: { description: reference, metadata: { ...metadata } },
    },
  };
}
