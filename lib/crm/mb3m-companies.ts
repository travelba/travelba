/** Boutons « Créer dans MB3M », un par société. Pas d’appel réseau. */

export type Mb3mCompanyInput = {
  id: string;
  company_name: string | null;
  siret?: string | null;
  vat_number?: string | null;
  billing_address_line?: string | null;
  billing_postal_code?: string | null;
  billing_city?: string | null;
};

export type Mb3mCompanyButton = {
  id: string;
  name: string;
  siret: string | null;
  vat: string | null;
  ready: boolean;
  reason: string | null;
};

function blank(value: string | null | undefined) {
  const text = (value || "").trim();
  return text || null;
}

/** Raison de ne pas appeler MB3M. Le code postal vide fait échouer l’insertion ContactAddress. */
export function mb3mCompanyRefusal(company: Mb3mCompanyInput) {
  const line = (company.billing_address_line || "").trim();
  const city = (company.billing_city || "").trim();
  const postal = (company.billing_postal_code || "").trim();
  if (!line || !city) return "Ajoutez l’adresse de facturation.";
  if (!postal) return "MB3M refuse l’adresse sans code postal.";
  return null;
}

export function mb3mCompanyName(company: { company_name: string | null }) {
  return (company.company_name || "").trim() || "Société";
}

export function mb3mCompanyButtons(companies: Mb3mCompanyInput[]): Mb3mCompanyButton[] {
  return companies.map((company) => {
    const reason = mb3mCompanyRefusal(company);
    return {
      id: company.id,
      name: mb3mCompanyName(company),
      siret: blank(company.siret),
      vat: blank(company.vat_number),
      ready: !reason,
      reason,
    };
  });
}

export function mb3mCompanyError(name: string, message: string) {
  const prefix = `${name} : `;
  return message.startsWith(prefix) ? message : `${prefix}${message}`;
}
