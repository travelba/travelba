import {
  customerFullName,
  type CompanyRole,
  type CrmBooking,
  type CrmCustomer,
  type CrmTransaction,
} from "@/lib/crm/types";

export type BookingPayerKind = "company" | "personal";

/** Wallet facturé par défaut : le compte partagé s’il existe, sinon le voyageur. */
export function resolveBillingCustomerId(
  traveler: Pick<CrmCustomer, "id" | "company_role" | "billing_parent_id">
) {
  if (traveler.billing_parent_id) return traveler.billing_parent_id;
  return traveler.id;
}

/** Compte de facturation partagé (OZB, etc.), quel que soit le rôle du voyageur. */
export function hasBillingParent(
  customer: Pick<CrmCustomer, "billing_parent_id"> | null | undefined
) {
  return Boolean(customer?.billing_parent_id);
}

export function billingParentError(opts: {
  selfId: string;
  role: CompanyRole | null | undefined;
  parentId: string | null | undefined;
  parentFound?: boolean;
  parentRole?: CompanyRole | null;
}) {
  const parentId = opts.parentId || null;
  if (opts.role === "member" && !parentId) {
    return "Choisissez le compte de facturation pour ce collaborateur.";
  }
  if (!parentId) return null;
  if (parentId === opts.selfId) {
    return "Le payeur ne peut pas être le voyageur lui-même.";
  }
  if (opts.parentFound === false) return "Compte de facturation introuvable.";
  if (opts.parentRole !== undefined && opts.parentRole !== "admin") {
    return "Le compte de facturation doit être un client en rôle « Admin société ».";
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
 * Tranche « voyages payés par un autre wallet » : débits des dossiers du voyageur.
 * N’inclut jamais les crédits / le solde du payeur.
 */
export function filterClientLedgerRows(
  rows: CrmTransaction[],
  opts: {
    companyRole?: CompanyRole | null | undefined;
    sharedBilling?: boolean;
    travelerBookingIds: string[];
  }
) {
  const shared = opts.sharedBilling ?? opts.companyRole === "member";
  if (!shared) return rows;
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
    sharedBilling: true,
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
