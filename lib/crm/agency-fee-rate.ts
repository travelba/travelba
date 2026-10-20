import type { SupabaseClient } from "@supabase/supabase-js";

/** Choix de la commission d’agence. Le 12 % des devis e-mail n’est pas ici. */
export const AGENCY_FEE_RATES = [0.1, 0.075, 0.05] as const;

export const DEFAULT_AGENCY_FEE_RATE = 0.1;

/** Ligne lue par le client. Le pourcentage reste côté agence. */
export const AGENCY_FEE_LABEL = "Commission d’agence";

export type AgencyFeeRateChoice = (typeof AGENCY_FEE_RATES)[number];

export type AgencyFeeSource = "dossier" | "compte" | "defaut";

export type AgencyFeeAccount = {
  id: string;
  agency_fee_rate?: unknown;
  company_role?: string | null;
  billing_parent_id?: string | null;
};

export type ResolvedAgencyFee = {
  rate: number;
  source: AgencyFeeSource;
};

const RATE_TOLERANCE = 0.00005;

export function agencyFeeRatesEqual(left: number, right: number) {
  return Math.abs(left - right) < RATE_TOLERANCE;
}

/** Taux stocké (numeric Postgres compris). Hors choix, ou vide : null. */
export function parseStoredAgencyFeeRate(value: unknown): AgencyFeeRateChoice | null {
  if (value == null || value === "") return null;
  const raw = typeof value === "number" ? value : Number(String(value).trim().replace(",", "."));
  if (!Number.isFinite(raw)) return null;
  const scaled = raw > 1 ? raw / 100 : raw;
  return AGENCY_FEE_RATES.find((choice) => agencyFeeRatesEqual(choice, scaled)) ?? null;
}

/** Taux appliqué. Une valeur hors choix retombe sur 10 %. */
export function coerceAgencyFeeRate(value: unknown) {
  return parseStoredAgencyFeeRate(value) ?? DEFAULT_AGENCY_FEE_RATE;
}

/** « 10 % », « 7,5 % » ou « 5 % ». */
export function formatAgencyFeePercent(rate: number) {
  const applied = coerceAgencyFeeRate(rate);
  if (agencyFeeRatesEqual(applied, 0.075)) return "7,5 %";
  if (agencyFeeRatesEqual(applied, 0.05)) return "5 %";
  return "10 %";
}

/** Valeur écrite en base : quatre décimales, pour coller au numeric(5,4). */
export function agencyFeeRateColumn(rate: AgencyFeeRateChoice | null) {
  if (rate == null) return null;
  return rate.toFixed(4);
}

/** Valeur du sélecteur pour un taux explicite. */
export function agencyFeeRateKey(rate: number) {
  const applied = coerceAgencyFeeRate(rate);
  if (agencyFeeRatesEqual(applied, 0.075)) return "0.0750";
  if (agencyFeeRatesEqual(applied, 0.05)) return "0.0500";
  return "0.1000";
}

const INHERIT = new Set(["", "compte", "herite", "hérite", "defaut", "défaut", "default"]);

/**
 * Saisie agence ou MCP.
 * Vide, « compte » ou « defaut » : null (le dossier hérite, le compte reprend 10 %).
 */
export function agencyFeeRateField(value: unknown): { rate: AgencyFeeRateChoice | null } | { error: string } {
  if (value == null) return { rate: null };
  const text = String(value).trim().toLowerCase().replace(/\s+/g, " ");
  if (INHERIT.has(text)) return { rate: null };
  const stored = parseStoredAgencyFeeRate(text.replace("%", "").trim());
  if (stored != null) return { rate: stored };
  return { error: "Commission d’agence : 10 %, 7,5 % ou 5 %." };
}

function accountMap(accounts: Map<string, AgencyFeeAccount> | AgencyFeeAccount[] | undefined) {
  if (!accounts) return new Map<string, AgencyFeeAccount>();
  if (accounts instanceof Map) return accounts;
  return new Map(accounts.filter((row) => row?.id).map((row) => [row.id, row]));
}

function accountRate(account: AgencyFeeAccount | null | undefined, accounts: Map<string, AgencyFeeAccount>) {
  if (!account) return null;
  const own = parseStoredAgencyFeeRate(account.agency_fee_rate);
  if (own != null) return own;
  if (account.company_role === "member" && account.billing_parent_id) {
    const parent = accounts.get(account.billing_parent_id);
    return parent ? parseStoredAgencyFeeRate(parent.agency_fee_rate) : null;
  }
  return null;
}

/**
 * Le dossier gagne. Sinon le compte facturé (ou l’admin société s’il est collaborateur).
 * Sinon le voyageur. Sinon 10 %.
 */
export function resolveAgencyFeeRate(input: {
  bookingRate?: unknown;
  billing?: AgencyFeeAccount | null;
  traveler?: AgencyFeeAccount | null;
  accounts?: Map<string, AgencyFeeAccount> | AgencyFeeAccount[];
}): ResolvedAgencyFee {
  const booking = parseStoredAgencyFeeRate(input.bookingRate);
  if (booking != null) return { rate: booking, source: "dossier" };
  const accounts = accountMap(input.accounts);
  if (input.billing) accounts.set(input.billing.id, input.billing);
  if (input.traveler) accounts.set(input.traveler.id, input.traveler);
  const billingRate = accountRate(input.billing, accounts);
  if (billingRate != null) return { rate: billingRate, source: "compte" };
  if (input.traveler && input.traveler.id !== input.billing?.id) {
    const travelerRate = accountRate(input.traveler, accounts);
    if (travelerRate != null) return { rate: travelerRate, source: "compte" };
  }
  return { rate: DEFAULT_AGENCY_FEE_RATE, source: "defaut" };
}

