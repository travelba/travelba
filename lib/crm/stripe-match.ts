import { payerKindOf } from "@/lib/crm/payer";
import {
  matchTokens,
  normalizeMatchText,
  suggestedCustomerId,
  tokensSpell,
} from "@/lib/crm/revolut-match";
import { stripeCreditFromIntent } from "@/lib/crm/stripe-pay";
import {
  stripeInboxCopy,
  stripeInboxCreditKind,
  stripeInboxCreditLabel,
  type StripeInboxMethod,
} from "@/lib/crm/stripe-inbox";
import { shownPersonName } from "@/lib/crm/identity";
import type { CrmCustomer, CrmStripeTransaction } from "@/lib/crm/types";

export type StripeMatchReason =
  | "metadata"
  | "stripe_customer"
  | "email"
  | "full_name"
  | "company_name"
  | "dossier"
  | "facture"
  | "partial";

export type StripeMatchCandidate = {
  customer_id: string;
  score: number;
  reason: StripeMatchReason;
  label: string;
};

export type StripeBillingCompany = {
  customer_id: string;
  company_name: string | null;
};

export type StripeIndexedDossier = {
  booking_id: string | null;
  customer_id: string;
  reference: string | null;
  label: string;
  reason: "dossier" | "facture";
  /** Numéro comparable, sans zéros de tête. */
  number: string;
};

export type StripeDossierProposal = {
  booking_id: string | null;
  customer_id: string;
  reference: string | null;
  label: string;
  reason: "dossier" | "facture";
};

export type StripeMatchExtras = {
  companies?: StripeBillingCompany[];
  dossiers?: StripeIndexedDossier[];
};

export type StripeMatchResult = {
  autoCustomerId: string | null;
  candidates: StripeMatchCandidate[];
  dossier: StripeDossierProposal | null;
};

export type StripeMatchCustomer = Pick<CrmCustomer, "id" | "first_name" | "last_name" | "company_name"> &
  Partial<Pick<CrmCustomer, "email" | "stripe_customer_id">>;

export const STRIPE_MATCH_SELECT =
  "id, first_name, last_name, company_name, email, stripe_customer_id";

