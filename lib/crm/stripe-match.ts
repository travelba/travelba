import { payerKindOf } from "@/lib/crm/payer";
import {
  matchTokens,
  normalizeMatchText,
  suggestedCustomerId,
  tokensSpell,
} from "@/lib/crm/revolut-match";
import { stripeCreditFromIntent } from "@/lib/crm/stripe-pay";
import {
  stripeInboxCreditKind,
  stripeInboxCreditLabel,
  type StripeInboxMethod,
} from "@/lib/crm/stripe-inbox";
import type { CrmCustomer, CrmStripeTransaction } from "@/lib/crm/types";

export type StripeMatchReason =
  | "metadata"
  | "stripe_customer"
  | "email"
  | "full_name"
  | "company_name"
  | "partial";

export type StripeMatchCandidate = {
  customer_id: string;
  score: number;
  reason: StripeMatchReason;
  label: string;
};

export type StripeMatchResult = {
  autoCustomerId: string | null;
  candidates: StripeMatchCandidate[];
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
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  if (c.company_name?.trim()) {
    return name ? `${name} · ${c.company_name.trim()}` : c.company_name.trim();
  }
  return name || "Client";
}

function emailKey(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

/**
 * Auto seulement sur un hit unique et certain : metadata, customer Stripe, ou e-mail.
 * Le nom et la société restent des propositions (score < 90).
 */
export function scoreStripeMatches(row: StripeMatchRow, customers: StripeMatchCustomer[]): StripeMatchResult {
  if (!customers.length) return { autoCustomerId: null, candidates: [] };

  const metadata = stripeMetadata(row.raw);
  const metaCustomer = (metadata.crm_customer_id || "").trim();
  const stripeCustomer = stripeCustomerId(row.raw);
  const email = emailKey(row.payer_email);
  const tokens = matchTokens(`${row.payer_name || ""} ${row.reference || ""}`);

  const byId = new Map<string, StripeMatchCandidate>();

  function upsert(customer: StripeMatchCustomer, score: number, reason: StripeMatchReason) {
    const prev = byId.get(customer.id);
    if (prev && prev.score >= score) return;
    byId.set(customer.id, {
      customer_id: customer.id,
      score,
      reason,
      label: customerLabel(customer),
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

  const candidates = [...byId.values()].sort(
    (a, b) => b.score - a.score || a.label.localeCompare(b.label, "fr")
  );
  return { autoCustomerId: suggestedCustomerId(candidates) || null, candidates };
}

export function suggestionsForStripeCustomer(
  customer: StripeMatchCustomer,
  rows: CrmStripeTransaction[],
  population: StripeMatchCustomer[] = [customer]
) {
  const people = population.some((person) => person.id === customer.id)
    ? population
    : [customer, ...population];
  return rows
    .filter((row) => row.status === "unmatched" && row.direction !== "debit")
    .map((row) => {
      const { candidates } = scoreStripeMatches(row, people);
      const hit = candidates.find((candidate) => candidate.customer_id === customer.id);
      return hit
        ? { row, candidate: hit, certain: suggestedCustomerId(candidates) === customer.id }
        : null;
    })
    .filter(
      (item): item is { row: CrmStripeTransaction; candidate: StripeMatchCandidate; certain: boolean } =>
        Boolean(item)
    )
    .sort((a, b) => b.candidate.score - a.candidate.score);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidOrNull(value: string) {
  return UUID.test(value) ? value : null;
}

function inboxCredit(row: CrmStripeTransaction, customerId: string) {
  const metadata = stripeMetadata(row.raw);
  const payer = payerKindOf(metadata.payer_kind);
  const companyId = uuidOrNull((metadata.billing_company_id || "").trim());
  const metaCustomer = (metadata.crm_customer_id || "").trim();
  const bookingId = uuidOrNull((metadata.crm_booking_id || "").trim());
  const method = (row.method || "other") as StripeInboxMethod;
  return {
    customer_id: customerId,
    booking_id: metaCustomer === customerId ? bookingId : null,
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

function creditPayload(row: CrmStripeTransaction, customerId: string) {
  const fromIntent = stripeCreditFromIntent({
    id: row.stripe_payment_intent_id,
    status: "succeeded",
    amount: Math.round(Math.abs(Number(row.amount)) * 100),
    currency: row.currency,
    metadata: stripeMetadata(row.raw),
  });
  if (fromIntent && fromIntent.customer_id === customerId) return fromIntent;
  return inboxCredit(row, customerId);
}

export async function applyStripeToCustomer(
  admin: StripeAdmin,
  row: CrmStripeTransaction,
  customerId: string
) {
  if (row.status === "matched") return { ok: false as const, error: "already_matched" };
  if (row.direction === "debit") return { ok: false as const, error: "not_a_credit" };
  if (!row.stripe_payment_intent_id) return { ok: false as const, error: "missing_intent" };

  const payload = creditPayload(row, customerId);
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
