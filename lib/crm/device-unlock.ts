import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN = /^tu_[A-Za-z0-9_-]{43}$/;
const HASH = /^[a-f0-9]{64}$/;

/** 400 jours, comme le cookie de session. */
export const UNLOCK_TTL_MS = 400 * 24 * 60 * 60 * 1000;

export function createUnlockToken() {
  const token = `tu_${randomBytes(32).toString("base64url")}`;
  const hash = hashUnlockToken(token);
  if (!hash) throw new Error("jeton");
  return { token, hash };
}

export function hashUnlockToken(token: string) {
  if (!TOKEN.test(token)) return null;
  return createHash("sha256").update(token).digest("hex");
}

export function unlockTokenMatches(token: string, hash: string) {
  const computed = hashUnlockToken(token);
  if (!computed || !HASH.test(hash)) return false;
  return timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
}

export type UnlockRow = {
  revokedAt: string | null;
  expiresAt: string;
  email: string | null;
  authUserId: string | null;
};

/** Le jeton ouvre une session seulement s’il est entier, non révoqué, et lié à un titulaire. */
export function unlockSessionDecision(row: UnlockRow | null, now: Date): "ok" | "invalid" {
  if (!row) return "invalid";
  if (row.revokedAt) return "invalid";
  const expires = Date.parse(row.expiresAt);
  if (!Number.isFinite(expires) || expires <= now.getTime()) return "invalid";
  const email = (row.email || "").trim();
  if (!email.includes("@") || !row.authUserId) return "invalid";
  return "ok";
}

export function nextUnlockExpiry(now: Date) {
  return new Date(now.getTime() + UNLOCK_TTL_MS).toISOString();
}
