import type { CrmCustomer, CrmTransaction, CompanyRole } from "@/lib/crm/types";

/** Wallet facturé pour un voyageur (admin société ou lui-même). */
export function resolveBillingCustomerId(
  traveler: Pick<CrmCustomer, "id" | "company_role" | "billing_parent_id">
) {
  if (traveler.company_role === "member" && traveler.billing_parent_id) {
    return traveler.billing_parent_id;
  }
  return traveler.id;
}

export function companyRoleLabel(role: CompanyRole | null | undefined) {
  switch (role) {
    case "admin":
      return "Admin société";
    case "member":
      return "Collaborateur rattaché";
    default:
      return "Particulier";
  }
}

export function isCompanyMember(
  customer: Pick<CrmCustomer, "company_role"> | null | undefined
) {
  return customer?.company_role === "member";
}

export function isCompanyAdmin(
  customer: Pick<CrmCustomer, "company_role"> | null | undefined
) {
  return customer?.company_role === "admin";
}

/**
 * Member : uniquement débits liés à ses dossiers (pas les revenus société).
 * Admin / particulier : grand livre complet de son wallet.
 */
export function filterClientLedgerRows(
  rows: CrmTransaction[],
  opts: { companyRole: CompanyRole | null | undefined; travelerBookingIds: string[] }
) {
  if (opts.companyRole !== "member") return rows;
  const allowed = new Set(opts.travelerBookingIds);
  return rows.filter(
    (t) =>
      t.direction === "debit" &&
      t.booking_id != null &&
      allowed.has(t.booking_id)
  );
}

export function parseCompanyRole(value: unknown): CompanyRole | null {
  const v = String(value || "").trim();
  if (v === "admin" || v === "member") return v;
  return null;
}
