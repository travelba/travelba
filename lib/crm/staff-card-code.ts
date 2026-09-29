import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function acceptableStaffCardCode(code: string) {
  const value = code.trim();
  return value.length >= 4 && value.length <= 40;
}

export function hashStaffCardCode(code: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(code.trim(), salt, 32);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function staffCodeDecision(stored: string | null | undefined, code: string, define: boolean) {
  if (!stored) {
    if (!define || !acceptableStaffCardCode(code)) return "missing" as const;
    return "set" as const;
  }
  return staffCardCodeMatches(code, stored) ? ("ok" as const) : ("wrong" as const);
}

export function staffCardCodeMatches(code: string, stored: string | null | undefined) {
  if (!stored) return false;
  const [kind, saltB64, hashB64] = stored.split("$");
  if (kind !== "scrypt" || !saltB64 || !hashB64) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltB64, "base64");
    expected = Buffer.from(hashB64, "base64");
  } catch {
    return false;
  }
  if (!salt.length || expected.length === 0) return false;
  const actual = scryptSync(code.trim(), salt, expected.length);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
