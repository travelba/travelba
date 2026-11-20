/** Centimes entiers depuis une chaîne décimale à deux chiffres au plus. Au-delà, on n’arrondit pas. */
export function decimalStringToCents(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return null;
  const fraction = match[2] || "";
  if (fraction.length > 2) return null;
  const cents = Number(match[1]) * 100 + Number((fraction + "00").slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function sumCents(values: Array<number | null | undefined>): number | null {
  let total = 0;
  let seen = false;
  for (const value of values) {
    if (value == null) continue;
    if (!Number.isSafeInteger(value)) return null;
    total += value;
    seen = true;
  }
  return seen ? total : null;
}
