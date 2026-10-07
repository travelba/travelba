import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeSiret, normalizeVat, siretError } from "./billing";
import { resolveCountryCode } from "./countries";
import { dbErrorMessage, type DbErrorLike } from "./db-error";
import { fundingCompanyOptionLabel } from "./funding-wallet";
import { emptyToNull } from "./identity";

export const DUPLICATE_SIRET_ERROR = "Ce SIRET est déjà indiqué sur une autre société.";

export type BillingCompanyRow = {
  id: string;
  customer_id: string;
  company_name: string | null;
  siret: string | null;
  vat_number: string | null;
  billing_email: string | null;
  billing_address_line: string | null;
  billing_postal_code: string | null;
  billing_city: string | null;
  billing_country: string | null;
  sort_order: number;
};

export type BillingCompanyInput = {
  id?: string | null;
  company_name?: unknown;
  siret?: unknown;
  vat_number?: unknown;
  billing_email?: unknown;
  billing_address_line?: unknown;
  billing_postal_code?: unknown;
  billing_city?: unknown;
  billing_country?: unknown;
};

const COMPANY_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Libellé d’onglet. Le rang n’est pas une raison sociale. */
export function billingCompanyTabLabel(name: string | null | undefined, index: number, total: number) {
  const trimmed = (name || "").trim();
  if (trimmed) return trimmed;
  if (total <= 1) return "Société";
  return `Société ${index + 1}`;
}

/**
 * Précision affichée dans les transactions.
 * Absente s’il n’y a pas au moins deux sociétés sur le compte.
 */
export function transactionCompanyLabel(
  companyCount: number,
  companyName: string | null | undefined
) {
  if (companyCount < 2) return null;
  const name = (companyName || "").trim();
  return name || null;
}

export function companyLabelForTransaction(
  tx: { customer_id: string; billing_company_id?: string | null },
  companies: (Pick<BillingCompanyRow, "id" | "customer_id" | "company_name"> & {
    funding?: string | null;
  })[]
) {
  const owned = companies.filter((company) => company.customer_id === tx.customer_id);
  const match = tx.billing_company_id
    ? owned.find((company) => company.id === tx.billing_company_id)
    : undefined;
  const name = match
    ? fundingCompanyOptionLabel(match.company_name, match.funding, (match.company_name || "").trim())
    : null;
  return transactionCompanyLabel(owned.length, name);
}

/** Société de la ligne : la dépense si elle en a une, sinon celle du séjour. */
export function debitBillingCompanyId(
  booking: { billing_company_id?: string | null },
  item?: { billing_company_id?: string | null } | null
) {
  return item?.billing_company_id || booking.billing_company_id || null;
}

/**
 * Même formule que la vue crm_customer_balances : crédits posted − débits posted.
 * billing_company_id n’entre pas dans le calcul.
 */
export function postedCustomerBalance(
  rows: {
    customer_id: string;
    currency: string;
    direction: "credit" | "debit";
    amount: number | string;
    status: string;
    billing_company_id?: string | null;
  }[],
  customerId: string,
  currency = "EUR"
) {
  let credits = 0;
  let debits = 0;
  for (const row of rows) {
    if (row.customer_id !== customerId || row.currency !== currency || row.status !== "posted") continue;
    const amount = Number(row.amount);
    if (!Number.isFinite(amount)) continue;
    if (row.direction === "credit") credits += amount;
    else debits += amount;
  }
  return credits - debits;
}

export function parseBillingCompanyId(value: unknown): { id: string | null } | { error: string } {
  if (value == null || value === "") return { id: null };
  const id = String(value).trim();
  if (!COMPANY_UUID.test(id)) return { error: "Société inconnue." };
  return { id };
}

function blankCompany(row: {
  company_name: string | null;
  siret: string | null;
  vat_number: string | null;
  billing_email: string | null;
  billing_address_line: string | null;
  billing_postal_code: string | null;
  billing_city: string | null;
}) {
  return !(
    row.company_name ||
    row.siret ||
    row.vat_number ||
    row.billing_email ||
    row.billing_address_line ||
    row.billing_postal_code ||
    row.billing_city
  );
}

