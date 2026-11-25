export type BrandMark = {
  kind: "airline" | "car" | "rail";
  code: string;
  src: string;
  alt: string;
};

const AIRLINE_NAMES: { re: RegExp; iata: string }[] = [
  { re: /\bAIR FRANCE\b|\bAF\b/i, iata: "AF" },
  { re: /\bKLM\b/i, iata: "KL" },
  { re: /\bCOPA\b/i, iata: "CM" },
  { re: /\bAIR PANAMA\b/i, iata: "7P" },
  { re: /\bIBERIA\b/i, iata: "IB" },
  { re: /\bBRITISH AIRWAYS\b|\bBA\b/i, iata: "BA" },
  { re: /\bLUFTHANSA\b/i, iata: "LH" },
  { re: /\bSWISS\b/i, iata: "LX" },
  { re: /\bTRANSAVIA\b/i, iata: "TO" },
  { re: /\bEASYJET\b/i, iata: "U2" },
  { re: /\bRYANAIR\b/i, iata: "FR" },
  { re: /\bTUI\b/i, iata: "TB" },
  { re: /\bROYAL AIR MAROC\b/i, iata: "AT" },
  { re: /\bVUELING\b/i, iata: "VY" },
  { re: /\bEMIRATES\b/i, iata: "EK" },
  { re: /\bQATAR\b/i, iata: "QR" },
  { re: /\bTURKISH\b/i, iata: "TK" },
  { re: /\bDELTA\b/i, iata: "DL" },
  { re: /\bUNITED\b/i, iata: "UA" },
  { re: /\bAMERICAN AIRLINES\b/i, iata: "AA" },
  { re: /\bAIR CANADA\b/i, iata: "AC" },
  { re: /\bTAP\b/i, iata: "TP" },
  { re: /\bALITALIA\b|\bITA AIRWAYS\b/i, iata: "AZ" },
  { re: /\bHAHN AIR\b/i, iata: "HR" },
];

const CAR_BRANDS: { re: RegExp; slug: string; label: string }[] = [
  { re: /\bSIXT\b/i, slug: "sixt", label: "SIXT" },
  { re: /\bHERTZ\b/i, slug: "hertz", label: "Hertz" },
  { re: /\bEUROPCAR\b/i, slug: "europcar", label: "Europcar" },
  { re: /\bAVIS\b/i, slug: "avis", label: "Avis" },
  { re: /\bBUDGET\b/i, slug: "budget", label: "Budget" },
  { re: /\bENTERPRISE\b/i, slug: "enterprise", label: "Enterprise" },
  { re: /\bALAMO\b/i, slug: "alamo", label: "Alamo" },
  { re: /\bNATIONAL\b/i, slug: "national", label: "National" },
];

export function airlineIataFromFlightNumber(value: string | null | undefined) {
  const match = String(value || "")
    .trim()
    .toUpperCase()
    .match(/^([A-Z0-9]{2})\s*\d/);
  return match?.[1] || null;
}

export function airlineIataFromName(value: string | null | undefined) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (/^[A-Z0-9]{2}$/.test(text.toUpperCase())) return text.toUpperCase();
  for (const row of AIRLINE_NAMES) {
    if (row.re.test(text)) return row.iata;
  }
  return null;
}

export function inferAirlineIata(input: {
  airline?: string | null;
  airline_iata?: string | null;
  flight_number?: string | null;
}) {
  const stored = String(input.airline_iata || "")
    .trim()
    .toUpperCase();
  if (/^[A-Z0-9]{2}$/.test(stored)) return stored;
  return airlineIataFromFlightNumber(input.flight_number) || airlineIataFromName(input.airline);
}

export function airlineLogoUrl(iata: string) {
  return `https://pics.avs.io/80/80/${encodeURIComponent(iata.toUpperCase())}.png`;
}

export function inferCarBrand(supplier: string | null | undefined, title = "") {
  const hay = `${supplier || ""} ${title}`;
  for (const row of CAR_BRANDS) {
    if (row.re.test(hay)) return row;
  }
  return null;
}

export function carLogoSrc(slug: string) {
  return `/brands/cars/${slug}.svg`;
}

/**
 * Produits entre parenthèses = la compagnie. Lyria, Eurostar (ex-Thalys) et
 * les marques propres passent avant SNCF : un TGV Lyria n’est pas le logo SNCF
 * quand le champ opérateur ne tranche pas.
 */
