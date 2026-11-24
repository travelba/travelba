import { isClientInvoiceDocument } from "@/lib/crm/client-price-privacy";
import { isUuid } from "@/lib/crm/ids";
import { foldName } from "@/lib/crm/person-match";
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
 * Carnets du payeur : les siens seulement.
 * Le voyage d’un collaborateur facturé à la société n’entre pas, même publié.
 * Un dossier où il voyage s’ajoute à part, par identifiant de dossier.
 */
export function collaboratorTripOwnerIds(self: Pick<CrmCustomer, "id">) {
  return [self.id];
}

export type ClientBookingScope = {
  ownerIds: string[];
  /** Dossiers d’un autre titulaire où ce client est voyageur. */
  travelerBookingIds: string[];
};

type NamedPerson = {
  first_name?: string | null;
  last_name?: string | null;
  usage_name?: string | null;
};

function foldedPerson(first: string | null | undefined, last: string | null | undefined) {
  const folded = foldName(`${first || ""} ${last || ""}`);
  return folded.split(" ").filter(Boolean).length >= 2 ? folded : "";
}

/** Même prénom et même nom, accents repliés. Un nom seul ne suffit pas. */
export function clientTravelsAs(viewer: NamedPerson, traveler: NamedPerson) {
  const trip = foldedPerson(traveler.first_name, traveler.last_name);
  if (!trip) return false;
  const names = [
    foldedPerson(viewer.first_name, viewer.last_name),
    foldedPerson(viewer.first_name, viewer.usage_name),
  ].filter(Boolean);
  return names.includes(trip);
}

export function bookingIdsWhereClientTravels(
  viewer: NamedPerson,
  travelers: { booking_id?: string | null; first_name?: string | null; last_name?: string | null }[]
) {
  const ids = new Set<string>();
  for (const traveler of travelers) {
    const id = traveler.booking_id || "";
    if (id && clientTravelsAs(viewer, traveler)) ids.add(id);
  }
  return [...ids];
}

/** Séjour montré, à lui, à un jumeau, ou un dossier où il est voyageur. */
export function clientMayReadBooking(
  booking: {
    id: string;
    customer_id?: string | null;
    visible_to_client?: boolean | null;
    archived_at?: string | null;
  },
  scope: ClientBookingScope
) {
  if (booking.visible_to_client !== true || booking.archived_at) return false;
  if (booking.customer_id && scope.ownerIds.includes(booking.customer_id)) return true;
  return scope.travelerBookingIds.includes(booking.id);
}

export function clientBookingFilter(scope: ClientBookingScope):
  | { kind: "eq"; value: string }
  | { kind: "in"; value: string[] }
  | { kind: "or"; value: string }
  | { kind: "none" } {
  const owners = scope.ownerIds.filter((id) => isUuid(id));
  const trips = scope.travelerBookingIds.filter((id) => isUuid(id));
  if (!owners.length && !trips.length) return { kind: "none" };
  if (!trips.length) {
    return owners.length === 1 ? { kind: "eq", value: owners[0] } : { kind: "in", value: owners };
  }
  const parts: string[] = [];
  if (owners.length) parts.push(`customer_id.in.(${owners.join(",")})`);
  parts.push(`id.in.(${trips.join(",")})`);
  return { kind: "or", value: parts.join(",") };
}

type ScopedBookingQuery = {
  eq: (column: string, value: string) => ScopedBookingQuery;
  in: (column: string, value: readonly string[]) => ScopedBookingQuery;
  or: (filters: string) => ScopedBookingQuery;
};

/** Limite une lecture de dossiers au périmètre client. Jamais toute la table. */
export function applyClientBookingScope<Q>(query: Q, scope: ClientBookingScope): Q {
  const builder = query as unknown as ScopedBookingQuery;
  const filter = clientBookingFilter(scope);
  if (filter.kind === "eq") return builder.eq("customer_id", filter.value) as Q;
  if (filter.kind === "in") return builder.in("customer_id", filter.value) as Q;
  if (filter.kind === "or") return builder.or(filter.value) as Q;
  return builder.eq("id", "00000000-0000-0000-0000-000000000000") as Q;
}

/** Facture d’un séjour facturé à ce payeur. Pas un billet, pas un voucher. */
export function payerMayReadBilledInvoice(input: {
  viewerId: string;
  billingCustomerId?: string | null;
  kind?: string | null;
  fileName?: string | null;
  storagePath?: string | null;
}) {
  if (!input.viewerId || input.billingCustomerId !== input.viewerId) return false;
  return isClientInvoiceDocument({
    kind: input.kind,
    file_name: input.fileName,
    storage_path: input.storagePath,
  });
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
