export type BrandMark = {
  kind: "airline" | "car";
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
  return null;
}
