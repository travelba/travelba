import type { CrmCustomer, CrmTransaction, CompanyRole } from "@/lib/crm/types";

/** Wallet facturé : collaborateur → l’admin société ; sinon lui-même. */
export function resolveBillingCustomerId(
  traveler: Pick<CrmCustomer, "id" | "company_role" | "billing_parent_id">
) {
  if (traveler.company_role === "member" && traveler.billing_parent_id) {
    return traveler.billing_parent_id;
  }
  return traveler.id;
}

/**
 * Carnets lisibles : les siens, plus ceux des collaborateurs rattachés si c’est un admin.
 * Jamais le carnet d’un autre admin.
 */
export function collaboratorTripOwnerIds(
  self: Pick<CrmCustomer, "id" | "company_role">,
  rows: Pick<CrmCustomer, "id" | "company_role" | "billing_parent_id">[]
) {
  const ids = new Set<string>([self.id]);
  if (self.company_role !== "admin") return [self.id];
  for (const row of rows) {
    if (row.company_role === "member" && row.billing_parent_id === self.id) ids.add(row.id);
  }
  return [...ids];
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

/**
 * Member : mouvements de ses dossiers (débits, et un crédit rattaché à l’un d’eux).
 * Pas les versements société. Admin / particulier : grand livre complet de son wallet.
 */
export function filterClientLedgerRows(
  rows: CrmTransaction[],
  opts: { companyRole: CompanyRole | null | undefined; travelerBookingIds: string[] }
) {
  if (opts.companyRole !== "member") return rows;
  const allowed = new Set(opts.travelerBookingIds);
  return rows.filter((t) => t.booking_id != null && allowed.has(t.booking_id));
}

export function parseCompanyRole(value: unknown): CompanyRole | null {
  const v = String(value || "").trim();
  if (v === "admin" || v === "member") return v;
  return null;
}
