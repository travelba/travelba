import { timingSafeEqual } from "node:crypto";

export function agencyCodeMatches(given: string, expected: string) {
  const left = Buffer.from(given.trim());
  const right = Buffer.from(expected.trim());
  if (left.length === 0 || right.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function configuredAgencyCode() {
  return (process.env.AGENCY_CARD_CODE || "").trim();
}
