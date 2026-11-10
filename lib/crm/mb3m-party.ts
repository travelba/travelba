import { resolveNationality } from "@/lib/crm/countries";
import { queryWithOptionalColumn } from "@/lib/crm/optional-column";
import {
  Mb3mError,
  mb3mCivilityFromSex,
  mb3mConfigured,
  mb3mPartnerCode,
  mb3mRealm,
  mb3mAddress,
  mb3mSaveCompany,
  mb3mSavePerson,
} from "@/lib/crm/mb3m";
import { createServiceClient } from "@/lib/supabase/admin";

const CUSTOMER_SELECT =
  "id, first_name, last_name, email, phone, phone_secondary, sex, birth_date, nationality, billing_email, billing_address_line, billing_postal_code, billing_city, billing_country, address_line, postal_code, city, country";

const COMPANY_COLUMNS =
  "id, company_name, siret, vat_number, billing_email, billing_address_line, billing_postal_code, billing_city, billing_country";

type PersonRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone?: string | null;
  phone_secondary?: string | null;
  sex?: string | null;
  birth_date?: string | null;
  nationality?: string | null;
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
  siret?: string | null;
  vat_number?: string | null;
  registration_number?: string | null;
  billing_email: string | null;
  billing_address_line: string | null;
  billing_postal_code: string | null;
  billing_city: string | null;
  billing_country: string | null;
};

export type Mb3mHandCompany = {
  name: string;
  siret: string | null;
  vatNumber: string | null;
  registrationNumber: string | null;
};

function blank(value: string | null | undefined) {
  const text = (value || "").trim();
  return text || null;
}

export function mb3mPersonDraft(customer: PersonRow) {
  const firstName = (customer.first_name || "").trim();
  const lastName = (customer.last_name || "").trim();
  const name = [firstName, lastName].filter(Boolean).join(" ").trim() || "Client";
  const address =
    mb3mAddress({
      name,
      line: customer.billing_address_line,
      postal: customer.billing_postal_code,
      city: customer.billing_city,
      country: customer.billing_country,
    }) ||
    mb3mAddress({
      name,
      line: customer.address_line,
      postal: customer.postal_code,
      city: customer.city,
      country: customer.country,
    });
  if (!firstName || !lastName || !address) return null;
  return {
    partnerId: mb3mPartnerCode(customer.id),
    civility: mb3mCivilityFromSex(customer.sex),
    firstName,
    name: lastName,
    email: blank(customer.billing_email) || blank(customer.email) || undefined,
    address,
    birthDate: blank(customer.birth_date),
    country: resolveNationality(customer.nationality) || undefined,
    mobileNumber: blank(customer.phone) || undefined,
    phoneNumber: blank(customer.phone_secondary) || undefined,
  };
}

export function mb3mCompanyDraft(
  company: CompanyRow,
  customer?: { email?: string | null; phone?: string | null }
) {
  const name = (company.company_name || "").trim();
  const address = mb3mAddress({
    name: name || "Société",
    line: company.billing_address_line,
    postal: company.billing_postal_code,
    city: company.billing_city,
    country: company.billing_country,
    company: true,
  });
  if (!name || !address) return null;
  return {
    partnerId: mb3mPartnerCode(company.id),
    name,
    commercialName: name,
    email: blank(company.billing_email) || blank(customer?.email) || undefined,
    phoneNumber: blank(customer?.phone) || undefined,
    address,
  };
}

/** SIRET, TVA et lien du contact : à saisir dans MB3M. L’API Partners ne les porte pas. */
export function mb3mHandCompanies(
  companies: {
    company_name: string | null;
    siret: string | null;
    vat_number: string | null;
    registration_number?: string | null;
  }[]
): Mb3mHandCompany[] {
  return companies.map((company) => ({
    name: (company.company_name || "").trim() || "Société",
    siret: blank(company.siret),
    vatNumber: blank(company.vat_number),
    registrationNumber: blank(company.registration_number),
  }));
}

/** Envoie la fiche au clic. Rien ne part à l’enregistrement. */
export async function pushMb3mCustomer(customerId: string) {
  if (!mb3mConfigured()) throw new Mb3mError("L’accès MB3M n’est pas configuré.", 0);
  const admin = createServiceClient();
  const { data: customer, error } = await admin.from("crm_customers").select(CUSTOMER_SELECT).eq("id", customerId).maybeSingle();
  if (error) throw new Mb3mError(error.message, -1);
  if (!customer) throw new Mb3mError("Client introuvable.", 0);
  const person = mb3mPersonDraft(customer as PersonRow);
  if (!person) throw new Mb3mError("Ajoutez l’adresse avant d’envoyer la fiche.", 0);
  const updated = await partyExists(customerId);
  const saved = await mb3mSavePerson(person);
  await remember(customerId, null, saved.uid, saved.partnerId);
  const { data: companies, error: companyError } = await queryWithOptionalColumn(
    (columns) => admin.from("crm_billing_companies").select(columns).eq("customer_id", customerId),
    COMPANY_COLUMNS,
    "registration_number"
  );
  if (companyError) throw new Mb3mError(companyError.message || "Lecture de la société impossible.", -1);
  for (const company of (companies || []) as unknown as CompanyRow[]) {
    const draft = mb3mCompanyDraft(company, customer as PersonRow);
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
