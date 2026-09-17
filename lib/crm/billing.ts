import { emptyToNull } from "./identity";

export const CUSTOMER_BILLING_KEYS = [
  "company_name",
  "siret",
  "vat_number",
  "billing_email",
  "billing_address_line",
  "billing_postal_code",
  "billing_city",
  "billing_country",
] as const;

export function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

export function formatSiretInput(value: string) {
  const digits = digitsOnly(value).slice(0, 14);
  return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9), digits.slice(9, 14)]
    .filter(Boolean)
    .join(" ");
}

export function normalizeSiret(value: unknown) {
  const digits = digitsOnly(String(value || ""));
  return digits ? digits : null;
}

function luhnOk(digits: string) {
  let sum = 0;
  let doubleIt = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = Number(digits[i]);
    if (doubleIt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    doubleIt = !doubleIt;
  }
  return sum % 10 === 0;
}

export function siretError(siret: string | null) {
  if (!siret) return null;
  if (siret.length !== 14) return "Le SIRET doit contenir 14 chiffres.";
  if (!luhnOk(siret)) return "SIRET invalide.";
  return null;
}

export function siretFieldError(siret: string | null) {
  if (!siret || siret.length < 14) return null;
  return siretError(siret);
}

export function vatFromSiret(siret: string) {
  if (siret.length !== 14) return null;
  const siren = siret.slice(0, 9);
  const key = (12 + 3 * (Number(siren) % 97)) % 97;
  return `FR${String(key).padStart(2, "0")}${siren}`;
}

export function normalizeVat(value: unknown) {
  const raw = emptyToNull(value);
  if (!raw) return null;
  return raw.replace(/[\s.]/g, "").toUpperCase();
}

export function normalizeFlyingBlue(value: unknown) {
  const raw = emptyToNull(value);
  if (!raw) return null;
  return raw.replace(/\s+/g, "").toUpperCase();
}
