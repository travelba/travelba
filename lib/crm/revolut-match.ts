import { isRevolutCredit } from "./revolut-inbox";
import type { CrmCustomer, CrmRevolutTransaction } from "./types";
import { AGENCY_FEE_LABEL } from "./types";
import { agencyFeeFromGross, netAfterAgencyFee } from "./money";

export type RevolutMatchReason =
  | "full_name"
  | "unique_last_name"
  | "company_name"
  | "partial";

export type RevolutMatchCandidate = {
  customer_id: string;
  score: number;
  reason: RevolutMatchReason;
  label: string;
};

export type RevolutMatchResult = {
  autoCustomerId: string | null;
  candidates: RevolutMatchCandidate[];
};

/** Loose admin client shape used by credit helper (avoids pulling Supabase into unit tests). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RevolutAdmin = { from: (table: string) => any };

/** Normalize for fuzzy person/company matching (accents, punctuation). */
export function normalizeMatchText(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function haystackFor(row: Pick<CrmRevolutTransaction, "counterparty_name" | "reference">) {
  return normalizeMatchText(`${row.counterparty_name || ""} ${row.reference || ""}`);
}

function customerLabel(c: Pick<CrmCustomer, "first_name" | "last_name" | "company_name">) {
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  if (c.company_name?.trim()) {
    return name ? `${name} · ${c.company_name.trim()}` : c.company_name.trim();
  }
  return name || "Client";
}

/**
 * Rank customers against a Revolut inbox row.
 * Auto-match only when exactly one strong unique hit (full name, unique last name, or unique company).
 */
export function scoreRevolutMatches(
  row: Pick<CrmRevolutTransaction, "counterparty_name" | "reference">,
  customers: Pick<CrmCustomer, "id" | "first_name" | "last_name" | "company_name">[]
): RevolutMatchResult {
  const haystack = haystackFor(row);
  if (!haystack || !customers.length) {
    return { autoCustomerId: null, candidates: [] };
  }

  const lastNameCounts = new Map<string, number>();
  const companyCounts = new Map<string, number>();
  for (const c of customers) {
    const last = normalizeMatchText(c.last_name);
    if (last) lastNameCounts.set(last, (lastNameCounts.get(last) || 0) + 1);
    const company = normalizeMatchText(c.company_name);
    if (company.length >= 3) {
      companyCounts.set(company, (companyCounts.get(company) || 0) + 1);
    }
  }

  const byId = new Map<string, RevolutMatchCandidate>();

  function upsert(
    customer: Pick<CrmCustomer, "id" | "first_name" | "last_name" | "company_name">,
    score: number,
    reason: RevolutMatchReason
  ) {
    const prev = byId.get(customer.id);
    if (prev && prev.score >= score) return;
    byId.set(customer.id, {
      customer_id: customer.id,
      score,
      reason,
      label: customerLabel(customer),
    });
  }

  for (const c of customers) {
    const first = normalizeMatchText(c.first_name);
    const last = normalizeMatchText(c.last_name);
    const company = normalizeMatchText(c.company_name);

    if (first && last && first.length >= 2 && last.length >= 2) {
      const full = `${first}${last}`;
      const fullRev = `${last}${first}`;
      if (haystack.includes(full) || haystack.includes(fullRev)) {
        upsert(c, 100, "full_name");
        continue;
      }
    }

    if (company.length >= 3 && haystack.includes(company)) {
      const unique = (companyCounts.get(company) || 0) === 1;
      upsert(c, unique ? 95 : 70, unique ? "company_name" : "partial");
      continue;
    }

    if (last.length >= 3 && haystack.includes(last)) {
      const unique = (lastNameCounts.get(last) || 0) === 1;
      if (unique) {
        upsert(c, 90, "unique_last_name");
      } else if (first && haystack.includes(first)) {
        upsert(c, 80, "partial");
      } else {
        upsert(c, 55, "partial");
      }
    }
  }

  const candidates = [...byId.values()].sort(
    (a, b) => b.score - a.score || a.label.localeCompare(b.label, "fr")
  );
  const strong = candidates.filter((c) => c.score >= 90);
  const autoCustomerId = strong.length === 1 ? strong[0].customer_id : null;

  return { autoCustomerId, candidates };
}

export function suggestionsForCustomer(
  customer: Pick<CrmCustomer, "id" | "first_name" | "last_name" | "company_name">,
  rows: CrmRevolutTransaction[]
) {
  return rows
    .filter((r) => r.status === "unmatched" && isRevolutCredit(r.direction))
    .map((row) => {
      const { candidates } = scoreRevolutMatches(row, [customer]);
      const hit = candidates.find((c) => c.customer_id === customer.id);
      return hit ? { row, candidate: hit } : null;
    })
    .filter((x): x is { row: CrmRevolutTransaction; candidate: RevolutMatchCandidate } => Boolean(x))
    .sort((a, b) => b.candidate.score - a.candidate.score);
}

export async function applyRevolutToCustomer(
  admin: RevolutAdmin,
  row: CrmRevolutTransaction,
  customerId: string
) {
  if (row.status === "matched") {
    return { ok: false as const, error: "already_matched" };
  }
  if (!isRevolutCredit(row.direction)) {
    return { ok: false as const, error: "not_a_credit" };
  }
  const labelBase =
    row.reference ||
    row.counterparty_name ||
    row.revolut_transaction_id;
  const label = `Virement Revolut ${labelBase}`.trim();

  const { data: tx, error } = await admin
    .from("crm_transactions")
    .insert({
      customer_id: customerId,
      direction: "credit",
      kind: "transfer",
      amount: Math.abs(Number(row.amount)),
      currency: row.currency,
      occurred_on: row.booked_at ? String(row.booked_at).slice(0, 10) : null,
      label,
      source: "revolut",
      external_id: row.revolut_transaction_id,
      status: "posted",
    })
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
      .eq("source", "revolut")
      .eq("external_id", row.revolut_transaction_id)
      .maybeSingle();
    if (!existing) return { ok: false as const, error: error.message as string };
    posted = existing;
  }
  if (!posted) return { ok: false as const, error: "insert_failed" };

  // Sur chaque crédit, prélever 10 % de frais d’agence → crédit disponible = 90 %.
  const gross = Math.abs(Number(row.amount));
  const fee = agencyFeeFromGross(gross);
  if (fee > 0) {
    const feeExternalId = `${row.revolut_transaction_id}:agency-fee`;
    const { error: feeError } = await admin.from("crm_transactions").insert({
      customer_id: customerId,
      direction: "debit",
      kind: "adjustment",
      amount: fee,
      currency: row.currency,
      occurred_on: row.booked_at ? String(row.booked_at).slice(0, 10) : null,
      label: `${AGENCY_FEE_LABEL} (net ${netAfterAgencyFee(gross).toLocaleString("fr-FR", {
        style: "currency",
        currency: row.currency || "EUR",
      })})`,
      source: "revolut",
      external_id: feeExternalId,
      status: "posted",
    });
    // Unique (source, external_id) : retry après insert partiel → OK.
    if (feeError && !/duplicate|unique/i.test(String(feeError.message || ""))) {
      return { ok: false as const, error: feeError.message as string };
    }
  }

  await admin
    .from("crm_revolut_transactions")
    .update({
      status: "matched",
      matched_customer_id: customerId,
      matched_transaction_id: posted.id,
    })
    .eq("id", row.id);

  return { ok: true as const, transaction: posted };
}

