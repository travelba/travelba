import type { CrmCustomer, CrmTransaction, CompanyRole } from "@/lib/crm/types";

/** Wallet facturé : collaborateur ou admin associé → le wallet ; sinon lui-même. */
export function resolveBillingCustomerId(
  traveler: Pick<CrmCustomer, "id" | "company_role" | "billing_parent_id">
) {
  if (
    (traveler.company_role === "member" || traveler.company_role === "admin") &&
    traveler.billing_parent_id
  ) {
    return traveler.billing_parent_id;
  }
  return traveler.id;
}

/** Grand livre lu par un admin : le sien, ou celui de l’admin dont il est associé. */
export function adminLedgerCustomerId(
  customer: Pick<CrmCustomer, "id" | "company_role"> &
    Partial<Pick<CrmCustomer, "billing_parent_id">>
) {
  if (customer.company_role === "admin" && customer.billing_parent_id) {
    return customer.billing_parent_id;
  }
  return customer.id;
}

/** Wallet partagé par les admins d’une même société. Null pour un collaborateur. */
export function adminGroupWalletId(
  customer: Pick<CrmCustomer, "id" | "company_role" | "billing_parent_id">
) {
  if (customer.company_role !== "admin") return null;
  return customer.billing_parent_id || customer.id;
}

export function isAssociatedAdmin(
  customer: Pick<CrmCustomer, "company_role" | "billing_parent_id"> | null | undefined
) {
  return customer?.company_role === "admin" && Boolean(customer.billing_parent_id);
}

/** Admins du même wallet, le lecteur compris. Pas les collaborateurs. */
export function adminTripOwnerIds(
  self: Pick<CrmCustomer, "id" | "company_role" | "billing_parent_id">,
  rows: Pick<CrmCustomer, "id" | "company_role" | "billing_parent_id">[]
) {
  const wallet = adminGroupWalletId(self);
  if (!wallet) return [self.id];
  const ids = new Set<string>([self.id]);
  for (const row of rows) {
    if (row.company_role !== "admin") continue;
    if ((row.billing_parent_id || row.id) === wallet) ids.add(row.id);
  }
  return [...ids];
}

export function companyLinkError(input: {
  selfId: string;
  role: CompanyRole | null;
  parentId: string | null;
  parent: Pick<CrmCustomer, "company_role" | "billing_parent_id"> | null;
  childCount: number;
}) {
  const { selfId, role, parentId, parent, childCount } = input;
  if (role !== "member" && !(role === "admin" && parentId)) return null;
  if (!parentId) return "Choisissez l’admin société qui paie pour ce collaborateur.";
  if (parentId === selfId) {
    return role === "admin"
      ? "Un admin ne peut pas être associé à lui-même."
      : "Le payeur ne peut pas être le collaborateur lui-même.";
  }
  if (!parent) return "Admin société introuvable.";
  if (parent.company_role !== "admin") {
    return "Le payeur doit être un client en rôle « Admin société ».";
  }
  if (parent.billing_parent_id) {
    return "L’associé se rattache au wallet, pas à un autre associé.";
  }
  if (role === "admin" && childCount > 0) {
    return "Ce client porte déjà le wallet. Les autres admins s’y rattachent.";
  }
  return null;
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
