import { agencyFeeFromGross } from "@/lib/crm/money";

export { amountToCents } from "@/lib/crm/money";

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

/** Mention client. Le mot Particulier reste côté agence. */
export function slipMention(kind: PayerKind, companyName: string | null | undefined) {
  if (kind === "personal") return "Sans facture société";
  const name = (companyName || "").trim();
  return name ? `Facture ${name}` : "Facture société";
}

/** Frais sur facture société alors que le séjour est particulier : il faut une société. */
export function resolveFeesFollowStay(input: {
  stayKind: PayerKind | null;
  requested: boolean;
  companyCount: number;
}) {
  if (input.stayKind !== "company" && input.stayKind !== "personal") return true;
  if (!input.requested && input.stayKind === "personal" && input.companyCount < 1) return true;
  return input.requested;
}

export type PaySliceId = "stay" | "fees";

export type PaymentSlip = {
  slice: PaySliceId;
  kind: PayerKind;
  companyId: string | null;
  /** Null quand l’hôtel se règle hors agence. */
  amount: number | null;
  payable: boolean;
  hotelAside: boolean;
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function feeCompanyId(input: {
  kind: PayerKind;
  stayKind: PayerKind;
  stayCompanyId: string | null;
  otherCompanyId: string | null;
}) {
  if (input.kind !== "company") return null;
  if (input.stayKind === "company") return input.stayCompanyId;
  return input.otherCompanyId;
}

/**
 * Une carte si frais et séjour portent la même facture.
 * Deux cartes si la facture diffère, ou si l’hôtel se règle hors agence.
 */
export function paymentSlips(input: {
  stayTotal: number;
  agencyCommission: boolean;
  clientSettlesStay: boolean;
  pricesVisible: boolean;
  expenses: { amount: number | null }[];
  /** Frais de billeterie déjà dus au grand livre. Même facture que les autres frais. */
  ticketingFee?: number;
  stayKind: PayerKind;
  stayCompanyId: string | null;
  feesFollowStay: boolean;
  otherCompanyId: string | null;
}): PaymentSlip[] {
  if (!input.pricesVisible) return [];
  const stay = Number(input.stayTotal);
  const stayBase = input.clientSettlesStay || !Number.isFinite(stay) || stay <= 0 ? 0 : roundMoney(stay);
  let fees = 0;
  if (input.agencyCommission && Number.isFinite(stay) && stay > 0) {
    fees += agencyFeeFromGross(stay);
  }
  for (const expense of input.expenses) {
    const amount = Number(expense.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    fees += amount;
  }
  const ticketing = Number(input.ticketingFee);
  if (Number.isFinite(ticketing) && ticketing > 0) fees += ticketing;
  fees = roundMoney(fees);
  if (fees <= 0) fees = 0;

  const follow =
    input.feesFollowStay || (input.stayKind === "personal" && !input.stayCompanyId && !input.otherCompanyId);
  const feesKind: PayerKind = follow ? input.stayKind : input.stayKind === "company" ? "personal" : "company";
  const hotelAside = input.clientSettlesStay === true;

  if (!hotelAside && feesKind === input.stayKind) {
    const total = roundMoney(stayBase + fees);
    if (total <= 0) return [];
    return [
      {
        slice: "stay",
        kind: input.stayKind,
        companyId: input.stayKind === "company" ? input.stayCompanyId : null,
        amount: total,
        payable: true,
        hotelAside: false,
      },
    ];
  }

  const slips: PaymentSlip[] = [];
  if (hotelAside) {
    slips.push({
      slice: "stay",
      kind: input.stayKind,
      companyId: input.stayKind === "company" ? input.stayCompanyId : null,
      amount: null,
      payable: false,
      hotelAside: true,
    });
  } else if (stayBase > 0) {
    slips.push({
      slice: "stay",
      kind: input.stayKind,
      companyId: input.stayKind === "company" ? input.stayCompanyId : null,
      amount: stayBase,
      payable: true,
      hotelAside: false,
    });
  }
  if (fees > 0) {
    slips.push({
      slice: "fees",
      kind: feesKind,
      companyId: feeCompanyId({
        kind: feesKind,
        stayKind: input.stayKind,
        stayCompanyId: input.stayCompanyId,
        otherCompanyId: input.otherCompanyId,
      }),
      amount: fees,
      payable: true,
      hotelAside: false,
    });
  }
  return slips;
}

/** Montant que l’espace client peut régler. Le séjour payé hors agence n’y entre pas. */
export function collectableStayAmount(input: {
  stayTotal: number;
  agencyCommission: boolean;
  clientSettlesStay: boolean;
  pricesVisible: boolean;
  expenses: { amount: number | null }[];
}) {
  const payable = paymentSlips({
    ...input,
    stayKind: "personal",
    stayCompanyId: null,
    feesFollowStay: true,
    otherCompanyId: null,
  }).reduce((sum, slip) => sum + (slip.payable && slip.amount ? slip.amount : 0), 0);
  const rounded = roundMoney(payable);
  return rounded > 0 ? rounded : null;
}

export function encoursPartLabel(kind: PayerKind, companyName: string | null | undefined) {
  if (kind === "personal") return "Particulier";
  const name = (companyName || "").trim();
  return name ? `Société · ${name}` : "Société";
}

type OwedRow = {
  direction: "credit" | "debit";
  amount: number | string;
  status?: string;
  currency?: string;
  billing_company_id?: string | null;
  booking_id?: string | null;
  payer_kind?: PayerKind | null;
};

function rowAmount(row: OwedRow) {
  const amount = Number(row.amount);
  return Number.isFinite(amount) ? amount : null;
}

function countsTowardOwed(row: OwedRow, currency?: string) {
  if (row.status && row.status !== "posted") return false;
  if (currency && row.currency && row.currency !== currency) return false;
  return rowAmount(row) != null;
}

/** Société si la ligne ou le dossier l’indique. Un débit sans marque est particulier. Un crédit sans marque reste libre. */
export function owedSide(
  row: OwedRow,
  bookingPayer: Map<string, PayerKind | null>
): "company" | "personal" | "open" {
  if (row.payer_kind === "company" || row.payer_kind === "personal") return row.payer_kind;
  if (row.billing_company_id) return "company";
  const fromBooking = row.booking_id ? bookingPayer.get(row.booking_id) : null;
  if (fromBooking === "company" || fromBooking === "personal") return fromBooking;
  if (row.direction === "debit") return "personal";
  return "open";
}

/**
 * Ce que le client doit encore, réparti.
 * Les crédits libres (virement non rattaché) réduisent les deux parts au prorata.
 */
export function owedByPayer(
  rows: OwedRow[],
  bookingPayer: Map<string, PayerKind | null>,
  currency?: string
) {
  let companyDebit = 0;
  let personalDebit = 0;
  let companyCredit = 0;
  let personalCredit = 0;
  let openCredit = 0;
  for (const row of rows) {
    if (!countsTowardOwed(row, currency)) continue;
    const amount = rowAmount(row)!;
    const side = owedSide(row, bookingPayer);
    if (row.direction === "debit") {
      if (side === "company") companyDebit += amount;
      else personalDebit += amount;
      continue;
    }
    if (side === "company") companyCredit += amount;
    else if (side === "personal") personalCredit += amount;
    else openCredit += amount;
  }
  let company = companyDebit - companyCredit;
  let personal = personalDebit - personalCredit;
  let pool = openCredit;
  if (company < 0) {
    pool += -company;
    company = 0;
  }
  if (personal < 0) {
    pool += -personal;
    personal = 0;
  }
  const base = company + personal;
  if (pool > 0 && base > 0) {
    const take = Math.min(pool, base);
    const companyTake = roundMoney((company / base) * take);
    company = roundMoney(company - companyTake);
    personal = roundMoney(personal - (take - companyTake));
    if (personal < 0) {
      company = roundMoney(company + personal);
      personal = 0;
    }
    if (company < 0) company = 0;
  } else {
    company = roundMoney(Math.max(0, company));
    personal = roundMoney(Math.max(0, personal));
  }
  return { company, personal };
}

/** Aligne la répartition sur la somme due. Les deux parts additionnent ce total. */
export function fitPayerOwed(company: number, personal: number, target: number) {
  const goal = roundMoney(Math.max(0, target));
  const companyDue = roundMoney(Math.max(0, company));
  const personalDue = roundMoney(Math.max(0, personal));
  const base = roundMoney(companyDue + personalDue);
  if (goal === 0) return { total: 0, company: 0, personal: 0 };
  if (base === 0) return { total: goal, company: 0, personal: goal };
  if (base === goal) return { total: goal, company: companyDue, personal: personalDue };
  let companyPart = roundMoney(goal * (companyDue / base));
  if (companyPart > goal) companyPart = goal;
  return { total: goal, company: companyPart, personal: roundMoney(goal - companyPart) };
}

/** Société qui porte encore le plus gros reste, pour rattacher un règlement société. */
export function anchorBillingCompanyId(
  rows: {
    direction: "credit" | "debit";
    amount: number | string;
    status?: string;
    currency?: string;
    billing_company_id?: string | null;
  }[],
  currency = "EUR"
) {
  const nets = new Map<string, number>();
  for (const row of rows) {
    if (row.status && row.status !== "posted") continue;
    if (row.currency && row.currency !== currency) continue;
    const id = row.billing_company_id || "";
    if (!id) continue;
    const amount = Number(row.amount);
    if (!Number.isFinite(amount)) continue;
    nets.set(id, (nets.get(id) || 0) + (row.direction === "debit" ? amount : -amount));
  }
  let best: string | null = null;
  let bestNet = 0;
  for (const [id, net] of nets) {
    if (net > bestNet) {
      best = id;
      bestNet = net;
    }
  }
  return best;
}