export function normalizeBillingCompanies(raw: unknown):
  | {
      companies: {
        id: string | null;
        company_name: string | null;
        siret: string | null;
        vat_number: string | null;
        billing_email: string | null;
        billing_address_line: string | null;
        billing_postal_code: string | null;
        billing_city: string | null;
        billing_country: string | null;
        sort_order: number;
      }[];
    }
  | { error: string } {
  if (!Array.isArray(raw)) return { error: "Liste de sociétés invalide." };
  const companies: {
    id: string | null;
    company_name: string | null;
    siret: string | null;
    vat_number: string | null;
    billing_email: string | null;
    billing_address_line: string | null;
    billing_postal_code: string | null;
    billing_city: string | null;
    billing_country: string | null;
    sort_order: number;
  }[] = [];
  const sirets = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return { error: "Société invalide." };
    const body = entry as BillingCompanyInput;
    const parsedId = parseBillingCompanyId(body.id);
    if ("error" in parsedId) return parsedId;
    const siret = normalizeSiret(body.siret);
    const siretErr = siretError(siret);
    if (siretErr) return { error: siretErr };
    if (siret) {
      if (sirets.has(siret)) return { error: DUPLICATE_SIRET_ERROR };
      sirets.add(siret);
    }
    const email = emptyToNull(body.billing_email);
    const row = {
      id: parsedId.id,
      company_name: emptyToNull(body.company_name),
      siret,
      vat_number: normalizeVat(body.vat_number),
      billing_email: email ? email.toLowerCase() : null,
      billing_address_line: emptyToNull(body.billing_address_line),
      billing_postal_code: emptyToNull(body.billing_postal_code),
      billing_city: emptyToNull(body.billing_city),
      billing_country: resolveCountryCode(String(body.billing_country || "")) || emptyToNull(body.billing_country),
      sort_order: companies.length,
    };
    if (blankCompany(row)) continue;
    companies.push({ ...row, sort_order: companies.length });
  }
  return { companies };
}

/**
 * Le formulaire renvoie souvent une société sans id après le premier enregistrement.
 * On réutilise alors la ligne qui a déjà ce SIRET, au lieu d’en insérer une deuxième.
 */
export function planBillingCompanyWrites<T extends { id: string | null; siret: string | null }>(
  existing: { id: string; siret: string | null }[],
  companies: T[]
): { writes: (T & { id: string | null })[]; releaseIds: string[]; clearSiretIds: string[] } {
  const existingIds = new Set(existing.map((row) => row.id));
  const claimed = new Set<string>();
  const writes = companies.map((company) => {
    let id: string | null = null;
    if (company.id && existingIds.has(company.id) && !claimed.has(company.id)) {
      id = company.id;
    } else if (company.siret) {
      const match = existing.find(
        (row) => !claimed.has(row.id) && normalizeSiret(row.siret) === company.siret
      );
      if (match) id = match.id;
    }
    if (id) claimed.add(id);
    return { ...company, id };
  });
  const wantedBy = new Map<string, string | null>();
  for (const write of writes) {
    if (write.siret) wantedBy.set(write.siret, write.id);
  }
  const clearSiretIds = existing
    .filter((row) => {
      const siret = normalizeSiret(row.siret);
      if (!siret || !wantedBy.has(siret)) return false;
      return wantedBy.get(siret) !== row.id;
    })
    .map((row) => row.id);
  const releaseIds = existing.map((row) => row.id).filter((id) => !claimed.has(id));
  return { writes, releaseIds, clearSiretIds };
}

function billingWriteError(error: DbErrorLike) {
  console.error("[crm] billing company:", error?.code ?? "?");
  if (error?.code === "23505" || (error?.message || "").includes("crm_billing_companies_siret_uidx")) {
    return { error: DUPLICATE_SIRET_ERROR };
  }
  return { error: dbErrorMessage(error, "Enregistrement de la société impossible.") };
}

/** La première société reste sur la fiche, pour la recherche et le rapprochement. */
export function primaryBillingMirror(
  companies: {
    company_name: string | null;
    siret: string | null;
    vat_number: string | null;
    billing_email: string | null;
    billing_address_line: string | null;
    billing_postal_code: string | null;
    billing_city: string | null;
    billing_country: string | null;
  }[]
) {
  const first = companies[0];
  return {
    company_name: first?.company_name ?? null,
    siret: first?.siret ?? null,
    vat_number: first?.vat_number ?? null,
    billing_email: first?.billing_email ?? null,
    billing_address_line: first?.billing_address_line ?? null,
    billing_postal_code: first?.billing_postal_code ?? null,
    billing_city: first?.billing_city ?? null,
    billing_country: first?.billing_country ?? null,
  };
}