const RAIL_BRANDS: { re: RegExp; slug: string; label: string }[] = [
  { re: /\bLYRIA\b/, slug: "lyria", label: "Lyria" },
  { re: /\bEUROSTAR\b|\bTHALYS\b|\bES\s*\d{3,4}\b/, slug: "eurostar", label: "Eurostar" },
  { re: /\bFRECCIAROSSA\b|\bFRECCIARGENTO\b|\bFRECCIABIANCA\b|\bTRENITALIA\b|\bFR\s*\d{3,4}\b/, slug: "trenitalia", label: "Trenitalia" },
  { re: /\bITALO\b|\bNTV\b/, slug: "italo", label: "Italo" },
  { re: /\bIRYO\b|\bILSA\b/, slug: "iryo", label: "Iryo" },
  { re: /\bRENFE\b|\bAVE\b/, slug: "renfe", label: "Renfe" },
  { re: /\bDEUTSCHE BAHN\b|\bDB\b|\bICE\b/, slug: "db", label: "Deutsche Bahn" },
  { re: /\bSBB\b|\bCFF\b|\bFFS\b|\bCHEMINS DE FER FEDERAUX\b|\bSCHWEIZERISCHE BUNDESBAHNEN\b/, slug: "sbb", label: "SBB CFF FFS" },
  { re: /\bOBB\b|\bOEBB\b|\bRAILJET\b|\bNIGHTJET\b/, slug: "obb", label: "ÖBB" },
  { re: /\bSNCB\b|\bNMBS\b/, slug: "sncb", label: "SNCB" },
  { re: /\bOUIGO\b|\bTGV\b|\bINOUI\b|\bINTERCITES\b|\bTER\b|\bSNCF\b/, slug: "sncf", label: "SNCF" },
];

function foldRail(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function matchRailBrand(value: string | null | undefined) {
  const text = foldRail(String(value || "").trim());
  if (!text) return null;
  for (const row of RAIL_BRANDS) {
    if (row.re.test(text)) return row;
  }
  return null;
}

function firstRailBrand(values: (string | null | undefined)[]) {
  for (const value of values) {
    const brand = matchRailBrand(value);
    if (brand) return brand;
  }
  return null;
}

export function inferRailBrand(input: {
  operator?: string | null;
  compagnie?: string | null;
  carrier?: string | null;
  company?: string | null;
  railway?: string | null;
  airline?: string | null;
  product?: string | null;
  product_name?: string | null;
  train?: string | null;
  brand?: string | null;
  service?: string | null;
  train_number?: string | null;
  flight_number?: string | null;
  title?: string | null;
  supplier?: string | null;
}) {
  const company = firstRailBrand([
    input.operator,
    input.compagnie,
    input.carrier,
    input.company,
    input.railway,
    input.airline,
  ]);
  if (company) return company;
  return firstRailBrand([
    input.product,
    input.product_name,
    input.train,
    input.brand,
    input.service,
    input.train_number,
    input.flight_number,
    input.title,
    input.supplier,
  ]);
}

export function railLogoSrc(slug: string) {
  return `/brands/rail/${slug}.svg`;
}

function detailString(details: Record<string, unknown>, key: string) {
  const value = details[key];
  return typeof value === "string" ? value : null;
}

export function brandMarkForItem(item: {
  kind?: string | null;
  supplier?: string | null;
  title?: string | null;
  details?: Record<string, unknown> | null;
}): BrandMark | null {
  const details = item.details || {};
  if (item.kind === "flight") {
    const iata = inferAirlineIata({
      airline: typeof details.airline === "string" ? details.airline : null,
      airline_iata: typeof details.airline_iata === "string" ? details.airline_iata : null,
      flight_number: typeof details.flight_number === "string" ? details.flight_number : null,
    });
    if (!iata) return null;
    return {
      kind: "airline",
      code: iata,
      src: airlineLogoUrl(iata),
      alt: String(details.airline || iata),
    };
  }
  if (item.kind === "car") {
    const brand = inferCarBrand(item.supplier, item.title || "");
    if (!brand) return null;
    return {
      kind: "car",
      code: brand.slug,
      src: carLogoSrc(brand.slug),
      alt: brand.label,
    };
  }
  if (item.kind === "rail") {
    const brand = inferRailBrand({
      operator: detailString(details, "operator"),
      compagnie: detailString(details, "compagnie"),
      carrier: detailString(details, "carrier"),
      company: detailString(details, "company"),
      railway: detailString(details, "railway"),
      airline: detailString(details, "airline"),
      product: detailString(details, "product"),
      product_name: detailString(details, "product_name"),
      train: detailString(details, "train"),
      brand: detailString(details, "brand"),
      service: detailString(details, "service"),
      train_number: detailString(details, "train_number"),
      flight_number: detailString(details, "flight_number"),
      title: item.title,
      supplier: item.supplier,
    });
    if (!brand) return null;
    return {
      kind: "rail",
      code: brand.slug,
      src: railLogoSrc(brand.slug),
      alt: brand.label,
    };
  }
  return null;
}
