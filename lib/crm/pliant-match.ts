import { shownPersonName } from "./identity";
import { matchTokens, normalizeMatchText, suggestedCustomerId, tokensSpell } from "./revolut-match";

export { suggestedCustomerId } from "./revolut-match";

export type PliantMatchReason =
  | "full_name"
  | "unique_last_name"
  | "company_name"
  | "booking"
  | "first_name"
  | "partial";

export type PliantMatchCandidate = {
  customer_id: string;
  score: number;
  reason: PliantMatchReason;
  label: string;
};

export type PliantMatchResult = {
  autoCustomerId: string | null;
  candidates: PliantMatchCandidate[];
};

export type PliantMatchCustomer = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name?: string | null;
  usage_name?: string | null;
};

export type PliantLedgerRow = {
  id: string;
  pliant_transaction_id: string;
  card_id?: string | null;
  type: string | null;
  status: string | null;
  merchant: string | null;
  billing_cents: number | null;
  billing_currency: string | null;
  booked_at: string | null;
  card_label: string | null;
  card_last4: string | null;
  match_status: "unmatched" | "matched" | "ignored";
};

export type PliantLedgerDraft = {
  direction: "debit" | "credit";
  kind: "card_payment" | "refund";
  amount: number;
  currency: string;
  occurred_on: string;
  label: string;
  external_id: string;
};

const POSTABLE_STATUSES = new Set(["BOOKED", "CONFIRMED"]);
const DEBIT_TYPES = new Set(["PURCHASE", "CASH_WITHDRAWAL"]);
const CREDIT_TYPES = new Set(["REFUND", "CHARGEBACK"]);
const AGENCY_EXACT = new Set(["amadeus", "raf", "platformfee"]);

/** Cartes d’agence (GDS, frais Pliant, surnom interne) : pas une proposition client. */
export function pliantAgencyCardLabel(label: string | null | undefined) {
  const key = normalizeMatchText(label);
  if (!key) return false;
  if (AGENCY_EXACT.has(key)) return true;
  if (key.startsWith("pliant")) return true;
  if (key.includes("amadeus") || key.includes("platformfee")) return true;
  return false;
}

export function pliantLedgerDraft(
  row: Pick<
    PliantLedgerRow,
    | "pliant_transaction_id"
    | "type"
    | "status"
    | "merchant"
    | "billing_cents"
    | "billing_currency"
    | "booked_at"
    | "card_label"
    | "card_last4"
  >
): PliantLedgerDraft | null {
  const type = (row.type || "").toUpperCase();
  const status = (row.status || "").toUpperCase();
  if (!POSTABLE_STATUSES.has(status)) return null;
  const direction = DEBIT_TYPES.has(type) ? "debit" : CREDIT_TYPES.has(type) ? "credit" : null;
  if (!direction) return null;
  const cents = Number(row.billing_cents);
  if (!Number.isFinite(cents) || Math.round(Math.abs(cents)) === 0) return null;
  const cardName = (row.card_label || "").trim();
  const card = [cardName, row.card_last4 ? `•••• ${row.card_last4}` : ""].filter(Boolean).join(" ");
  const merchant = (row.merchant || "").trim();
  const head = direction === "credit" ? "Remboursement Pliant" : "Dépense Pliant";
  return {
    direction,
    kind: direction === "credit" ? "refund" : "card_payment",
    amount: Math.round(Math.abs(cents)) / 100,
    currency: (row.billing_currency || "EUR").toUpperCase().slice(0, 3) || "EUR",
    occurred_on: row.booked_at ? String(row.booked_at).slice(0, 10) : new Date().toISOString().slice(0, 10),
    label: [head, merchant, card ? `carte ${card}` : ""].filter(Boolean).join(" · "),
    external_id: row.pliant_transaction_id,
  };
}

function customerLabel(c: PliantMatchCustomer) {
  const name = shownPersonName(c);
  if (c.company_name?.trim()) {
    return name ? `${name} · ${c.company_name.trim()}` : c.company_name.trim();
  }
  return name || "Client";
}

function lastKeys(c: PliantMatchCustomer) {
  return [normalizeMatchText(c.last_name), normalizeMatchText(c.usage_name)].filter((key) => key.length >= 3);
}

/** « Simon, Iony » → simon, iony, et la forme collée. */
function givenNames(value: string | null | undefined) {
  const parts = (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((part) => part.length >= 2);
  const glued = normalizeMatchText(value);
  if (glued.length >= 2 && !parts.includes(glued)) parts.push(glued);
  return parts;
}

function editDistance(a: string, b: string) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 1) return 2;
  const prev = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = prev[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + cost);
      diagonal = saved;
    }
  }
  return prev[b.length];
}

