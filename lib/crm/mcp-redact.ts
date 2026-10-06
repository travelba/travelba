const SECRET_KEY =
  /(^|_)(number|personal_number|mrz|passport|iban|pan|cvc|cvv|raw|body_html|body_text|storage_path|file_path|cover_image_path|path|token|secret|password|api_key|gmail_message_id|gmail_thread_id|stripe_payment_method_id|pliant_card_id)$/i;

const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./;

function secretKey(key: string) {
  return SECRET_KEY.test(key);
}

function scrubString(value: string) {
  if (JWT.test(value)) return "retiré";
  if (/^https?:\/\//i.test(value) && (/\/sign\//.test(value) || /[?&]token=/.test(value))) return "retiré";
  return value;
}

/** Retire pièces, secrets et URL signées avant qu’une réponse parte vers Grok. */
export function redactMcp(value: unknown, depth = 0): unknown {
  if (depth > 8) return null;
  if (typeof value === "string") return scrubString(value);
  if (Array.isArray(value)) return value.map((item) => redactMcp(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (secretKey(key)) continue;
    out[key] = redactMcp(item, depth + 1);
  }
  return out;
}
