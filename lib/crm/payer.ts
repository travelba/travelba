import { agencyFeeFromGross } from "@/lib/crm/money";

export type PayerKind = "company" | "personal";

export type PayerCompany = {
  id: string;
  sort_order: number;
  company_name?: string | null;
};

export function payerKindOf(value: unknown): PayerKind | null {
  if (value === "company" || value === "personal") return value;
  return null;
}

function bySort(companies: PayerCompany[]) {
  return [...companies].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
}

/** Première société du compte : toujours le même défaut. */
export function defaultBillingCompany(companies: PayerCompany[]) {
  return bySort(companies)[0] || null;
}

/** Sans société sur la fiche, le séjour est particulier. Sinon, la première société. */
export function defaultPayer(companies: PayerCompany[]) {
  const first = defaultBillingCompany(companies);
  if (!first) return { payer_kind: "personal" as const, billing_company_id: null };
  return { payer_kind: "company" as const, billing_company_id: first.id };
}

/**
 * Société : la société demandée si elle est sur le compte, sinon la première.
 * Particulier : aucune société sur le dossier.
 */
export function assignPayer(input: {
  payerKind: unknown;
  companyId?: unknown;
  companies: PayerCompany[];
}): { payer_kind: PayerKind; billing_company_id: string | null } | { error: string } {
  const kind = payerKindOf(input.payerKind);
  if (!kind) return { error: "Indiquez si le voyage est réglé par une société ou un particulier." };
  if (kind === "personal") return { payer_kind: "personal", billing_company_id: null };
  const companies = bySort(input.companies);
  if (!companies.length) {
    return { error: "Ajoutez une société sur la fiche avant ce règlement." };
  }
  const requested = typeof input.companyId === "string" ? input.companyId : "";
  const match = companies.find((company) => company.id === requested);
  return { payer_kind: "company", billing_company_id: (match || companies[0]).id };
}

export function payerBadge(kind: PayerKind | null | undefined, companyName: string | null | undefined) {
  if (kind === "personal") return "Particulier";
  if (kind === "company") {
    const name = (companyName || "").trim();
    return name ? `Société · ${name}` : "Société";
  }
  return null;
}

/** Montant que l’espace client peut régler. Le séjour payé hors agence n’y entre pas. */
export function collectableStayAmount(input: {
  stayTotal: number;
  agencyCommission: boolean;
  clientSettlesStay: boolean;
  pricesVisible: boolean;
  expenses: { amount: number | null }[];
}) {
  if (!input.pricesVisible) return null;
  const stay = Number(input.stayTotal);
  const base = input.clientSettlesStay || !Number.isFinite(stay) ? 0 : stay;
  let sum = base;
  if (input.agencyCommission && Number.isFinite(stay) && stay > 0) {
    sum += agencyFeeFromGross(stay);
  }
  for (const expense of input.expenses) {
    const amount = Number(expense.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    sum += amount;
  }
  const rounded = Math.round(sum * 100) / 100;
  return rounded > 0 ? rounded : null;
}

export function amountToCents(amount: number) {
  return Math.round(amount * 100);
}
