import {
  customerFullName,
  type CompanyRole,
  type CrmBooking,
  type CrmCustomer,
  type CrmTransaction,
} from "@/lib/crm/types";

export type BookingPayerKind = "company" | "personal";

/** Wallet facturé pour un voyageur (admin société par défaut, sinon lui-même). */
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

export function companyDisplayName(
  company: Pick<CrmCustomer, "company_name" | "first_name" | "last_name"> | null | undefined
) {
  const name = company?.company_name?.trim();
  if (name) return name;
  return company ? customerFullName(company) : "la société";
}

/** Dossier dont le wallet n’est pas le voyageur (ex. Marrakech payé par OZB). */
export function isCompanyPaidBooking(
  booking: Pick<CrmBooking, "billing_customer_id" | "customer_id">,
  travelerId: string
) {
  return Boolean(booking.billing_customer_id && booking.billing_customer_id !== travelerId);
}

export function companyPaidBookingIds(
  bookings: Pick<CrmBooking, "id" | "billing_customer_id" | "customer_id">[],
  travelerId: string
) {
  return bookings.filter((b) => isCompanyPaidBooking(b, travelerId)).map((b) => b.id);
}

export function bookingPayerKind(
  booking: Pick<CrmBooking, "billing_customer_id" | "customer_id">,
  travelerId: string
): BookingPayerKind {
  return isCompanyPaidBooking(booking, travelerId) ? "company" : "personal";
}

export function bookingPayerLabel(
  kind: BookingPayerKind,
  companyName: string | null | undefined,
  opts?: { voice?: "client" | "admin" }
) {
  const voice = opts?.voice || "client";
  if (kind === "company") {
    const name = companyName?.trim() || "la société";
    return voice === "admin" ? `Facturé à ${name}` : `Réglé par ${name}`;
  }
  return voice === "admin" ? "À sa charge" : "À votre charge";
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

/**
 * Deux comptes pour un collaborateur :
 * - companyRows = débits de ses dossiers facturés à la société (jamais les crédits société)
 * - personalRows = son wallet (voyages à sa charge, versements perso)
 */
export function splitMemberLedger(opts: {
  personalRows: CrmTransaction[];
  companyDebitRows: CrmTransaction[];
  companyPaidBookingIds: string[];
}) {
  const companyRows = filterClientLedgerRows(opts.companyDebitRows, {
    companyRole: "member",
    travelerBookingIds: opts.companyPaidBookingIds,
  });
  return {
    personalRows: opts.personalRows,
    companyRows,
  };
}

export function sortLedgerRows<T extends { occurred_on: string }>(rows: T[]) {
  return [...rows].sort((a, b) => {
    if (a.occurred_on === b.occurred_on) return 0;
    return a.occurred_on < b.occurred_on ? 1 : -1;
  });
}

export function mergeRowsById<T extends { id: string }>(...lists: T[][]) {
  const map = new Map<string, T>();
  for (const list of lists) {
    for (const row of list) map.set(row.id, row);
  }
  return [...map.values()];
}

export function parseCompanyRole(value: unknown): CompanyRole | null {
  const v = String(value || "").trim();
  if (v === "admin" || v === "member") return v;
  return null;
}
