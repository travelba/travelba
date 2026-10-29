const SECRET_KEY = /^(authorization|proxy-authorization|api_key|apikey|key_id|api_key_id|password|secret|token|cvc|cvv|pan|card_number)$/i;

function scrubString(value: string, secrets: string[]) {
  let next = value;
  for (const secret of secrets) {
    if (secret.length < 4) continue;
    next = next.split(secret).join("[redacted]");
  }
  return next.replace(/\/\/([^/@\s]+):([^/@\s]+)@/g, "//[redacted]:[redacted]@");
}

/** Retire clés, jetons et identifiants proxy. Les corps métier restent pour la certification. */
export function redact(value: unknown, secrets: string[] = [], depth = 0): unknown {
  if (depth > 12) return "[truncated]";
  if (typeof value === "string") return scrubString(value, secrets);
  if (typeof value === "number" || typeof value === "boolean" || value == null) return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, secrets, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY.test(key)) {
        out[key] = "[redacted]";
        continue;
      }
      out[key] = redact(item, secrets, depth + 1);
    }
    return out;
  }
  return null;
}

export function clipJson(value: unknown, max = 500_000): unknown {
  const json = JSON.stringify(value);
  if (json.length <= max) return value;
  return { truncated: true, chars: json.length, preview: json.slice(0, 2_000) };
}
