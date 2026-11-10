import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isForeignBillingCountry,
  normalizeRegistration,
  normalizeSiret,
  normalizeVat,
  registrationError,
  siretError,
} from "./billing";
import { missingDbColumn, queryWithOptionalColumn } from "./optional-column";
import { resolveCountryCode } from "./countries";
import { dbErrorMessage, type DbErrorLike } from "./db-error";
import { fundingCompanyOptionLabel } from "./funding-wallet";
import { emptyToNull } from "./identity";

export const DUPLICATE_SIRET_ERROR = "Ce SIRET est déjà indiqué sur une autre société.";
export const DUPLICATE_REGISTRATION_ERROR = "Cet identifiant d’entreprise est déjà indiqué sur une autre société.";
const REGISTRATION_NOT_READY =
  "L’identifiant d’entreprise n’est pas encore enregistrable. Jouez la migration, puis réessayez.";

export type BillingCompanyRow = {
  id: string;
  customer_id: string;
  company_name: string | null;
  siret: string | null;
  vat_number: string | null;
  /** Numéro de registre hors SIRET. Absent tant que la migration n’est pas jouée. */
  registration_number?: string | null;
  billing_email: string | null;
  billing_address_line: string | null;
  billing_postal_code: string | null;
  billing_city: string | null;
  billing_country: string | null;
  sort_order: number;
  funding?: string | null;
};

export type BillingCompanyInput = {
  id?: string | null;
  company_name?: unknown;
  siret?: unknown;
  vat_number?: unknown;
  registration_number?: unknown;
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

/** Raison sociale, SIRET, TVA, e-mail et adresse absents. Le pays seul ne compte pas. */
export function billingCompanyIsEmpty(row: {
  company_name?: string | null;
  siret?: string | null;
  vat_number?: string | null;
  registration_number?: string | null;
  billing_email?: string | null;
  billing_address_line?: string | null;
  billing_postal_code?: string | null;
  billing_city?: string | null;
}) {
  return ![
    row.company_name,
    row.siret,
    row.vat_number,
    row.registration_number,
    row.billing_email,
    row.billing_address_line,
    row.billing_postal_code,
    row.billing_city,
  ].some((value) => (value || "").trim());
}

function blankCompany(row: {
  company_name: string | null;
  siret: string | null;
  vat_number: string | null;
  registration_number: string | null;
  billing_email: string | null;
  billing_address_line: string | null;
  billing_postal_code: string | null;
  billing_city: string | null;
}) {
  return !(
    row.company_name ||
    row.siret ||
    row.vat_number ||
    row.registration_number ||
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
        registration_number: string | null;
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
    registration_number: string | null;
    billing_email: string | null;
    billing_address_line: string | null;
    billing_postal_code: string | null;
    billing_city: string | null;
    billing_country: string | null;
    sort_order: number;
  }[] = [];
  const sirets = new Set<string>();
  const registrations = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return { error: "Société invalide." };
    const body = entry as BillingCompanyInput;
    const parsedId = parseBillingCompanyId(body.id);
    if ("error" in parsedId) return parsedId;
    const country = resolveCountryCode(String(body.billing_country || "")) || emptyToNull(body.billing_country);
    const foreign = isForeignBillingCountry(country);
    const siret = foreign ? null : normalizeSiret(body.siret);
    const siretErr = siretError(siret);
    if (siretErr) return { error: siretErr };
    if (siret) {
      if (sirets.has(siret)) return { error: DUPLICATE_SIRET_ERROR };
      sirets.add(siret);
    }
    const registration = foreign ? normalizeRegistration(body.registration_number) : null;
    const registrationErr = registrationError(registration);
    if (registrationErr) return { error: registrationErr };
    if (registration) {
      if (registrations.has(registration)) return { error: DUPLICATE_REGISTRATION_ERROR };
      registrations.add(registration);
    }
    const email = emptyToNull(body.billing_email);
    const row = {
      id: parsedId.id,
      company_name: emptyToNull(body.company_name),
      siret,
      vat_number: normalizeVat(body.vat_number),
      registration_number: registration,
      billing_email: email ? email.toLowerCase() : null,
      billing_address_line: emptyToNull(body.billing_address_line),
      billing_postal_code: emptyToNull(body.billing_postal_code),
      billing_city: emptyToNull(body.billing_city),
      billing_country: country,
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
export function planBillingCompanyWrites<
  T extends { id: string | null; siret: string | null; registration_number?: string | null },
>(
  existing: { id: string; siret: string | null; registration_number?: string | null }[],
  companies: T[]
): {
  writes: (T & { id: string | null })[];
  releaseIds: string[];
  clearSiretIds: string[];
  clearRegistrationIds: string[];
} {
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
    } else if (company.registration_number) {
      const match = existing.find(
        (row) =>
          !claimed.has(row.id) && normalizeRegistration(row.registration_number) === company.registration_number
      );
      if (match) id = match.id;
    }
    if (id) claimed.add(id);
    return { ...company, id };
  });
  const wantedSiret = new Map<string, string | null>();
  const wantedRegistration = new Map<string, string | null>();
  for (const write of writes) {
    if (write.siret) wantedSiret.set(write.siret, write.id);
    if (write.registration_number) wantedRegistration.set(write.registration_number, write.id);
  }
  const clearSiretIds = existing
    .filter((row) => {
      const siret = normalizeSiret(row.siret);
      if (!siret || !wantedSiret.has(siret)) return false;
      return wantedSiret.get(siret) !== row.id;
    })
    .map((row) => row.id);
  const clearRegistrationIds = existing
    .filter((row) => {
      const registration = normalizeRegistration(row.registration_number);
      if (!registration || !wantedRegistration.has(registration)) return false;
      return wantedRegistration.get(registration) !== row.id;
    })
    .map((row) => row.id);
  const releaseIds = existing.map((row) => row.id).filter((id) => !claimed.has(id));
  return { writes, releaseIds, clearSiretIds, clearRegistrationIds };
}

