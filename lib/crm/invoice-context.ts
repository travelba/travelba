import type { SupabaseClient } from "@supabase/supabase-js";
import { mb3mRealm } from "./mb3m";
import { isVercelPreview } from "./preview-secrets";
import { billingIdentifierLines } from "./billing";
import { businessOutsideEu, displayCountry } from "./countries";
import { queryWithOptionalColumn } from "./optional-column";
import { formatDateFr } from "./money";
import {
  INVOICE_TEMPLATE_ENV,
  invoiceDocument,
  pickStripePayUrl,
  stripePayUrlOf,
  type InvoiceDepositInput,
  type InvoiceDocument,
  type InvoiceWire,
} from "./invoice-document";
import { resolveAgencyContentSid } from "./agency-templates-arm";
import { whatsappContentApproved } from "./twilio-content-sid";

const DAY_MS = 24 * 60 * 60 * 1000;

type PieceRow = {
  booking_id: string;
  piece_number: string | null;
  transaction_ids: string[] | null;
  amount: number | string | null;
  printed_at: string | null;
};

export type InvoiceSnapshot = {
  bookingId: string;
  customerId: string;
  document: InvoiceDocument;
  email: string | null;
  phone: string | null;
  whatsappOptOut: boolean;
  windowOpen: boolean;
  templateSid: string | null;
  previewBlocked: boolean;
};

function addressLines(
  name: string | null | undefined,
  line: string | null | undefined,
  postal: string | null | undefined,
  city: string | null | undefined,
  country: string | null | undefined,
  extra: string[] = []
) {
  const place = [postal, city].map((part) => (part || "").trim()).filter(Boolean).join(" ");
  const countryName = displayCountry(country);
  return [name, line, place, countryName, ...extra].map((part) => (part || "").trim()).filter(Boolean);
}

async function loadWire(): Promise<InvoiceWire | null> {
  try {
    const { loadAgencyEurWire } = await import("./revolut");
    const wire = await loadAgencyEurWire();
    if (!wire?.iban) return null;
    return { iban: wire.iban, bic: wire.bic, holder: wire.accountHolder, source: "revolut" };
  } catch {
    return null;
  }
}

async function loadSettings(admin: SupabaseClient) {
  const empty = { iban: null as string | null, bic: null as string | null, holder: null as string | null, dueDays: null as number | null };
  const { data, error } = await admin
    .from("crm_invoice_settings")
    .select("iban, bic, account_holder, due_days")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return empty;
  const row = data as { iban?: string | null; bic?: string | null; account_holder?: string | null; due_days?: number | null };
  return {
    iban: row.iban || null,
    bic: row.bic || null,
    holder: row.account_holder || null,
    dueDays: row.due_days == null ? null : Number(row.due_days),
  };
}

async function loadSavedStripeUrl(admin: SupabaseClient, bookingId: string) {
  const { data, error } = await admin
    .from("crm_booking_pay_links")
    .select("stripe_pay_url")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (error || !data) return null;
  return stripePayUrlOf((data as { stripe_pay_url?: string | null }).stripe_pay_url);
}

async function discoverStripeUrl(bookingId: string, reference: string) {
  try {
    const { getStripe } = await import("./stripe");
    const stripe = getStripe();
    if (!stripe) return null;
    const page = await stripe.paymentLinks.list({ active: true, limit: 100 });
    return pickStripePayUrl(
      page.data.map((link) => ({
        url: link.url,
        active: link.active,
        metadata: link.metadata,
      })),
      bookingId,
      reference
    );
  } catch {
    return null;
  }
}

async function templateSid() {
  try {
    const sid = (await resolveAgencyContentSid(INVOICE_TEMPLATE_ENV)) || "";
    if (!sid) return null;
    return (await whatsappContentApproved(sid)) ? sid : null;
  } catch {
    return null;
  }
}

async function windowOpen(admin: SupabaseClient, customerId: string, phone: string | null) {
  const since = new Date(Date.now() - DAY_MS).toISOString();
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
  return !byPhone.error && (byPhone.data || []).length > 0;
}