export type StripeMatchRow = Pick<CrmStripeTransaction, "payer_name" | "payer_email" | "reference"> & {
  raw?: unknown;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StripeAdmin = { from: (table: string) => any };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function stripeMetadata(raw: unknown) {
  const meta = asRecord(asRecord(raw)?.metadata);
  const out: Record<string, string> = {};
  if (!meta) return out;
  for (const [key, value] of Object.entries(meta)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

function stripeCustomerId(raw: unknown) {
  const id = asRecord(raw)?.stripe_customer_id;
  return typeof id === "string" ? id.trim() : "";
}

function customerLabel(c: Pick<CrmCustomer, "first_name" | "last_name" | "company_name">) {
  const name = shownPersonName(c);
  if (c.company_name?.trim()) {
    return name ? `${name} · ${c.company_name.trim()}` : c.company_name.trim();
  }
  return name || "Client";
}

function emailKey(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

/** « 2108 » ou « 02108 ». Une phrase (« sejour Maroc ») ne compte pas. */
export function stripeDescriptionNumber(value: string | null | undefined) {
  const text = (value || "").trim();
  if (!/^\d{3,8}$/.test(text)) return null;
  const number = String(Number(text));
  return number === "0" ? null : number;
}

/** Séquence du dossier, pas l’année : TB-2026-2108 → 2108. TB-2026-0001 → 1. */
export function bookingReferenceNumber(reference: string | null | undefined) {
  const text = (reference || "").trim();
  const yearly = text.match(/^TB-(\d{4})-(\d+)$/i);
  if (yearly) {
    const number = String(Number(yearly[2]));
    return number === "0" ? null : number;
  }
  const plain = text.match(/^(\d+)$/);
  if (plain) {
    const number = String(Number(plain[1]));
    return number === "0" ? null : number;
  }
  const short = text.match(/^TB-(\d+)$/i);
  if (short) {
    const number = String(Number(short[1]));
    return number === "0" ? null : number;
  }
  return null;
}

/** « 2108 » ou « F-2108 ». « 2026-2108 » ne se réduit pas au dernier groupe. */
export function invoicePieceNumber(value: string | null | undefined) {
  const text = (value || "").trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) {
    const number = String(Number(text));
    return number === "0" ? null : number;
  }
  const tail = text.match(/(\d+)$/);
  if (!tail) return null;
  const prefix = text.slice(0, text.length - tail[1].length);
  if (/\d/.test(prefix)) return null;
  const number = String(Number(tail[1]));
  return number === "0" ? null : number;
}

export function stripeMatchNumbers(rows: { reference?: string | null }[]) {
  return [...new Set(rows.map((row) => stripeDescriptionNumber(row.reference)).filter((number): number is string => Boolean(number)))];
}

function payerTokens(row: StripeMatchRow) {
  const name = (row.payer_name || "").trim();
  const named = name.includes("@") ? "" : name;
  return matchTokens(`${named} ${row.reference || ""}`);
}

function companyDisplay(customer: StripeMatchCustomer, companyName: string) {
  const base = customerLabel(customer);
  const company = companyName.trim();
  if (!company) return base;
  if (normalizeMatchText(base) === normalizeMatchText(company)) return base;
  if (base && base !== "Client" && normalizeMatchText(base).includes(normalizeMatchText(company))) return base;
  if (!base || base === "Client") return company;
  return `${base} · ${company}`;
}

/**
 * Auto seulement sur un hit unique et certain : metadata, customer Stripe, ou e-mail.
 * Société, dossier et facture restent des propositions (score < 90).
 */
export function scoreStripeMatches(
  row: StripeMatchRow,
  customers: StripeMatchCustomer[],
  extras: StripeMatchExtras = {}
): StripeMatchResult {
  const empty = { autoCustomerId: null, candidates: [], dossier: null };
  if (!customers.length) return empty;

  const metadata = stripeMetadata(row.raw);
  const metaCustomer = (metadata.crm_customer_id || "").trim();
  const stripeCustomer = stripeCustomerId(row.raw);
  const email = emailKey(row.payer_email);
  const tokens = payerTokens(row);

  const byId = new Map<string, StripeMatchCandidate>();

  function upsert(customer: StripeMatchCustomer, score: number, reason: StripeMatchReason, label?: string) {
    const prev = byId.get(customer.id);
    if (prev && prev.score >= score) return;
    byId.set(customer.id, {
      customer_id: customer.id,
      score,
      reason,
      label: label || customerLabel(customer),
    });
  }

  if (metaCustomer) {
    const hit = customers.find((customer) => customer.id === metaCustomer);
    if (hit) upsert(hit, 100, "metadata");
  }

  if (stripeCustomer) {
    const hits = customers.filter((customer) => (customer.stripe_customer_id || "").trim() === stripeCustomer);
    if (hits.length === 1) upsert(hits[0], 100, "stripe_customer");
    else for (const hit of hits) upsert(hit, 70, "partial");
  }

  if (email) {
    const hits = customers.filter((customer) => emailKey(customer.email) === email);
    if (hits.length === 1) upsert(hits[0], 100, "email");
    else for (const hit of hits) upsert(hit, 70, "partial");
  }

  const lastNameCounts = new Map<string, number>();
  const companyCounts = new Map<string, number>();
  for (const customer of customers) {
    const last = normalizeMatchText(customer.last_name);
    if (last) lastNameCounts.set(last, (lastNameCounts.get(last) || 0) + 1);
    const company = normalizeMatchText(customer.company_name);
    if (company.length >= 3) companyCounts.set(company, (companyCounts.get(company) || 0) + 1);
  }

  if (tokens.length) {
    for (const customer of customers) {
      const first = normalizeMatchText(customer.first_name);
      const last = normalizeMatchText(customer.last_name);
      const company = normalizeMatchText(customer.company_name);
      if (first && last && first.length >= 2 && last.length >= 2) {
        if (tokensSpell(tokens, `${first}${last}`) || tokensSpell(tokens, `${last}${first}`)) {
          upsert(customer, 80, "full_name");
          continue;
        }
      }
      if (company.length >= 3 && tokensSpell(tokens, company)) {
        upsert(customer, 70, "company_name");
        continue;
      }
      if (last.length >= 3 && tokensSpell(tokens, last)) {
        const unique = (lastNameCounts.get(last) || 0) === 1;
        upsert(customer, unique ? 60 : 55, "partial");
      }
    }
  }

  if (tokens.length) {
    for (const company of extras.companies || []) {
      const name = (company.company_name || "").trim();
      const key = normalizeMatchText(name);
      if (key.length < 3 || !tokensSpell(tokens, key)) continue;
      const customer = customers.find((person) => person.id === company.customer_id);
      if (!customer) continue;
      upsert(customer, 70, "company_name", companyDisplay(customer, name));
    }
  }

  const number = stripeDescriptionNumber(row.reference);
  const dossierHits = number
    ? (extras.dossiers || []).filter((item) => item.number === number && item.customer_id)
    : [];
  const bookingIds = [...new Set(dossierHits.map((item) => item.booking_id).filter((id): id is string => Boolean(id)))];
  const dossierCustomers = [...new Set(dossierHits.map((item) => item.customer_id))];
  let dossier: StripeDossierProposal | null = null;
  if (dossierCustomers.length === 1 && (dossierHits.length === 1 || bookingIds.length === 1)) {
    const group = bookingIds.length === 1 ? dossierHits.filter((item) => item.booking_id === bookingIds[0]) : dossierHits;
    const hit = group.find((item) => item.reason === "facture") || group[0] || dossierHits[0];
    dossier = {
      booking_id: hit.booking_id,
      customer_id: hit.customer_id,
      reference: hit.reference,
      label: hit.label,
      reason: hit.reason,
    };
  }
  const dossierScore = dossier && dossierCustomers.length === 1 ? 75 : 60;
  for (const customerId of dossierCustomers) {
    const customer = customers.find((person) => person.id === customerId);
    const hit = dossierHits.find((item) => item.customer_id === customerId);
    if (!customer || !hit) continue;
    const previous = byId.get(customer.id);
    const label = previous?.reason === "company_name" ? previous.label : customerLabel(customer);
    upsert(customer, dossierScore, hit.reason, label);
  }

  const candidates = [...byId.values()].sort(
    (a, b) => b.score - a.score || a.label.localeCompare(b.label, "fr")
  );
  return { autoCustomerId: suggestedCustomerId(candidates) || null, candidates, dossier };
}

export function suggestionsForStripeCustomer(
  customer: StripeMatchCustomer,
  rows: CrmStripeTransaction[],
  population: StripeMatchCustomer[] = [customer],
  extras: StripeMatchExtras = {}
) {
  const people = population.some((person) => person.id === customer.id)
    ? population
    : [customer, ...population];
  return rows
    .filter((row) => row.status === "unmatched" && row.direction !== "debit")
    .map((row) => {
      const scored = scoreStripeMatches(row, people, extras);
      const hit = scored.candidates.find((candidate) => candidate.customer_id === customer.id);
      return hit
        ? {
            row,
            candidate: hit,
            certain: suggestedCustomerId(scored.candidates) === customer.id,
            dossier: scored.dossier?.customer_id === customer.id ? scored.dossier : null,
          }
        : null;
    })
    .filter(
      (
        item
      ): item is {
        row: CrmStripeTransaction;
        candidate: StripeMatchCandidate;
        certain: boolean;
        dossier: StripeDossierProposal | null;
      } => Boolean(item)
    )
    .sort((a, b) => b.candidate.score - a.candidate.score);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidOrNull(value: string) {
  return UUID.test(value) ? value : null;
}

function inboxCredit(row: CrmStripeTransaction, customerId: string, bookingId: string | null) {
  const metadata = stripeMetadata(row.raw);
  const payer = payerKindOf(metadata.payer_kind);
  const companyId = uuidOrNull((metadata.billing_company_id || "").trim());
  const metaCustomer = (metadata.crm_customer_id || "").trim();
  const fromMetadata = metaCustomer === customerId ? uuidOrNull((metadata.crm_booking_id || "").trim()) : null;
  const method = (row.method || "other") as StripeInboxMethod;
  return {
    customer_id: customerId,
    booking_id: bookingId || fromMetadata,
    billing_company_id: companyId,
    payer_kind: payer,
    direction: "credit" as const,
    kind: stripeInboxCreditKind(method),
    amount: Math.abs(Number(row.amount)),
    currency: (row.currency || "EUR").toUpperCase(),
    occurred_on: row.booked_at ? String(row.booked_at).slice(0, 10) : null,
    label: stripeInboxCreditLabel({ payerName: row.payer_name, method }),
    source: "stripe" as const,
    external_id: row.stripe_payment_intent_id,
    status: "posted" as const,
  };
}

function creditPayload(row: CrmStripeTransaction, customerId: string, bookingId: string | null) {
  const fromIntent = stripeCreditFromIntent({
    id: row.stripe_payment_intent_id,
    status: "succeeded",
    amount: Math.round(Math.abs(Number(row.amount)) * 100),
    currency: row.currency,
    metadata: stripeMetadata(row.raw),
  });
  if (fromIntent && fromIntent.customer_id === customerId) {
    return bookingId && !fromIntent.booking_id ? { ...fromIntent, booking_id: bookingId } : fromIntent;
  }
  return inboxCredit(row, customerId, bookingId);
}

async function bookingOwnedBy(admin: StripeAdmin, bookingId: string, customerId: string) {
  const id = uuidOrNull(bookingId);
  if (!id) return null;
  const query = admin.from("crm_bookings");
  if (!query || typeof query.select !== "function") return null;
  const { data } = await query.select("id, customer_id, billing_customer_id").eq("id", id).maybeSingle();
  if (!data?.id) return null;
  const payer = String(data.billing_customer_id || data.customer_id || "");
  return payer === customerId ? String(data.id) : null;
}

export async function applyStripeToCustomer(
  admin: StripeAdmin,
  row: CrmStripeTransaction,
  customerId: string,
  proposedBookingId?: string | null
) {
  if (row.status === "matched") return { ok: false as const, error: "already_matched" };
  if (row.direction === "debit") return { ok: false as const, error: "not_a_credit" };
  if (!row.stripe_payment_intent_id) return { ok: false as const, error: "missing_intent" };

  const bookingId = proposedBookingId ? await bookingOwnedBy(admin, proposedBookingId, customerId) : null;
  const payload = creditPayload(row, customerId, bookingId);
  const { data: tx, error } = await admin
    .from("crm_transactions")
    .insert(payload)
    .select("*")
    .single();

  let posted = tx;
  if (error) {
    if (!/duplicate|unique/i.test(String(error.message || ""))) {
      return { ok: false as const, error: error.message as string };
    }
    const { data: existing } = await admin
      .from("crm_transactions")
      .select("*")
      .eq("source", "stripe")
      .eq("external_id", row.stripe_payment_intent_id)
      .maybeSingle();
    if (!existing) return { ok: false as const, error: error.message as string };
    if (existing.customer_id && existing.customer_id !== customerId) {
      return { ok: false as const, error: "already_credited" };
    }
    posted = existing;
  }
  if (!posted) return { ok: false as const, error: "insert_failed" };

  await admin
    .from("crm_stripe_transactions")
    .update({
      status: "matched",
      matched_customer_id: customerId,
      matched_transaction_id: posted.id,
    })
    .eq("id", row.id);

  return { ok: true as const, transaction: posted };
}

export async function refuseStripeInbox(admin: StripeAdmin, row: CrmStripeTransaction) {
  if (row.status === "matched") return { ok: false as const, error: "already_matched" };
  const { error } = await admin
    .from("crm_stripe_transactions")
    .update({ status: "ignored" })
    .eq("id", row.id);
  if (error) return { ok: false as const, error: error.message as string };
  return { ok: true as const };
}

export async function autoMatchUnmatchedStripe(limit = 100) {
  const { createServiceClient } = await import("@/lib/supabase/admin");
  const service = createServiceClient();
  const [{ data: rows }, { data: customers }] = await Promise.all([
    service
      .from("crm_stripe_transactions")
      .select("*")
      .eq("status", "unmatched")
      .eq("direction", "credit")
      .order("booked_at", { ascending: false, nullsFirst: false })
      .limit(limit),
    service.from("crm_customers").select(STRIPE_MATCH_SELECT),
  ]);
  const list = (rows || []) as CrmStripeTransaction[];
  const people = (customers || []) as StripeMatchCustomer[];
  let matched = 0;
  for (const row of list) {
    const { autoCustomerId } = scoreStripeMatches(row, people);
    if (!autoCustomerId) continue;
    const result = await applyStripeToCustomer(service, row, autoCustomerId);
    if (result.ok) matched += 1;
  }
  return { scanned: list.length, matched };
}

function textRows(data: unknown) {
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

function text(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

/** Sociétés et dossiers dont le numéro est celui d’une description de la file. */
export async function loadStripeMatchExtras(
  admin: StripeAdmin,
  rows: { reference?: string | null }[]
): Promise<StripeMatchExtras> {
  const numbers = stripeMatchNumbers(rows);
  let companies: StripeBillingCompany[] = [];
  try {
    const listed = await admin.from("crm_billing_companies").select("customer_id, company_name");
    if (!listed?.error) {
      companies = textRows(listed.data).flatMap((row) => {
        const customerId = text(row.customer_id).trim();
        const companyName = text(row.company_name).trim();
        return customerId && companyName ? [{ customer_id: customerId, company_name: companyName }] : [];
      });
    }
  } catch {
    companies = [];
  }
  if (!numbers.length) return { companies, dossiers: [] };

  const dossiers: StripeIndexedDossier[] = [];
  const bookingFilter = numbers
    .flatMap((number) => {
      const padded = number.length < 4 ? number.padStart(4, "0") : number;
      const parts = [`reference.eq.${number}`, `reference.ilike.%-${padded}`];
      if (padded !== number) parts.push(`reference.ilike.%-${number}`);
      return parts;
    })
    .join(",");
  const pieceFilter = numbers
    .flatMap((number) => {
      const padded = number.length < 4 ? number.padStart(4, "0") : number;
      return [`piece_number.eq.${number}`, `piece_number.eq.${padded}`, `piece_number.ilike.%-${number}`];
    })
    .join(",");

  try {
    const listed = await admin
      .from("crm_bookings")
      .select("id, reference, title, customer_id, billing_customer_id")
      .or(bookingFilter)
      .limit(200);
    if (!listed?.error) {
      for (const row of textRows(listed.data)) {
        const reference = text(row.reference).trim();
        const number = bookingReferenceNumber(reference);
        if (!number || !numbers.includes(number)) continue;
        const customerId = text(row.billing_customer_id || row.customer_id).trim();
        if (!customerId) continue;
        const title = text(row.title).trim();
        dossiers.push({
          booking_id: text(row.id),
          customer_id: customerId,
          reference,
          label: title ? `${reference} — ${title}` : reference,
          reason: "dossier",
          number,
        });
      }
    }
  } catch {
    /* la proposition de dossier reste vide */
  }

  try {
    const pieces = await admin.from("crm_mb3m_pieces").select("booking_id, piece_number").or(pieceFilter).limit(200);
    const pieceRows = pieces?.error
      ? []
      : textRows(pieces.data).flatMap((row) => {
          const number = invoicePieceNumber(text(row.piece_number));
          const bookingId = text(row.booking_id).trim();
          return number && numbers.includes(number) && bookingId
            ? [{ number, bookingId, piece: text(row.piece_number).trim() }]
            : [];
        });
    const bookingIds = [...new Set(pieceRows.map((row) => row.bookingId))];
    if (bookingIds.length) {
      const stays = await admin
        .from("crm_bookings")
        .select("id, reference, title, customer_id, billing_customer_id")
        .in("id", bookingIds);
      const byId = new Map(textRows(stays?.data).map((row) => [text(row.id), row]));
      for (const piece of pieceRows) {
        const booking = byId.get(piece.bookingId);
        if (!booking) continue;
        const customerId = text(booking.billing_customer_id || booking.customer_id).trim();
        if (!customerId) continue;
        const reference = text(booking.reference).trim();
        const title = text(booking.title).trim();
        const stay = title ? `${reference} — ${title}` : reference;
        dossiers.push({
          booking_id: piece.bookingId,
          customer_id: customerId,
          reference: reference || null,
          label: stay ? `Facture ${piece.piece} · ${stay}` : `Facture ${piece.piece}`,
          reason: "facture",
          number: piece.number,
        });
      }
    }
    const accounts = await admin
      .from("crm_mb3m_account_invoices")
      .select("customer_id, piece_number")
      .or(pieceFilter)
      .limit(200);
    if (!accounts?.error) {
      for (const row of textRows(accounts.data)) {
        const number = invoicePieceNumber(text(row.piece_number));
        const customerId = text(row.customer_id).trim();
        if (!number || !numbers.includes(number) || !customerId) continue;
        dossiers.push({
          booking_id: null,
          customer_id: customerId,
          reference: null,
          label: `Facture ${text(row.piece_number).trim() || number}`,
          reason: "facture",
          number,
        });
      }
    }
  } catch {
    /* idem */
  }

  return { companies, dossiers };
}

export function stripePendingHints(
  row: { payer_name?: string | null; reference?: string | null },
  scored: StripeMatchResult
) {
  const copy = stripeInboxCopy(row);
  return {
    payeur: copy.sender,
    libelle: copy.designation || null,
    propositions: scored.candidates.slice(0, 5).map((candidate) => ({
      client_id: candidate.customer_id,
      libelle: candidate.label,
      motif: candidate.reason,
    })),
    dossier:
      scored.dossier?.booking_id
        ? {
            id: scored.dossier.booking_id,
            reference: scored.dossier.reference,
            motif: scored.dossier.reason,
          }
        : null,
  };
}
