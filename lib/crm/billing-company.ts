import type { CompanyRole, CrmBooking, CrmCustomer } from "@/lib/crm/types";
import { travelerRoleAfterAttach } from "@/lib/crm/company-role";

const BILLING_COPY_KEYS = [
  "company_name",
  "siret",
  "vat_number",
  "billing_email",
  "billing_address_line",
  "billing_postal_code",
  "billing_city",
  "billing_country",
] as const;

export type BillingCompanyGerant = {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  company_name?: string | null;
};

/** Wallet société = fiche du gérant (il voyage aussi). On copie la facturation du voyageur. */
export function billingCompanyInsertFromTraveler(
  traveler: Pick<CrmCustomer, (typeof BILLING_COPY_KEYS)[number]>,
  gerant: BillingCompanyGerant
): { error: string } | { row: Record<string, string | null> } {
  const email = gerant.email.trim().toLowerCase();
  const firstName = gerant.first_name.trim();
  const lastName = gerant.last_name.trim();
  const companyName = (gerant.company_name ?? traveler.company_name ?? "").trim();
  if (!email) return { error: "E-mail du gérant requis." };
  if (!firstName || !lastName) return { error: "Prénom et nom du gérant requis." };
  if (!companyName) return { error: "Nom de société requis." };

  const row: Record<string, string | null> = {
    email,
    first_name: firstName,
    last_name: lastName,
    phone: gerant.phone?.trim() || null,
    language: "fr",
    company_role: "admin",
    billing_parent_id: null,
  };
  for (const key of BILLING_COPY_KEYS) {
    row[key] = traveler[key] ?? null;
  }
  row.company_name = companyName;
  return { row };
}

export function travelerAttachPatch(
  companyId: string,
  currentRole: CompanyRole | null | undefined
) {
  return {
    billing_parent_id: companyId,
    company_role: travelerRoleAfterAttach(currentRole),
  };
}

/** Dossiers encore facturés au voyageur (pas déjà à un autre payeur). */
export function bookingsToRebill(
  bookings: Pick<CrmBooking, "id" | "customer_id" | "billing_customer_id">[],
  travelerId: string
) {
  return bookings.filter(
    (b) =>
      b.customer_id === travelerId &&
      (!b.billing_customer_id || b.billing_customer_id === travelerId)
  );
}
