const ANNUAIRE_URL = "https://recherche-entreprises.api.gouv.fr/search";

export type OfficialCompany = {
  legalName: string;
  siret: string;
  vat: string | null;
  addressLine: string;
  postalCode: string;
  city: string;
  active: boolean;
};

type Establishment = {
  siret?: string | null;
  adresse?: string | null;
  code_postal?: string | null;
  libelle_commune?: string | null;
  etat_administratif?: string | null;
  numero_voie?: string | null;
  type_voie?: string | null;
  libelle_voie?: string | null;
  complement_adresse?: string | null;
};

type CompanyHit = {
  nom_complet?: string | null;
  nom_raison_sociale?: string | null;
  etat_administratif?: string | null;
  siege?: Establishment | null;
  matching_etablissements?: Establishment[] | null;
  tva?: string[] | null;
};

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function streetLine(place: Establishment) {
  const road = [place.numero_voie, place.type_voie, place.libelle_voie].filter(Boolean).join(" ").trim();
  if (road) return [place.complement_adresse, road].filter(Boolean).join(" ").trim();
  let line = (place.adresse || "").trim();
  const postal = (place.code_postal || "").trim();
  const city = (place.libelle_commune || "").trim();
  if (postal && city) {
    line = line.replace(new RegExp(`\\s*${escapeRegExp(postal)}\\s+${escapeRegExp(city)}\\s*$`, "i"), "").trim();
  }
  return line;
}

function pickPlace(hit: CompanyHit, queryDigits: string) {
  const matches = hit.matching_etablissements || [];
  if (queryDigits.length === 14) {
    const found = matches.find((place) => digitsOnly(place.siret || "") === queryDigits);
    if (found) {
      if (hit.siege && digitsOnly(hit.siege.siret || "") === queryDigits) return hit.siege;
      return found;
    }
  }
  return hit.siege || matches[0] || null;
}

function toOfficial(hit: CompanyHit, queryDigits: string): OfficialCompany | null {
  const place = pickPlace(hit, queryDigits);
  const siret = digitsOnly(place?.siret || "");
  const legalName = (hit.nom_raison_sociale || hit.nom_complet || "").trim();
  if (!legalName || !/^\d{14}$/.test(siret)) return null;
  const placeActive = !place?.etat_administratif || place.etat_administratif === "A";
  return {
    legalName,
    siret,
    vat: hit.tva?.[0]?.replace(/\s/g, "") || null,
    addressLine: place ? streetLine(place) : "",
    postalCode: (place?.code_postal || "").trim(),
    city: (place?.libelle_commune || "").trim(),
    active: hit.etat_administratif === "A" && placeActive,
  };
}

export async function searchOfficialCompanies(query: string): Promise<OfficialCompany[]> {
  const q = query.trim().slice(0, 80);
  const compact = q.replace(/\s/g, "");
  const digits = digitsOnly(q);
  const numeric = digits.length > 0 && digits.length === compact.length;
  if (numeric ? digits.length < 9 : q.length < 3) return [];

  const url = new URL(ANNUAIRE_URL);
  url.searchParams.set("q", numeric ? digits : q);
  url.searchParams.set("per_page", "8");
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Travelba/1.0 (contact@travelba.fr)",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Annuaire des entreprises indisponible");
  const json = (await res.json()) as { results?: CompanyHit[] };
  const seen = new Set<string>();
  const companies: OfficialCompany[] = [];
  for (const hit of json.results || []) {
    const company = toOfficial(hit, numeric ? digits : "");
    if (!company || seen.has(company.siret)) continue;
    seen.add(company.siret);
    companies.push(company);
  }
  return companies;
}
