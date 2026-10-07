import { postedLedgerTotals } from "@/lib/crm/money";

export type FundingKind = "advance" | "pro";

export type FundingCompany = {
  id: string;
  company_name?: string | null;
  funding?: string | null;
  sort_order?: number;
};

export type FundingRow = {
  direction: "credit" | "debit";
  amount: number | string;
  status?: string;
  currency?: string;
  billing_company_id?: string | null;
};

/** Deux soldes distincts. Absent tant que la fiche n’a pas les deux comptes. */
export type FundingPocket = {
  funding: FundingKind;
  companyId: string;
  name: string;
  label: string;
  /** Crédits − débits de ce compte seul. Positif = crédit à dépenser. */
  balance: number;
  due: number;
  debits: number;
  creditCount: number;
  remainingPct: number | null;
};

export function fundingKindOf(value: unknown): FundingKind | null {
  if (value === "advance" || value === "pro") return value;
  return null;
}

export function fundingPocketLabel(funding: FundingKind, name: string | null | undefined) {
  const trimmed = (name || "").trim();
  if (funding === "pro") return trimmed || "Pro";
  return trimmed ? `Crédit · ${trimmed}` : "Crédit";
}

/** Libellé du choix de société sur un dossier. */
export function fundingCompanyOptionLabel(
  name: string | null | undefined,
  funding: string | null | undefined,
  fallback: string
) {
  const kind = fundingKindOf(funding);
  if (kind === "advance") return `${fallback} · Crédit`;
  if (kind === "pro" && fallback !== "Pro") return `${fallback} · Pro`;
  return fallback;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function rowAmount(row: FundingRow) {
  const amount = Number(row.amount);
  return Number.isFinite(amount) ? amount : null;
}

function pocketOf(
  company: FundingCompany,
  funding: FundingKind,
  rows: FundingRow[],
  currency: string
): FundingPocket {
  const scoped = rows.filter((row) => {
    if (row.billing_company_id !== company.id) return false;
    if (row.status && row.status !== "posted") return false;
    if (row.currency && row.currency !== currency) return false;
    return rowAmount(row) != null;
  });
  let credits = 0;
  let debitSum = 0;
  for (const row of scoped) {
    const amount = rowAmount(row)!;
    if (row.direction === "credit") credits += amount;
    else debitSum += amount;
  }
  const balance = roundMoney(credits - debitSum);
  const { debits, settledPct } = postedLedgerTotals(scoped);
  const name = (company.company_name || "").trim();
  return {
    funding,
    companyId: company.id,
    name,
    label: fundingPocketLabel(funding, name),
    balance,
    due: roundMoney(Math.max(0, -balance)),
    debits,
    creditCount: scoped.filter((row) => row.direction === "credit").length,
    remainingPct: settledPct == null ? null : Math.max(0, 100 - settledPct),
  };
}

/** Comptes proposés quand l’agence pose un virement reçu. Vide s’il n’y en a qu’un. */
export function wireAccountChoices(companies: (FundingCompany & { customer_id?: string })[]) {
  const byCustomer = new Map<string, FundingCompany[]>();
  for (const company of companies) {
    const customerId = company.customer_id || "";
    if (!customerId) continue;
    const list = byCustomer.get(customerId) || [];
    list.push(company);
    byCustomer.set(customerId, list);
  }
  const choices: Record<string, { id: string; label: string }[]> = {};
  for (const [customerId, list] of byCustomer) {
    const pockets = fundingPockets(list, []);
    if (!pockets) continue;
    choices[customerId] = pockets.map((pocket) => ({ id: pocket.companyId, label: pocket.label }));
  }
  return choices;
}

/**
 * Deux comptes : le virement va où l’agence l’indique. Un seul encours : pas de choix.
 */
export function resolveWireAccount(
  companies: { id: string; funding?: string | null }[],
  requestedId: string | null | undefined
): { billingCompanyId: string | null } | { error: string } {
  const advance = companies.find((company) => company.funding === "advance");
  const pro = companies.find((company) => company.funding === "pro");
  if (!advance || !pro) return { billingCompanyId: null };
  const requested = (requestedId || "").trim();
  if (!requested) return { error: "Choisissez le compte : crédit ou Pro." };
  if (requested !== advance.id && requested !== pro.id) {
    return { error: "Ce compte n’est pas sur cette fiche." };
  }
  return { billingCompanyId: requested };
}

/**
 * Crédit et Pro, dans cet ordre. Les lignes de l’autre compte ne bougent pas le solde.
 * Une fiche sans les deux comptes reste sur l’encours unique.
 */
export function fundingPockets(
  companies: FundingCompany[],
  rows: FundingRow[],
  currency = "EUR"
): FundingPocket[] | null {
  const ordered = [...companies].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id.localeCompare(b.id)
  );
  const advance = ordered.find((company) => company.funding === "advance");
  const pro = ordered.find((company) => company.funding === "pro");
  if (!advance || !pro) return null;
  return [pocketOf(advance, "advance", rows, currency), pocketOf(pro, "pro", rows, currency)];
}