export function agencyFeeSourceLabel(source: AgencyFeeSource) {
  if (source === "dossier") return "ce dossier";
  if (source === "compte") return "compte du client";
  return "taux par défaut";
}

type FeeBooking = {
  id: string;
  agency_fee_rate?: unknown;
  customer_id?: string | null;
  billing_customer_id?: string | null;
  agency_commission?: boolean | null;
};

type DbError = { code?: string; message?: string } | null;

export function agencyFeeColumnMissing(error: DbError) {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  const message = error.message || "";
  return /agency_fee_rate/i.test(message) && /column|schema/i.test(message);
}

function mergeBooking(target: FeeBooking, row: FeeBooking) {
  if (!("agency_fee_rate" in target) && "agency_fee_rate" in row) target.agency_fee_rate = row.agency_fee_rate;
  if (!target.customer_id && row.customer_id) target.customer_id = row.customer_id;
  if (!target.billing_customer_id && row.billing_customer_id) target.billing_customer_id = row.billing_customer_id;
  if (!("agency_commission" in target) && "agency_commission" in row) target.agency_commission = row.agency_commission;
}

async function readBookingRates(supabase: SupabaseClient, ids: string[]) {
  const primary = await supabase
    .from("crm_bookings")
    .select("id, agency_fee_rate, customer_id, billing_customer_id, agency_commission")
    .in("id", ids);
  if (!primary.error) return (primary.data || []) as FeeBooking[];
  if (!agencyFeeColumnMissing(primary.error)) throw primary.error;
  const fallback = await supabase
    .from("crm_bookings")
    .select("id, customer_id, billing_customer_id, agency_commission")
    .in("id", ids);
  if (fallback.error) throw fallback.error;
  return (fallback.data || []) as FeeBooking[];
}

async function readAccountRates(supabase: SupabaseClient, ids: string[]) {
  if (!ids.length) return [] as AgencyFeeAccount[];
  const primary = await supabase
    .from("crm_customers")
    .select("id, agency_fee_rate, company_role, billing_parent_id")
    .in("id", ids);
  if (!primary.error) return (primary.data || []) as AgencyFeeAccount[];
  if (!agencyFeeColumnMissing(primary.error)) throw primary.error;
  return [] as AgencyFeeAccount[];
}

/** Taux de chaque dossier. Colonne absente (migration pas encore jouée) : 10 %. */
export async function loadResolvedAgencyFees(supabase: SupabaseClient, bookings: FeeBooking[]) {
  const byId = new Map<string, FeeBooking>();
  for (const booking of bookings) {
    if (!booking.id) continue;
    byId.set(booking.id, { ...booking });
  }
  const ids = [...byId.keys()];
  const needsBookingRead = [...byId.values()].some(
    (booking) => !booking.customer_id || !("agency_fee_rate" in booking)
  );
  if (needsBookingRead && ids.length) {
    for (const row of await readBookingRates(supabase, ids)) {
      const current = byId.get(row.id);
      if (current) mergeBooking(current, row);
      else byId.set(row.id, row);
    }
  }

  const accounts = new Map<string, AgencyFeeAccount>();
  const needsAccount = [...byId.values()].some((booking) => parseStoredAgencyFeeRate(booking.agency_fee_rate) == null);
  if (needsAccount) {
    const customerIds = [
      ...new Set(
        [...byId.values()].flatMap((booking) => [booking.billing_customer_id, booking.customer_id]).filter((id): id is string => Boolean(id))
      ),
    ];
    for (const row of await readAccountRates(supabase, customerIds)) accounts.set(row.id, row);
    const parentIds = [
      ...new Set(
        [...accounts.values()]
          .filter((row) => row.company_role === "member" && row.billing_parent_id && !accounts.has(row.billing_parent_id))
          .map((row) => row.billing_parent_id as string)
      ),
    ];
    for (const row of await readAccountRates(supabase, parentIds)) accounts.set(row.id, row);
  }

  const resolved = new Map<string, ResolvedAgencyFee>();
  for (const booking of byId.values()) {
    const billingId = booking.billing_customer_id || booking.customer_id || "";
    resolved.set(
      booking.id,
      resolveAgencyFeeRate({
        bookingRate: booking.agency_fee_rate,
        billing: billingId ? accounts.get(billingId) : null,
        traveler: booking.customer_id ? accounts.get(booking.customer_id) : null,
        accounts,
      })
    );
  }
  return resolved;
}

export async function agencyFeeForBooking(supabase: SupabaseClient, booking: FeeBooking) {
  const resolved = await loadResolvedAgencyFees(supabase, [booking]);
  return resolved.get(booking.id) || { rate: DEFAULT_AGENCY_FEE_RATE, source: "defaut" as const };
}