export async function saveCustomerBillingCompanies(
  supabase: SupabaseClient,
  customerId: string,
  raw: unknown
) {
  const normalized = normalizeBillingCompanies(raw);
  if ("error" in normalized) return normalized;
  const { data: existing, error: readError } = await supabase
    .from("crm_billing_companies")
    .select("id, siret, funding")
    .eq("customer_id", customerId);
  if (readError) return billingWriteError(readError);
  const stored = (existing || []) as { id: string; siret: string | null; funding?: string | null }[];
  const plan = planBillingCompanyWrites(stored, normalized.companies);
  const protectedIds = new Set(
    stored.filter((row) => row.funding === "advance" || row.funding === "pro").map((row) => row.id)
  );
  plan.releaseIds = plan.releaseIds.filter((id) => !protectedIds.has(id));

  if (plan.clearSiretIds.length) {
    const { error } = await supabase
      .from("crm_billing_companies")
      .update({ siret: null })
      .eq("customer_id", customerId)
      .in("id", plan.clearSiretIds);
    if (error) return billingWriteError(error);
  }

  for (const company of plan.writes) {
    const fields = {
      company_name: company.company_name,
      siret: company.siret,
      vat_number: company.vat_number,
      billing_email: company.billing_email,
      billing_address_line: company.billing_address_line,
      billing_postal_code: company.billing_postal_code,
      billing_city: company.billing_city,
      billing_country: company.billing_country,
      sort_order: company.sort_order,
    };
    if (company.id) {
      const { error } = await supabase
        .from("crm_billing_companies")
        .update(fields)
        .eq("id", company.id)
        .eq("customer_id", customerId);
      if (error) return billingWriteError(error);
      continue;
    }
    const { error } = await supabase
      .from("crm_billing_companies")
      .insert({ customer_id: customerId, ...fields });
    if (error) return billingWriteError(error);
  }

  if (plan.releaseIds.length) {
    const { error } = await supabase
      .from("crm_billing_companies")
      .delete()
      .eq("customer_id", customerId)
      .in("id", plan.releaseIds);
    if (error) return billingWriteError(error);
  }

  const { error: mirrorError } = await supabase
    .from("crm_customers")
    .update(primaryBillingMirror(normalized.companies))
    .eq("id", customerId);
  if (mirrorError) return billingWriteError(mirrorError);
  const { data: saved, error: savedError } = await supabase
    .from("crm_billing_companies")
    .select("*")
    .eq("customer_id", customerId)
    .order("sort_order");
  if (savedError) return billingWriteError(savedError);
  return { ok: true as const, companies: (saved || []) as BillingCompanyRow[] };
}

/** Rattache un séjour ou une dépense à une société du compte facturé. */
export async function writeBillingAssignment(
  supabase: SupabaseClient,
  booking: { id: string; billing_customer_id?: string | null; customer_id: string },
  body: { billing_company_id?: unknown; item_id?: unknown }
): Promise<{ ok: true } | { error: string; status: number }> {
  return writeBillingAssignmentInner(supabase, booking, body);
}

async function writeBillingAssignmentInner(
  supabase: SupabaseClient,
  booking: { id: string; billing_customer_id?: string | null; customer_id: string },
  body: { billing_company_id?: unknown; item_id?: unknown }
) {
  const parsed = parseBillingCompanyId(body.billing_company_id);
  if ("error" in parsed) return { error: parsed.error, status: 400 };
  const payerId = booking.billing_customer_id || booking.customer_id;
  if (parsed.id) {
    const { data: company, error } = await supabase
      .from("crm_billing_companies")
      .select("id")
      .eq("id", parsed.id)
      .eq("customer_id", payerId)
      .maybeSingle();
    if (error) return { error: error.message, status: 400 };
    if (!company) return { error: "Cette société n’est pas sur le compte facturé.", status: 400 };
  }
  const itemId = body.item_id ? String(body.item_id) : "";
  if (itemId) {
    const { data: item, error: itemError } = await supabase
      .from("crm_booking_items")
      .select("id, kind")
      .eq("id", itemId)
      .eq("booking_id", booking.id)
      .maybeSingle();
    if (itemError) return { error: itemError.message, status: 400 };
    if (!item || item.kind !== "expense") {
      return { error: "Cette dépense n’est pas sur le séjour.", status: 404 };
    }
    const { error } = await supabase
      .from("crm_booking_items")
      .update({ billing_company_id: parsed.id })
      .eq("id", itemId)
      .eq("booking_id", booking.id);
    if (error) return { error: error.message, status: 400 };
    return { ok: true as const };
  }
  const { error } = await supabase
    .from("crm_bookings")
    .update({ billing_company_id: parsed.id })
    .eq("id", booking.id);
  if (error) return { error: error.message, status: 400 };
  return { ok: true as const };
}
