/** Retire PAN / lignes de paiement avant envoi au modèle et avant persist. */
export function redactIngestText(text: string): string {
  return text
    .replace(/Mode de paiement\s*:[^\n]+/gi, "Mode de paiement : [masqué]")
    .replace(/N[ºo°]?\s*de carte fid[eé]lit[eé][^\n]+/gi, "Carte fidélité : [masqué]")
    .replace(/\bCC[A-Z]{0,2}\s*X{4,}\d{2,4}\b/gi, "[carte]")
    .replace(/\bX{8,}\d{2,4}\b/g, "[carte]")
    .replace(/\b(?:\d{4}[\s-]?){3}\d{4}\b/g, "[carte]");
}

export function redactIngestValue<T>(value: T): T {
  if (typeof value === "string") return redactIngestText(value) as T;
  if (Array.isArray(value)) return value.map((entry) => redactIngestValue(entry)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = redactIngestValue(entry);
    }
    return out as T;
  }
  return value;
}
