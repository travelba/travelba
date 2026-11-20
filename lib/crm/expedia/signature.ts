import { createHash } from "node:crypto";

/** SHA-512 hexadécimal de clé + secret + timestamp Unix, en secondes. */
export function eanSignature(apiKey: string, sharedSecret: string, timestampSeconds: number) {
  return createHash("sha512").update(`${apiKey}${sharedSecret}${timestampSeconds}`).digest("hex");
}

export function eanAuthorization(apiKey: string, sharedSecret: string, nowMs = Date.now()) {
  const timestamp = Math.floor(nowMs / 1000);
  const signature = eanSignature(apiKey, sharedSecret, timestamp);
  return {
    timestamp,
    signature,
    authorization: `EAN APIKey=${apiKey},Signature=${signature},timestamp=${timestamp}`,
  };
}
