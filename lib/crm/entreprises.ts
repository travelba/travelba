import { activityLabel, legalFormLabel } from "./entreprise-labels";

const ANNUAIRE_URL = "https://recherche-entreprises.api.gouv.fr/search";

export type OfficialCompany = {
  legalName: string;
  tradeName: string | null;
  siret: string;
  siren: string | null;
  vat: string | null;
  addressLine: string;
  postalCode: string;
  city: string;
  active: boolean;
  legalForm: string | null;
  activity: string | null;
  site: "Siège" | "Établissement";
  headOfficeCity: string | null;
  createdOn: string | null;
  openSites: number | null;
  directors: string | null;
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
  nom_commercial?: string | null;
  liste_enseignes?: string[] | null;
  activite_principale?: string | null;
};

type Director = {
  nom?: string | null;
  prenoms?: string | null;
  denomination?: string | null;
  qualite?: string | null;
};

export type CompanyHit = {
  nom_complet?: string | null;
  nom_raison_sociale?: string | null;
  etat_administratif?: string | null;
  siege?: Establishment | null;
  matching_etablissements?: Establishment[] | null;
  tva?: string[] | null;
  siren?: string | null;
  sigle?: string | null;
  nature_juridique?: string | null;
  activite_principale?: string | null;
  date_creation?: string | null;
  nombre_etablissements_ouverts?: number | null;
  dirigeants?: Director[] | null;
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

function titleCase(value: string) {
  return value
    .toLocaleLowerCase("fr")
    .replace(/(^|[\s'-])(\p{L})/gu, (chunk) => chunk.toLocaleUpperCase("fr"));
}

function brandOf(place: Establishment | null | undefined) {
  const commercial = (place?.nom_commercial || "").trim();
  const brand = (place?.liste_enseignes || []).map((name) => name.trim()).find(Boolean) || "";
  return commercial || brand;
}

function tradeNameOf(place: Establishment | null, hit: CompanyHit) {
  const sigle = (hit.sigle || "").trim();
  const legal = (hit.nom_raison_sociale || hit.nom_complet || "").trim();
  const picked = brandOf(place) || brandOf(hit.siege) || sigle;
  if (!picked || picked.toLocaleLowerCase("fr") === legal.toLocaleLowerCase("fr")) return null;
  return picked;
}

function directorLine(directors: Director[] | null | undefined) {
  const labels = (directors || [])
    .slice(0, 2)
    .map((person) => {
      const human = [person.prenoms, person.nom]
        .map((part) => (part || "").trim())
        .filter(Boolean)
        .map(titleCase)
        .join(" ");
      const name = human || (person.denomination || "").trim();
      if (!name) return null;
      const role = (person.qualite || "").trim();
      return role ? `${name}, ${role}` : name;
    })
    .filter((label): label is string => Boolean(label));
  return labels.length ? labels.join(" · ") : null;
}

export function officialCompanyFromHit(hit: CompanyHit, queryDigits: string): OfficialCompany | null {
  const place = pickPlace(hit, queryDigits);
  const siret = digitsOnly(place?.siret || "");
  const legalName = (hit.nom_raison_sociale || hit.nom_complet || "").trim();
  if (!legalName || !/^\d{14}$/.test(siret)) return null;
  const placeActive = !place?.etat_administratif || place.etat_administratif === "A";
  const siegeSiret = digitsOnly(hit.siege?.siret || "");
  const isHeadOffice = Boolean(siegeSiret) && siegeSiret === siret;
  const headCity = (hit.siege?.libelle_commune || "").trim();
  const city = (place?.libelle_commune || "").trim();
  const created = (hit.date_creation || "").slice(0, 10);
  const openSites = hit.nombre_etablissements_ouverts;
  return {
    legalName,
    tradeName: tradeNameOf(place, hit),
    siret,
    siren: digitsOnly(hit.siren || "").slice(0, 9) || siret.slice(0, 9),
    vat: hit.tva?.[0]?.replace(/\s/g, "") || null,
    addressLine: place ? streetLine(place) : "",
    postalCode: (place?.code_postal || "").trim(),
    city,
    active: hit.etat_administratif === "A" && placeActive,
    legalForm: legalFormLabel(hit.nature_juridique),
    activity: activityLabel(place?.activite_principale || hit.activite_principale),
    site: isHeadOffice || !siegeSiret ? "Siège" : "Établissement",
    headOfficeCity: !isHeadOffice && headCity && headCity.toLocaleLowerCase("fr") !== city.toLocaleLowerCase("fr") ? titleCase(headCity) : null,
    createdOn: /^\d{4}-\d{2}-\d{2}$/.test(created) ? created : null,
    openSites: typeof openSites === "number" && openSites > 1 ? openSites : null,
    directors: directorLine(hit.dirigeants),
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
    const company = officialCompanyFromHit(hit, numeric ? digits : "");
    if (!company || seen.has(company.siret)) continue;
    seen.add(company.siret);
    companies.push(company);
  }
  return companies;
}