/**
 * Le libellé de la carte désigne le client. Le porteur (collaborateur agence) n’entre pas dans le score.
 * Les noms se comparent mot à mot (frontières de mots), jamais par sous-chaîne.
 * Auto seulement s’il reste exactement un hit ≥ 90.
 */
export function scorePliantMatches(
  row: { card_label: string | null },
  customers: PliantMatchCustomer[],
  options?: { linkedCustomerIds?: string[] }
): PliantMatchResult {
  const label = pliantAgencyCardLabel(row.card_label) ? "" : row.card_label;
  const haystack = normalizeMatchText(label);
  const tokens = matchTokens(label);
  const byId = new Map<string, PliantMatchCandidate>();

  function upsert(customer: PliantMatchCustomer, score: number, reason: PliantMatchReason) {
    const prev = byId.get(customer.id);
    if (prev && prev.score >= score) return;
    byId.set(customer.id, {
      customer_id: customer.id,
      score,
      reason,
      label: customerLabel(customer),
    });
  }

  if (haystack && customers.length) {
    const lastNameCounts = new Map<string, number>();
    const companyCounts = new Map<string, number>();
    for (const c of customers) {
      for (const last of lastKeys(c)) {
        lastNameCounts.set(last, (lastNameCounts.get(last) || 0) + 1);
      }
      const company = normalizeMatchText(c.company_name);
      if (company.length >= 3) companyCounts.set(company, (companyCounts.get(company) || 0) + 1);
    }

    for (const c of customers) {
      const givens = givenNames(c.first_name);
      const lasts = lastKeys(c);
      const company = normalizeMatchText(c.company_name);
      const fullHit = givens.some((first) =>
        lasts.some((last) => tokensSpell(tokens, `${first}${last}`) || tokensSpell(tokens, `${last}${first}`))
      );

      if (fullHit) {
        upsert(c, 100, "full_name");
        continue;
      }

      if (company.length >= 3 && tokensSpell(tokens, company)) {
        const unique = (companyCounts.get(company) || 0) === 1;
        upsert(c, unique ? 95 : 70, unique ? "company_name" : "partial");
        continue;
      }

      const lastHit = lasts.find((last) => tokensSpell(tokens, last));
      if (lastHit) {
        const unique = (lastNameCounts.get(lastHit) || 0) === 1;
        const givenHit = givens.some((first) => tokensSpell(tokens, first));
        if (unique) upsert(c, 90, "unique_last_name");
        else if (givenHit) upsert(c, 80, "partial");
        else upsert(c, 55, "partial");
        continue;
      }

      const close = givens.some((first) => {
        if (first.length < 3 || !haystack.startsWith(first)) return false;
        const rest = haystack.slice(first.length);
        return lasts.some((last) => last.length >= 5 && editDistance(rest, last) === 1);
      });
      if (close) upsert(c, 62, "partial");
    }

    if (haystack.length >= 5) {
      const firstHits = customers.filter((c) =>
        givenNames(c.first_name).some((part) => part === haystack && part.length >= 5)
      );
      if (firstHits.length >= 1 && firstHits.length <= 3) {
        for (const c of firstHits) {
          upsert(c, firstHits.length === 1 ? 60 : 50, firstHits.length === 1 ? "first_name" : "partial");
        }
      }
    }
  }

  const linked = [...new Set((options?.linkedCustomerIds || []).filter(Boolean))];
  for (const id of linked) {
    const customer = customers.find((c) => c.id === id);
    if (!customer) continue;
    upsert(customer, linked.length === 1 ? 100 : 70, linked.length === 1 ? "booking" : "partial");
  }

  const candidates = [...byId.values()].sort(
    (a, b) => b.score - a.score || a.label.localeCompare(b.label, "fr")
  );
  return {
    autoCustomerId: suggestedCustomerId(candidates) || null,
    candidates,
  };
}

export function billingCustomersByCard(
  arrivals: { pliant_card_id: string | null; booking_id: string | null }[],
  bookings: { id: string; billing_customer_id: string | null }[]
) {
  const payers = new Map(
    bookings.flatMap((row) => (row.billing_customer_id ? [[row.id, row.billing_customer_id] as const] : []))
  );
  const map = new Map<string, string[]>();
  for (const row of arrivals) {
    if (!row.pliant_card_id || !row.booking_id) continue;
    const customerId = payers.get(row.booking_id);
    if (!customerId) continue;
    const list = map.get(row.pliant_card_id) || [];
    if (!list.includes(customerId)) list.push(customerId);
    map.set(row.pliant_card_id, list);
  }
  return map;
}

export function pliantMatchReasonLabel(reason: PliantMatchReason) {
  switch (reason) {
    case "full_name":
      return "Nom complet";
    case "unique_last_name":
      return "Nom de famille unique";
    case "company_name":
      return "Société";
    case "booking":
      return "Dossier";
    case "first_name":
      return "Prénom";
    default:
      return "Correspondance partielle";
  }
}
