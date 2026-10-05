import { secretEquals } from "./secret-equals";

export function agencyCodeMatches(given: string, expected: string) {
  const left = given.trim();
  const right = expected.trim();
  if (!left || !right) return false;
  return secretEquals(left, right);
}

export function configuredAgencyCode() {
  return (process.env.AGENCY_CARD_CODE || "").trim();
}
