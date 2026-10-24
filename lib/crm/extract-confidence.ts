/** Valeur lue, confiance 0–1, et la ligne du mail qui la porte. */

export type QuotedField = {
  key: string;
  value: string;
  confidence: number;
  quote: string;
};

const QUOTED = 0.96;
const UNQUOTED = 0.45;

function lineOf(value: string, source: string) {
  const needle = value.trim().toLowerCase();
  if (needle.length < 3) return "";
  const hit = source.split("\n").find((line) => line.toLowerCase().includes(needle));
  return hit ? hit.trim().slice(0, 240) : "";
}

export function quoteField(key: string, value: string, source: string): QuotedField {
  const text = value.trim();
  const quote = text ? lineOf(text, source) : "";
  return {
    key,
    value: text,
    confidence: quote ? QUOTED : text ? UNQUOTED : 0,
    quote,
  };
}

type ScoredExtract = {
  title?: string | null;
  destination?: string | null;
  items?: {
    title?: string | null;
    confirmation_ref?: string | null;
    kind?: string | null;
    details?: Record<string, unknown> | null;
  }[];
};

/** Confiance du mail : le plus faible des champs présents. Une citation dans le texte vaut 0,96. */
export function scoreExtractFields(extract: ScoredExtract, source: string): {
  fields: QuotedField[];
  confidence: number;
} {
  const fields: QuotedField[] = [];
  const push = (key: string, value: unknown) => {
    if (typeof value !== "string" || !value.trim()) return;
    fields.push(quoteField(key, value, source));
  };
  push("title", extract.title);
  push("destination", extract.destination);
  (extract.items || []).forEach((item, index) => {
    push(`items.${index}.title`, item.title);
    push(`items.${index}.confirmation_ref`, item.confirmation_ref);
    const hotel = item.details?.hotel_name;
    if (typeof hotel === "string") push(`items.${index}.hotel_name`, hotel);
    const flight = item.details?.flight_number;
    if (typeof flight === "string") push(`items.${index}.flight_number`, flight);
  });
  const scored = fields.filter((field) => field.value);
  const confidence = scored.length
    ? Math.round(Math.min(...scored.map((field) => field.confidence)) * 100) / 100
    : UNQUOTED;
  return { fields: scored, confidence };
}
