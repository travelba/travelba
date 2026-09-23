import airports from "@/lib/crm/airports-iata.json";

const BY_IATA = airports as Record<string, string>;

/** Pays ISO2 d’un code IATA commercial. Null si le code est inconnu. */
export function countryForIata(code: string | null | undefined): string | null {
  const iata = String(code || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(iata)) return null;
  const iso = BY_IATA[iata];
  return iso && /^[A-Z]{2}$/.test(iso) ? iso : null;
}
