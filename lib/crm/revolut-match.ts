import { isRevolutCredit, revolutSenderName } from "./revolut-inbox";
import type { CrmCustomer, CrmRevolutTransaction } from "./types";

export type RevolutMatchReason =
  | "iban"
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

/** Fiche minimale pour le rapprochement. L’IBAN reste côté serveur : il n’est jamais envoyé au navigateur. */
export type RevolutMatchCustomer = Pick<CrmCustomer, "id" | "first_name" | "last_name" | "company_name"> &
  Partial<Pick<CrmCustomer, "iban">>;

/** Colonnes de l’index de rapprochement (auto-match et pages serveur). */
export const REVOLUT_MATCH_SELECT = "id, first_name, last_name, company_name, iban";

export type RevolutMatchRow = Pick<CrmRevolutTransaction, "counterparty_name" | "reference"> & {
  raw?: unknown;
  counterparty_iban?: string | null;
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

/** Mots normalisés, séparateurs conservés : « Jean Martineau » → [jean, martineau]. */
export function matchTokens(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Vrai si une suite de mots entiers, collés, vaut exactement `glued`.
 * « jean martineau » n’épelle pas « jeanmartin » ; « leroy » n’épelle pas « roy » ; « le roy » épelle « leroy ».
 */
export function tokensSpell(tokens: string[], glued: string) {
  if (!glued) return false;
  for (let start = 0; start < tokens.length; start += 1) {
    let acc = "";
    for (let end = start; end < tokens.length; end += 1) {
      acc += tokens[end];
      if (acc === glued) return true;
      if (acc.length >= glued.length) break;
    }
  }
  return false;
}

/** IBAN comparable : sans espaces, majuscules, forme plausible. Un simple numéro de compte ne compte pas. */
export function ibanMatchKey(value: string | null | undefined) {
  const key = String(value || "").replace(/\s+/g, "").toUpperCase();
  return /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(key) ? key : "";
}

/** Présélection : un seul candidat certain (≥ 90), sinon l’agent choisit. */
export function suggestedCustomerId(candidates: { customer_id: string; score: number }[]) {
  const strong = candidates.filter((c) => c.score >= 90);
  return strong.length === 1 ? strong[0].customer_id : "";
}

function haystackTokens(row: RevolutMatchRow) {
  return matchTokens(`${revolutSenderName(row)} ${row.counterparty_name || ""} ${row.reference || ""}`);
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
 * Les noms se comparent mot à mot (frontières de mots), jamais par sous-chaîne.
 * Auto-match only when exactly one strong unique hit (IBAN, full name, unique last name, or unique company).
 */
export function scoreRevolutMatches(row: RevolutMatchRow, customers: RevolutMatchCustomer[]): RevolutMatchResult {
  const tokens = haystackTokens(row);
  const rowIban = ibanMatchKey(row.counterparty_iban);
  if ((!tokens.length && !rowIban) || !customers.length) {
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

  function upsert(customer: RevolutMatchCustomer, score: number, reason: RevolutMatchReason) {
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
    if (rowIban && ibanMatchKey(c.iban) === rowIban) {
      upsert(c, 100, "iban");
      continue;
    }

    const first = normalizeMatchText(c.first_name);
    const last = normalizeMatchText(c.last_name);
    const company = normalizeMatchText(c.company_name);

    if (first && last && first.length >= 2 && last.length >= 2) {
      if (tokensSpell(tokens, `${first}${last}`) || tokensSpell(tokens, `${last}${first}`)) {
        upsert(c, 100, "full_name");
        continue;
      }
    }

    if (company.length >= 3 && tokensSpell(tokens, company)) {
      const unique = (companyCounts.get(company) || 0) === 1;
      upsert(c, unique ? 95 : 70, unique ? "company_name" : "partial");
      continue;
    }

    if (last.length >= 3 && tokensSpell(tokens, last)) {
      const unique = (lastNameCounts.get(last) || 0) === 1;
      if (unique) {
        upsert(c, 90, "unique_last_name");
      } else if (first && tokensSpell(tokens, first)) {
        upsert(c, 80, "partial");
      } else {
        upsert(c, 55, "partial");
      }
    }
  }

  const candidates = [...byId.values()].sort(
    (a, b) => b.score - a.score || a.label.localeCompare(b.label, "fr")
  );

  return { autoCustomerId: suggestedCustomerId(candidates) || null, candidates };
}

/**
 * Virements qui désignent ce client. `population` = l’index complet, pour détecter les homonymes :
 * `certain` n’est vrai que si ce client est le seul candidat ≥ 90.
 */
export function suggestionsForCustomer(
  customer: RevolutMatchCustomer,
  rows: CrmRevolutTransaction[],
  population: RevolutMatchCustomer[] = [customer]
) {
  const people = population.some((p) => p.id === customer.id) ? population : [customer, ...population];
  return rows
    .filter((r) => r.status === "unmatched" && isRevolutCredit(r.direction))
    .map((row) => {
      const { candidates } = scoreRevolutMatches(row, people);
      const hit = candidates.find((c) => c.customer_id === customer.id);
      return hit ? { row, candidate: hit, certain: suggestedCustomerId(candidates) === customer.id } : null;
    })
    .filter(
      (x): x is { row: CrmRevolutTransaction; candidate: RevolutMatchCandidate; certain: boolean } => Boolean(x)
    )
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
  const sender = revolutSenderName(row);
  const designation = (row.reference || "").trim();
  const labelBase = [sender, designation].filter(Boolean).join(" — ") || row.revolut_transaction_id;
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
    service.from("crm_customers").select(REVOLUT_MATCH_SELECT),
  ]);

  const list = (rows || []) as CrmRevolutTransaction[];
  const people = (customers || []) as RevolutMatchCustomer[];

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
    case "iban":
      return "IBAN du client";
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
