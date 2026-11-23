import { createPrivateKey, sign as cryptoSign, type KeyObject } from "node:crypto";

export type ApnsSettings = {
  keyId: string;
  teamId: string;
  /** PEM PKCS#8 ou SEC1. */
  key: string;
  bundleId: string;
  production: boolean;
};

const PRODUCTION = new Set(["1", "true", "production"]);
const SANDBOX = new Set(["0", "false", "sandbox"]);

/** PEM, retours à la ligne échappés, ou PEM encodé en base64. */
export function apnsPrivateKeyPem(raw: string) {
  const trimmed = raw.trim().replace(/\\n/g, "\n");
  if (trimmed.includes("BEGIN PRIVATE KEY") || trimmed.includes("BEGIN EC PRIVATE KEY")) return trimmed;
  try {
    const decoded = Buffer.from(trimmed, "base64").toString("utf8");
    if (decoded.includes("BEGIN PRIVATE KEY") || decoded.includes("BEGIN EC PRIVATE KEY")) return decoded;
  } catch {
    /* pas du base64 */
  }
  return "";
}

/**
 * Réglages APNs. Vide si une variable manque, ou sur une preview.
 * `APNS_PRODUCTION` doit être explicite : 1 (TestFlight, App Store) ou 0 (bac à sable).
 */
export function readApnsSettings(
  env: Record<string, string | undefined>,
  preview = false
): ApnsSettings | null {
  if (preview) return null;
  const keyId = (env.APNS_KEY_ID || "").trim();
  const teamId = (env.APNS_TEAM_ID || "").trim();
  const key = apnsPrivateKeyPem(env.APNS_KEY_P8 || "");
  const bundleId = (env.APNS_BUNDLE_ID || "fr.travelba.client").trim();
  const flag = (env.APNS_PRODUCTION || "").trim().toLowerCase();
  if (!keyId || !teamId || !key || !bundleId) return null;
  if (!PRODUCTION.has(flag) && !SANDBOX.has(flag)) return null;
  return { keyId, teamId, key, bundleId, production: PRODUCTION.has(flag) };
}

export function apnsHost(production: boolean) {
  return production ? "api.push.apple.com" : "api.sandbox.push.apple.com";
}

function b64url(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

/** JWT ES256 (signature brute R||S) pour l’authentification par jeton APNs. */
export function signApnsJwt(input: { key: KeyObject | string; keyId: string; teamId: string; issuedAt: number }) {
  const header = b64url(JSON.stringify({ alg: "ES256", kid: input.keyId }));
  const claims = b64url(JSON.stringify({ iss: input.teamId, iat: input.issuedAt }));
  const data = `${header}.${claims}`;
  const key = typeof input.key === "string" ? createPrivateKey(input.key) : input.key;
  const signature = cryptoSign("sha256", Buffer.from(data), { key, dsaEncoding: "ieee-p1363" });
  return `${data}.${signature.toString("base64url")}`;
}

/** Jeton appareil APNs : hexadécimal, sans espace. */
export function isApnsDeviceToken(value: string) {
  return /^[0-9a-f]{64,200}$/i.test(value);
}
