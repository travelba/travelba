const SECRET_KEY =
  /(^|_)(number|numero_piece|personal_number|mrz|passport|iban|pan|cvc|cvv|raw|body_html|body_text|storage_path|file_path|cover_image_path|path|token|secret|password|api_key|gmail_message_id|gmail_thread_id|stripe_payment_method_id|pliant_card_id)$/i;

const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./;

function secretKey(key: string, keepPieceNumber: boolean) {
  if (keepPieceNumber && key === "numero_piece") return false;
  return SECRET_KEY.test(key);
}

function scrubString(value: string) {
  if (JWT.test(value)) return "retiré";
  if (/^https?:\/\//i.test(value) && (/\/sign\//.test(value) || /[?&]token=/.test(value))) return "retiré";
  return value;
}

/**
 * Retire pièces, secrets et URL signées avant qu’une réponse parte vers Grok.
 * `keepPieceNumber` ne garde que la clé `numero_piece` (outil passeport_voyageur).
 * `keepSignedUrl` ne garde que la clé `url_signee` (outil scan_passeport).
 */
export function redactMcp(value: unknown, depth = 0, keepPieceNumber = false, keepSignedUrl = false): unknown {
  if (depth > 8) return null;
  if (typeof value === "string") return scrubString(value);
  if (Array.isArray(value)) return value.map((item) => redactMcp(item, depth + 1, keepPieceNumber, keepSignedUrl));
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (secretKey(key, keepPieceNumber)) continue;
    if (keepSignedUrl && key === "url_signee" && typeof item === "string") {
      out[key] = item;
      continue;
    }
    out[key] = redactMcp(item, depth + 1, keepPieceNumber, keepSignedUrl);
  }
  return out;
}