/** @deprecated use applyRevolutToCustomer */
export async function creditRevolutToCustomer(
  admin: RevolutAdmin,
  row: CrmRevolutTransaction,
  customerId: string
) {
  return applyRevolutToCustomer(admin, row, customerId);
}

/** Auto-apply unmatched inbox rows when there is exactly one strong customer hit. */
export async function autoMatchUnmatchedRevolut(limit = 100) {
  const { createServiceClient } = await import("@/lib/supabase/admin");
  const service = createServiceClient();
  const [{ data: rows }, { data: customers }] = await Promise.all([
    service
      .from("crm_revolut_transactions")
      .select("*")
      .eq("status", "unmatched")
      .eq("direction", "credit")
      .order("booked_at", { ascending: false, nullsFirst: false })
      .limit(limit),
    service.from("crm_customers").select("id, first_name, last_name, company_name"),
  ]);

  const list = (rows || []) as CrmRevolutTransaction[];
  const people = (customers || []) as Pick<
    CrmCustomer,
    "id" | "first_name" | "last_name" | "company_name"
  >[];

  let matched = 0;
  for (const row of list) {
    const { autoCustomerId } = scoreRevolutMatches(row, people);
    if (!autoCustomerId) continue;
    const result = await applyRevolutToCustomer(service, row, autoCustomerId);
    if (result.ok) matched += 1;
  }
  return { scanned: list.length, matched };
}

export function matchReasonLabel(reason: RevolutMatchReason) {
  switch (reason) {
    case "full_name":
      return "Nom complet";
    case "unique_last_name":
      return "Nom de famille unique";
    case "company_name":
      return "Société";
    default:
      return "Correspondance partielle";
  }
}
