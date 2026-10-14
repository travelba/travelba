import { resolveCountryCode } from "@/lib/crm/countries";
import { Mb3mError, mb3mConfigured, mb3mPartnerCode, mb3mRealm, mb3mSaveCompany, mb3mSavePerson, type Mb3mAddress } from "@/lib/crm/mb3m";
import { createServiceClient } from "@/lib/supabase/admin";

type PersonRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  billing_email: string | null;
  billing_address_line: string | null;
  billing_postal_code: string | null;
  billing_city: string | null;
  billing_country: string | null;
  address_line: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
};

type CompanyRow = {
  id: string;
  company_name: string | null;
  billing_email: string | null;
  billing_address_line: string | null;
  billing_postal_code: string | null;
  billing_city: string | null;
  billing_country: string | null;
};

function blank(value: string | null | undefined) {
  const text = (value || "").trim();
  return text || null;
}

function addressOf(
  name: string,
  line: string | null | undefined,
  postal: string | null | undefined,
  city: string | null | undefined,
  country: string | null | undefined
): Mb3mAddress | null {
  const line1 = (line || "").trim();
  const postalCode = (postal || "").trim();
  const cityName = (city || "").trim();
  if (!line1 || !postalCode || !cityName) return null;
  return {
    name,
    line1,
    postalCode,
    city: cityName,
    countryCode: resolveCountryCode(country) || undefined,
  };
}

export function mb3mPersonDraft(customer: PersonRow) {
  const firstName = (customer.first_name || "").trim();
  const lastName = (customer.last_name || "").trim();
  const name = [firstName, lastName].filter(Boolean).join(" ").trim() || "Client";
  const address =
    addressOf(name, customer.billing_address_line, customer.billing_postal_code, customer.billing_city, customer.billing_country) ||
    addressOf(name, customer.address_line, customer.postal_code, customer.city, customer.country);
  if (!firstName || !lastName || !address) return null;
  return {
    partnerId: mb3mPartnerCode(customer.id),
    firstName,
    name: lastName,
    email: blank(customer.billing_email) || blank(customer.email) || undefined,
    address,
  };
}

export function mb3mCompanyDraft(company: CompanyRow) {
  const name = (company.company_name || "").trim();
  const address = addressOf(
    name || "Société",
    company.billing_address_line,
    company.billing_postal_code,
    company.billing_city,
    company.billing_country
  );
  if (!name || !address) return null;
  return {
    partnerId: mb3mPartnerCode(company.id),
    name,
    email: blank(company.billing_email) || undefined,
    address,
  };
}

/** Envoie la fiche au clic. Rien ne part à l’enregistrement. */
export async function pushMb3mCustomer(customerId: string) {
  if (!mb3mConfigured()) throw new Mb3mError("L’accès MB3M n’est pas configuré.", 0);
  const admin = createServiceClient();
  const { data: customer, error } = await admin
    .from("crm_customers")
    .select(
      "id, first_name, last_name, email, billing_email, billing_address_line, billing_postal_code, billing_city, billing_country, address_line, postal_code, city, country"
    )
    .eq("id", customerId)
    .maybeSingle();
  if (error) throw new Mb3mError(error.message, -1);
  if (!customer) throw new Mb3mError("Client introuvable.", 0);
  const person = mb3mPersonDraft(customer as PersonRow);
  if (!person) throw new Mb3mError("Ajoutez l’adresse avant d’envoyer la fiche.", 0);
  const updated = await partyExists(customerId);
  const saved = await mb3mSavePerson(person);
  await remember(customerId, null, saved.uid, saved.partnerId);
  const { data: companies, error: companyError } = await admin
    .from("crm_billing_companies")
    .select("id, company_name, billing_email, billing_address_line, billing_postal_code, billing_city, billing_country")
    .eq("customer_id", customerId);
  if (companyError) throw new Mb3mError(companyError.message, -1);
  for (const company of (companies || []) as CompanyRow[]) {
    const draft = mb3mCompanyDraft(company);
    if (!draft) continue;
    const companySaved = await mb3mSaveCompany(draft);
    await remember(customerId, company.id, companySaved.uid, companySaved.partnerId);
  }
  return { updated };
}

export function mb3mFicheBlocker(customer: PersonRow) {
  if (!mb3mConfigured()) return "L’accès MB3M n’est pas configuré.";
  if (!mb3mPersonDraft(customer)) return "Ajoutez l’adresse avant d’envoyer la fiche.";
  return null;
}

async function partyExists(customerId: string) {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("crm_mb3m_parties")
    .select("id")
    .eq("customer_id", customerId)
    .eq("realm", mb3mRealm())
    .is("billing_company_id", null)
    .maybeSingle();
  if (error) throw new Mb3mError(error.message, -1);
  return Boolean(data?.id);
}

async function remember(customerId: string, companyId: string | null, uid: string, partnerId: string) {
  const admin = createServiceClient();
  const realm = mb3mRealm();
  let query = admin.from("crm_mb3m_parties").select("id").eq("customer_id", customerId).eq("realm", realm);
  query = companyId ? query.eq("billing_company_id", companyId) : query.is("billing_company_id", null);
  const { data: existing, error: readError } = await query.maybeSingle();
  if (readError) throw new Mb3mError(readError.message, -1);
  const row = {
    mb3m_uid: uid,
    partner_id: partnerId || null,
    updated_at: new Date().toISOString(),
  };
  if (existing?.id) {
    const { error } = await admin.from("crm_mb3m_parties").update(row).eq("id", existing.id);
    if (error) throw new Mb3mError(error.message, -1);
    return;
  }
  const { error } = await admin.from("crm_mb3m_parties").insert({
    customer_id: customerId,
    billing_company_id: companyId,
    realm,
    ...row,
  });
  if (error) throw new Mb3mError(error.message, -1);
}
