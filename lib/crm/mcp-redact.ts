const SECRET_KEY =
  /(^|_)(number|numero_piece|personal_number|mrz|passport|iban|pan|cvc|cvv|expiration|raw|body_html|body_text|storage_path|file_path|cover_image_path|path|token|secret|password|api_key|gmail_message_id|gmail_thread_id|stripe_payment_method_id|pliant_card_id)$/i;

const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./;
const CARD_SECRET_KEY = new Set(["pan", "cvv", "expiration"]);

function secretKey(key: string, keepPieceNumber: boolean, keepCardSecrets: boolean) {
  if (keepPieceNumber && key === "numero_piece") return false;
  if (keepCardSecrets && CARD_SECRET_KEY.has(key)) return false;
  return SECRET_KEY.test(key);
}

function scrubString(value: string, keepCardSecrets: boolean) {
  if (JWT.test(value)) return "retiré";
  if (/^https?:\/\//i.test(value) && (/\/sign\//.test(value) || /[?&]token=/.test(value))) return "retiré";
  if (keepCardSecrets) return value;
  return value.replace(/\b\d{13,19}\b/g, "•••").replace(/\b(?:\d{4} ){3}\d{4,7}\b/g, "•••");
}

/**
 * Retire pièces, secrets et URL signées avant qu’une réponse parte vers Grok.
 * `keepPieceNumber` ne garde que la clé `numero_piece` (outil passeport_voyageur).
 * `keepSignedUrl` ne garde que la clé `url_signee` (outil scan_passeport).
 * `keepCardSecrets` ne garde que `pan`, `cvv` et `expiration` (outil lire_carte_pliant).
 */
export function redactMcp(
  value: unknown,
  depth = 0,
  keepPieceNumber = false,
  keepSignedUrl = false,
  keepCardSecrets = false
): unknown {
  if (depth > 8) return null;
  if (typeof value === "string") return scrubString(value, keepCardSecrets);
  if (Array.isArray(value)) {
    return value.map((item) => redactMcp(item, depth + 1, keepPieceNumber, keepSignedUrl, keepCardSecrets));
  }
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (secretKey(key, keepPieceNumber, keepCardSecrets)) continue;
    if (keepSignedUrl && key === "url_signee" && typeof item === "string") {
      out[key] = item;
      continue;
    }
    out[key] = redactMcp(item, depth + 1, keepPieceNumber, keepSignedUrl, keepCardSecrets);
  }
  return out;
}