export async function loadInvoicePiece(admin: SupabaseClient, bookingId: string) {
  const realm = mb3mRealm();
  const { data: open, error } = await admin
    .from("crm_mb3m_pieces")
    .select("booking_id, piece_number, transaction_ids, amount, printed_at")
    .eq("booking_id", bookingId)
    .eq("realm", realm)
    .eq("kind", "invoice")
    .is("printed_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const draft = open as PieceRow | null;
  if ((draft?.piece_number || "").trim()) return draft;
  const { data: printed, error: printedError } = await admin
    .from("crm_mb3m_pieces")
    .select("booking_id, piece_number, transaction_ids, amount, printed_at")
    .eq("booking_id", bookingId)
    .eq("realm", realm)
    .eq("kind", "invoice")
    .not("printed_at", "is", null)
    .order("printed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (printedError) throw new Error(printedError.message);
  const issued = printed as PieceRow | null;
  return (issued?.piece_number || "").trim() ? issued : null;
}

export async function loadInvoiceSnapshot(
  admin: SupabaseClient,
  bookingId: string,
  now = new Date()
): Promise<InvoiceSnapshot | null> {
  const piece = await loadInvoicePiece(admin, bookingId);
  const number = (piece?.piece_number || "").trim();
  if (!piece || !number) return null;
  const { data: booking, error: bookingError } = await admin
    .from("crm_bookings")
    .select("reference, title, start_date, end_date, payer_kind, billing_company_id, billing_customer_id, customer_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError) throw new Error(bookingError.message);
  const stay = booking as {
    reference: string;
    title: string | null;
    start_date: string | null;
    end_date: string | null;
    payer_kind: string | null;
    billing_company_id: string | null;
    billing_customer_id: string | null;
    customer_id: string | null;
  } | null;
  if (!stay) return null;
  const payerId = stay.billing_customer_id || stay.customer_id;
  if (!payerId) return null;
  const ids = (piece.transaction_ids || []).filter(Boolean);
  const [{ data: charges }, { data: credits }, { data: payer }, companyResult, settings, savedUrl] = await Promise.all([
    ids.length
      ? admin.from("crm_transactions").select("id, label, amount").in("id", ids)
      : Promise.resolve({ data: [] as { id: string; label: string | null; amount: number | null }[] }),
    admin
      .from("crm_transactions")
      .select("amount, currency, direction, status")
      .eq("booking_id", bookingId)
      .eq("direction", "credit")
      .eq("status", "posted"),
    admin
      .from("crm_customers")
      .select(
        "first_name, last_name, email, billing_email, phone, whatsapp_opt_out_at, billing_address_line, billing_postal_code, billing_city, billing_country, address_line, postal_code, city, country"
      )
      .eq("id", payerId)
      .maybeSingle(),
    stay.payer_kind === "company" && stay.billing_company_id
      ? queryWithOptionalColumn(
          (columns) =>
            admin.from("crm_billing_companies").select(columns).eq("id", stay.billing_company_id!).maybeSingle(),
          "company_name, siret, vat_number, billing_email, billing_address_line, billing_postal_code, billing_city, billing_country",
          "registration_number"
        )
      : Promise.resolve({ data: null, error: null }),
    loadSettings(admin),
    loadSavedStripeUrl(admin, bookingId),
  ]);
  if (companyResult.error) throw new Error(companyResult.error.message || "Société de facturation illisible.");
  const company = companyResult.data;
  const person = payer as {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    billing_email: string | null;
    phone: string | null;
    whatsapp_opt_out_at: string | null;
    billing_address_line: string | null;
    billing_postal_code: string | null;
    billing_city: string | null;
    billing_country: string | null;
    address_line: string | null;
    postal_code: string | null;
    city: string | null;
    country: string | null;
  } | null;
  const firm = company as {
    company_name: string | null;
    siret: string | null;
    vat_number: string | null;
    registration_number?: string | null;
    billing_email: string | null;
    billing_address_line: string | null;
    billing_postal_code: string | null;
    billing_city: string | null;
    billing_country: string | null;
  } | null;
  const byId = new Map(
    ((charges || []) as { id: string; label: string | null; amount: number | null }[]).map((row) => [row.id, row])
  );
  const lines = ids.flatMap((id) => {
    const row = byId.get(id);
    if (!row) return [];
    return [{ label: (row.label || "").trim() || "Prestation", amount: Number(row.amount) || 0 }];
  });
  if (!lines.length && Number(piece.amount)) lines.push({ label: (stay.title || "").trim() || "Séjour", amount: Number(piece.amount) || 0 });
  const deposits: InvoiceDepositInput[] = ((credits || []) as { amount: number | null; currency: string | null }[]).map((row) => ({
    amount: Number(row.amount) || 0,
    currency: row.currency,
  }));
  const personName = [person?.first_name, person?.last_name].filter(Boolean).join(" ").trim();
  const billTo = firm
    ? addressLines(
        firm.company_name,
        firm.billing_address_line,
        firm.billing_postal_code,
        firm.billing_city,
        firm.billing_country,
        billingIdentifierLines(firm)
      )
    : addressLines(
        personName,
        person?.billing_address_line || person?.address_line,
        person?.billing_postal_code || person?.postal_code,
        person?.billing_city || person?.city,
        person?.billing_country || person?.country
      );
  const dates = [stay.start_date ? formatDateFr(stay.start_date) : "", stay.end_date ? formatDateFr(stay.end_date) : ""]
    .filter(Boolean)
    .join(" — ");
  const revolut = await loadWire();
  const wire =
    revolut ||
    (settings.iban
      ? { iban: settings.iban, bic: settings.bic || "", holder: settings.holder || "", source: "reglage" as const }
      : null);
  const reference = stay.reference || "";
  const stripeUrl = savedUrl || (await discoverStripeUrl(bookingId, reference));
  const document = invoiceDocument({
    number,
    reference,
    title: (stay.title || "").trim() || reference || "Séjour",
    dates,
    billTo,
    lines,
    deposits,
    now,
    dueDays: settings.dueDays,
    wire,
    stripeUrl,
    payerFirstName: person?.first_name,
    outsideEu: firm ? businessOutsideEu(firm.billing_country) : false,
  });
  const email = (firm?.billing_email || person?.billing_email || person?.email || "").trim() || null;
  const phone = (person?.phone || "").trim() || null;
  const [open, sid] = await Promise.all([
    windowOpen(admin, payerId, phone).catch(() => false),
    templateSid(),
  ]);
  return {
    bookingId,
    customerId: payerId,
    document,
    email,
    phone,
    whatsappOptOut: Boolean(person?.whatsapp_opt_out_at),
    windowOpen: open,
    templateSid: sid,
    previewBlocked: isVercelPreview(),
  };
}