function billingWriteError(error: DbErrorLike) {
  console.error("[crm] billing company:", error?.code ?? "?");
  if (error?.code === "23505" || (error?.message || "").includes("crm_billing_companies_siret_uidx")) {
    return { error: DUPLICATE_SIRET_ERROR };
  }
  return { error: dbErrorMessage(error, "Enregistrement de la société impossible.") };
}

const COMPANY_REQUIRED = "Indiquez la raison sociale ou le SIRET, ou l’identifiant d’entreprise.";

function siretAlready(id: string) {
  return `${DUPLICATE_SIRET_ERROR} (${id}).`;
}

function orderedBillingCompanies<T extends { id: string; sort_order: number }>(rows: T[]) {
  return [...rows].sort(
    (a, b) =>
      (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || String(a.id).localeCompare(String(b.id))
  );
}

/** Société principale : la première dans l’ordre des onglets. */
export function primaryBillingCompanyId(rows: { id: string; sort_order: number }[]) {
  return orderedBillingCompanies(rows)[0]?.id ?? null;
}

/** Champs renvoyés par le connecteur. Pas de téléphone : la société n’en a pas. */
export function billingCompaniesPublic(rows: BillingCompanyRow[]) {
  const ordered = orderedBillingCompanies(rows);
  const primary = ordered[0]?.id ?? null;
  return ordered.map((row) => ({
    id: row.id,
    raison_sociale: row.company_name ?? null,
    siret: row.siret ?? null,
    tva: row.vat_number ?? null,
    identifiant_entreprise: row.registration_number ?? null,
    email: row.billing_email ?? null,
    adresse: row.billing_address_line ?? null,
    code_postal: row.billing_postal_code ?? null,
    ville: row.billing_city ?? null,
    pays: row.billing_country ?? null,
    principale: row.id === primary,
    compte: row.funding === "advance" ? ("avance" as const) : row.funding === "pro" ? ("pro" as const) : null,
  }));
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
  const existingRead = await queryWithOptionalColumn(
    (columns) => supabase.from("crm_billing_companies").select(columns).eq("customer_id", customerId),
    "id, siret, funding",
    "registration_number"
  );
  if (existingRead.error) return billingWriteError(existingRead.error);
  const stored = (existingRead.data || []) as unknown as {
    id: string;
    siret: string | null;
    registration_number?: string | null;
    funding?: string | null;
  }[];
  const plan = planBillingCompanyWrites(stored, normalized.companies);
  const protectedIds = new Set(
    stored.filter((row) => row.funding === "advance" || row.funding === "pro").map((row) => row.id)
  );
  plan.releaseIds = plan.releaseIds.filter((id) => !protectedIds.has(id));

  const clearedSiret = await clearCompanyColumn(supabase, customerId, "siret", plan.clearSiretIds);
  if (clearedSiret) return clearedSiret;
  const clearedRegistration = await clearCompanyColumn(
    supabase,
    customerId,
    "registration_number",
    plan.clearRegistrationIds
  );
  if (clearedRegistration) return clearedRegistration;

  for (const company of plan.writes) {
    const fields = {
      ...companyColumns(company),
      sort_order: company.sort_order,
    };
    const written = await applyCompanyWrite(
      supabase,
      company.id ? "update" : "insert",
      { customerId, id: company.id },
      fields
    );
    if (written) return written;
  }

  if (plan.releaseIds.length) {
    const { error } = await supabase
      .from("crm_billing_companies")
      .delete()
      .eq("customer_id", customerId)
      .in("id", plan.releaseIds);
    if (error) return billingWriteError(error);
  }

  const mirrored = await mirrorPrimaryBillingCompany(supabase, customerId, normalized.companies);
  if ("error" in mirrored) return mirrored;
  const saved = await readBillingCompanies(supabase, customerId);
  if ("error" in saved) return saved;
  return { ok: true as const, companies: saved.companies };
}

export async function readBillingCompanies(supabase: SupabaseClient, customerId: string) {
  const { data: saved, error: savedError } = await supabase
    .from("crm_billing_companies")
    .select("*")
    .eq("customer_id", customerId)
    .order("sort_order");
  if (savedError) return billingWriteError(savedError);
  return { companies: (saved || []) as BillingCompanyRow[] };
}

async function mirrorPrimaryBillingCompany(
  supabase: SupabaseClient,
  customerId: string,
  companies: Parameters<typeof primaryBillingMirror>[0]
) {
  const { error: mirrorError } = await supabase
    .from("crm_customers")
    .update(primaryBillingMirror(companies))
    .eq("id", customerId);
  if (mirrorError) return billingWriteError(mirrorError);
  return { ok: true as const };
}

/**
 * Une société sur la fiche : crée, ou met à jour la ligne du même SIRET.
 * Les autres sociétés restent. La première est recopiée sur la fiche, comme le formulaire.
 */
export async function upsertBillingCompany(
  supabase: SupabaseClient,
  customerId: string,
  raw: BillingCompanyInput
): Promise<{ ok: true; company: BillingCompanyRow } | { error: string }> {
  const foreignInput = "billing_country" in raw && isForeignBillingCountry(raw.billing_country);
  const probedSiret = !foreignInput && "siret" in raw ? normalizeSiret(raw.siret) : undefined;
  if (probedSiret !== undefined) {
    const invalid = siretError(probedSiret);
    if (invalid) return { error: invalid };
  }
  const probedRegistration =
    "registration_number" in raw ? normalizeRegistration(raw.registration_number) : undefined;
  if (probedRegistration) {
    const invalid = registrationError(probedRegistration);
    if (invalid) return { error: invalid };
  }
  const { data: existing, error: readError } = await supabase
    .from("crm_billing_companies")
    .select("*")
    .eq("customer_id", customerId);
  if (readError) return billingWriteError(readError);
  const stored = (existing || []) as BillingCompanyRow[];
  let target: BillingCompanyRow | null = null;
  if (probedSiret) {
    target = stored.find((row) => normalizeSiret(row.siret) === probedSiret) || null;
  } else if (probedRegistration) {
    target = stored.find((row) => normalizeRegistration(row.registration_number) === probedRegistration) || null;
  } else if (stored.length > 1) {
    return { error: "Plusieurs sociétés sur la fiche. Indiquez le SIRET ou l’identifiant d’entreprise." };
  } else {
    target = stored[0] || null;
  }
  const merged: BillingCompanyInput = {
    id: target?.id ?? null,
    company_name: "company_name" in raw ? raw.company_name : target?.company_name,
    siret: "siret" in raw ? raw.siret : target?.siret,
    vat_number: "vat_number" in raw ? raw.vat_number : target?.vat_number,
    registration_number: "registration_number" in raw ? raw.registration_number : target?.registration_number,
    billing_email: "billing_email" in raw ? raw.billing_email : target?.billing_email,
    billing_address_line: "billing_address_line" in raw ? raw.billing_address_line : target?.billing_address_line,
    billing_postal_code: "billing_postal_code" in raw ? raw.billing_postal_code : target?.billing_postal_code,
    billing_city: "billing_city" in raw ? raw.billing_city : target?.billing_city,
    billing_country: "billing_country" in raw ? raw.billing_country : target?.billing_country,
  };
  const normalized = normalizeBillingCompanies([merged]);
  if ("error" in normalized) return normalized;
  if (!normalized.companies.length) return { error: COMPANY_REQUIRED };
  const incoming = { ...normalized.companies[0], id: target?.id ?? null };
  const plan = planBillingCompanyWrites(
    stored.map((row) => ({ id: row.id, siret: row.siret, registration_number: row.registration_number })),
    [incoming]
  );
  const clearedSiret = await clearCompanyColumn(supabase, customerId, "siret", plan.clearSiretIds);
  if (clearedSiret) return clearedSiret;
  const clearedRegistration = await clearCompanyColumn(
    supabase,
    customerId,
    "registration_number",
    plan.clearRegistrationIds
  );
  if (clearedRegistration) return clearedRegistration;
  const write = plan.writes[0];
  const sortOrder = target
    ? target.sort_order
    : stored.reduce((max, row) => Math.max(max, Number(row.sort_order) || 0), -1) + 1;
  const fields = {
    ...companyColumns(write),
    sort_order: sortOrder,
  };
  const written = await applyCompanyWrite(
    supabase,
    write.id ? "update" : "insert",
    { customerId, id: write.id },
    fields
  );
  if (written) return written;
  const saved = await readBillingCompanies(supabase, customerId);
  if ("error" in saved) return saved;
  const mirrored = await mirrorPrimaryBillingCompany(supabase, customerId, saved.companies);
  if ("error" in mirrored) return mirrored;
  const company =
    (write.id ? saved.companies.find((row) => row.id === write.id) : null) ||
    saved.companies.find((row) => row.siret && row.siret === write.siret) ||
    saved.companies.find(
      (row) => row.registration_number && row.registration_number === write.registration_number
    ) ||
    saved.companies.find((row) => row.sort_order === sortOrder) ||
    null;
  if (!company) return { error: "Enregistrement de la société impossible." };
  return { ok: true, company };
}

async function requireCustomer(supabase: SupabaseClient, customerId: string) {
  const { data, error } = await supabase.from("crm_customers").select("id").eq("id", customerId).maybeSingle();
  if (error) return billingWriteError(error);
  if (!data) return { error: "Client introuvable." };
  return { ok: true as const };
}

function companyColumns(company: {
  company_name: string | null;
  siret: string | null;
  vat_number: string | null;
  registration_number?: string | null;
  billing_email: string | null;
  billing_address_line: string | null;
  billing_postal_code: string | null;
  billing_city: string | null;
  billing_country: string | null;
}) {
  return {
    company_name: company.company_name,
    siret: company.siret,
    vat_number: company.vat_number,
    registration_number: company.registration_number ?? null,
    billing_email: company.billing_email,
    billing_address_line: company.billing_address_line,
    billing_postal_code: company.billing_postal_code,
    billing_city: company.billing_city,
    billing_country: company.billing_country,
  };
}

async function clearCompanyColumn(
  supabase: SupabaseClient,
  customerId: string,
  column: "siret" | "registration_number",
  ids: string[]
) {
  if (!ids.length) return null;
  const { error } = await supabase
    .from("crm_billing_companies")
    .update({ [column]: null })
    .eq("customer_id", customerId)
    .in("id", ids);
  if (error && column === "registration_number" && missingDbColumn(error, "registration_number")) return null;
  if (error) return billingWriteError(error);
  return null;
}

/** Écrit la société. Sans la colonne d’identifiant, un enregistrement vide de ce champ réessaie sans elle. */
async function applyCompanyWrite(
  supabase: SupabaseClient,
  mode: "insert" | "update",
  scope: { customerId: string; id?: string | null },
  fields: ReturnType<typeof companyColumns> & { sort_order?: number }
) {
  const run = (payload: Record<string, unknown>) => {
    if (mode === "insert") {
      return supabase.from("crm_billing_companies").insert({ customer_id: scope.customerId, ...payload });
    }
    return supabase
      .from("crm_billing_companies")
      .update(payload)
      .eq("id", scope.id || "")
      .eq("customer_id", scope.customerId);
  };
  let result = await run(fields);
  if (result.error && missingDbColumn(result.error, "registration_number")) {
    if (fields.registration_number) return { error: REGISTRATION_NOT_READY };
    const { registration_number: _drop, ...rest } = fields;
    result = await run(rest);
  }
  if (result.error) return billingWriteError(result.error);
  return null;
}

async function duplicateSiret(supabase: SupabaseClient, customerId: string, siret: string | null, mapped: { error: string }) {
  if (mapped.error !== DUPLICATE_SIRET_ERROR || !siret) return mapped;
  const again = await readBillingCompanies(supabase, customerId);
  if ("error" in again) return mapped;
  const clash = again.companies.find((row) => normalizeSiret(row.siret) === siret);
  return clash ? { error: siretAlready(clash.id) } : mapped;
}

/**
 * Ajoute une société de facturation.
 * Les sociétés déjà là, la copie de la première sur la fiche et les dossiers ne sont pas modifiés.
 * Un SIRET déjà présent est refusé.
 */
export async function appendBillingCompany(
  supabase: SupabaseClient,
  customerId: string,
  raw: BillingCompanyInput
): Promise<{ ok: true; company: BillingCompanyRow; companies: BillingCompanyRow[] } | { error: string }> {
  const found = await requireCustomer(supabase, customerId);
  if ("error" in found) return found;
  const normalized = normalizeBillingCompanies([raw]);
  if ("error" in normalized) return normalized;
  const incoming = normalized.companies[0];
  if (!incoming?.company_name && !incoming?.siret && !incoming?.registration_number) return { error: COMPANY_REQUIRED };
  const { data: existing, error: readError } = await supabase
    .from("crm_billing_companies")
    .select("*")
    .eq("customer_id", customerId);
  if (readError) return billingWriteError(readError);
  const stored = (existing || []) as BillingCompanyRow[];
  if (incoming.siret) {
    const clash = stored.find((row) => normalizeSiret(row.siret) === incoming.siret);
    if (clash) return { error: siretAlready(clash.id) };
  }
  if (incoming.registration_number) {
    const clash = stored.find((row) => normalizeRegistration(row.registration_number) === incoming.registration_number);
    if (clash) return { error: `${DUPLICATE_REGISTRATION_ERROR} (${clash.id}).` };
  }
  const sortOrder = stored.reduce((max, row) => Math.max(max, Number(row.sort_order) || 0), -1) + 1;
  const previous = new Set(stored.map((row) => row.id));
  const written = await applyCompanyWrite(supabase, "insert", { customerId }, { ...companyColumns(incoming), sort_order: sortOrder });
  if (written) return duplicateSiret(supabase, customerId, incoming.siret, written);
  const saved = await readBillingCompanies(supabase, customerId);
  if ("error" in saved) return saved;
  if (!stored.length) {
    const mirrored = await mirrorPrimaryBillingCompany(supabase, customerId, orderedBillingCompanies(saved.companies));
    if ("error" in mirrored) return mirrored;
  }
  const company = saved.companies.find((row) => !previous.has(row.id)) || null;
  if (!company) return { error: "Enregistrement de la société impossible." };
  return { ok: true, company, companies: saved.companies };
}

/**
 * Corrige une société déjà là, par identifiant.
 * Seuls les champs fournis changent. Les autres sociétés et les dossiers ne bougent pas.
 * La fiche est recopiée seulement quand la société principale change.
 */
export async function updateBillingCompany(
  supabase: SupabaseClient,
  customerId: string,
  companyId: string,
  raw: BillingCompanyInput
): Promise<{ ok: true; company: BillingCompanyRow; companies: BillingCompanyRow[] } | { error: string }> {
  const found = await requireCustomer(supabase, customerId);
  if ("error" in found) return found;
  const keys = [
    "company_name",
    "siret",
    "vat_number",
    "registration_number",
    "billing_email",
    "billing_address_line",
    "billing_postal_code",
    "billing_city",
    "billing_country",
  ] as const;
  if (!keys.some((key) => key in raw)) return { error: "Rien à modifier." };
  const { data: existing, error: readError } = await supabase
    .from("crm_billing_companies")
    .select("*")
    .eq("customer_id", customerId);
  if (readError) return billingWriteError(readError);
  const stored = (existing || []) as BillingCompanyRow[];
  const target = stored.find((row) => row.id === companyId) || null;
  if (!target) return { error: "Cette société n’est pas sur la fiche du client." };
  const merged: BillingCompanyInput = { id: target.id };
  for (const key of keys) merged[key] = key in raw ? raw[key] : target[key];
  const normalized = normalizeBillingCompanies([merged]);
  if ("error" in normalized) return normalized;
  if (!normalized.companies.length) return { error: "Cette société ne peut pas être vidée ici." };
  const incoming = normalized.companies[0];
  if (incoming.siret) {
    const clash = stored.find((row) => row.id !== target.id && normalizeSiret(row.siret) === incoming.siret);
    if (clash) return { error: siretAlready(clash.id) };
  }
  if (incoming.registration_number) {
    const clash = stored.find(
      (row) => row.id !== target.id && normalizeRegistration(row.registration_number) === incoming.registration_number
    );
    if (clash) return { error: `${DUPLICATE_REGISTRATION_ERROR} (${clash.id}).` };
  }
  const written = await applyCompanyWrite(supabase, "update", { customerId, id: target.id }, companyColumns(incoming));
  if (written) return duplicateSiret(supabase, customerId, incoming.siret, written);
  const saved = await readBillingCompanies(supabase, customerId);
  if ("error" in saved) return saved;
  if (primaryBillingCompanyId(stored) === target.id) {
    const mirrored = await mirrorPrimaryBillingCompany(supabase, customerId, orderedBillingCompanies(saved.companies));
    if ("error" in mirrored) return mirrored;
  }
  const company = saved.companies.find((row) => row.id === target.id) || null;
  if (!company) return { error: "Enregistrement de la société impossible." };
  return { ok: true, company, companies: saved.companies };
}

const BILLING_COMPANY_USE = [
  "crm_bookings",
  "crm_booking_items",
  "crm_transactions",
  "crm_mb3m_account_invoices",
  "crm_mb3m_parties",
] as const;

async function billingCompanyReferenced(supabase: SupabaseClient, companyId: string) {
  for (const table of BILLING_COMPANY_USE) {
    const { data, error } = await supabase.from(table).select("id").eq("billing_company_id", companyId).limit(1);
    if (error) return billingWriteError(error);
    if ((data || []).length) return { used: true as const };
  }
  return { used: false as const };
}

/**
 * Retire une société sans raison sociale, SIRET, TVA, e-mail ni adresse.
 * Un compte avance / pro, ou une société encore citée, reste.
 */
export async function deleteEmptyBillingCompany(
  supabase: SupabaseClient,
  customerId: string,
  companyId: string
): Promise<{ ok: true } | { error: string }> {
  const loaded = await queryWithOptionalColumn(
    (columns) =>
      supabase.from("crm_billing_companies").select(columns).eq("id", companyId).eq("customer_id", customerId).maybeSingle(),
    "id, company_name, siret, vat_number, billing_email, billing_address_line, billing_postal_code, billing_city, funding",
    "registration_number"
  );
  if (loaded.error) return billingWriteError(loaded.error);
  const data = loaded.data;
  if (!data) return { error: "Cette société n’est pas sur la fiche du client." };
  const row = data as unknown as {
    funding?: string | null;
    company_name: string | null;
    siret: string | null;
    vat_number: string | null;
    billing_email: string | null;
    billing_address_line: string | null;
    billing_postal_code: string | null;
    billing_city: string | null;
  };
  if (row.funding === "advance" || row.funding === "pro") {
    return { error: "Ce compte société n’est pas retiré." };
  }
  if (!billingCompanyIsEmpty(row)) return { error: "Cette société n’est pas vide." };
  const used = await billingCompanyReferenced(supabase, companyId);
  if ("error" in used) return used;
  if (used.used) return { error: "Cette société est encore utilisée." };
  const { error: deleteError } = await supabase
    .from("crm_billing_companies")
    .delete()
    .eq("id", companyId)
    .eq("customer_id", customerId);
  if (deleteError) return billingWriteError(deleteError);
  const saved = await readBillingCompanies(supabase, customerId);
  if ("error" in saved) return saved;
  return mirrorPrimaryBillingCompany(supabase, customerId, saved.companies);
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
