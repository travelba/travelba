import { normalizeFlyingBlue, normalizeSiret, normalizeVat, siretError } from "./billing";
import { resolveCountryCode } from "./countries";
import { emptyToNull } from "./identity";
import { toE164 } from "./phone";

const PHONE_KEYS = new Set(["phone", "phone_secondary"]);
const COUNTRY_KEYS = new Set(["nationality", "country", "billing_country"]);

export const CUSTOMER_PATCH_KEYS = [
  "first_name",
  "last_name",
  "email",
  "phone",
  "phone_secondary",
  "birth_date",
  "sex",
  "nationality",
  "address_line",
  "postal_code",
  "city",
  "country",
  "flying_blue",
  "company_name",
  "siret",
  "vat_number",
  "billing_email",
  "billing_address_line",
  "billing_postal_code",
  "billing_city",
  "billing_country",
] as const;

export function customerPatchFromBody(
  body: Record<string, unknown>,
  opts: { allowEmail?: boolean; strictPhones?: boolean; requirePhone?: boolean } = {}
) {
  const patch: Record<string, unknown> = {};
  for (const key of CUSTOMER_PATCH_KEYS) {
    if (!(key in body)) continue;
    if (key === "email") {
      if (!opts.allowEmail) continue;
      patch.email = String(body.email || "").trim().toLowerCase();
      continue;
    }
    if (PHONE_KEYS.has(key)) {
      const raw = emptyToNull(body[key]);
      if (!raw) {
        patch[key] = null;
        continue;
      }
      const e164 = toE164(raw, "FR");
      if (opts.strictPhones && !e164) {
        return { patch, error: "Numéro de téléphone invalide" };
      }
      patch[key] = e164 || raw;
      continue;
    }
    if (COUNTRY_KEYS.has(key)) {
      patch[key] = resolveCountryCode(String(body[key] || "")) || emptyToNull(body[key]);
      continue;
    }
    if (key === "sex") {
      const sex = emptyToNull(body[key]);
      patch[key] = sex && ["M", "F", "X"].includes(sex) ? sex : null;
      continue;
    }
    if (key === "siret") {
      const siret = normalizeSiret(body[key]);
      const err = siretError(siret);
      if (err) return { patch, error: err };
      patch.siret = siret;
      continue;
    }
    if (key === "vat_number") {
      patch.vat_number = normalizeVat(body[key]);
      continue;
    }
    if (key === "flying_blue") {
      patch.flying_blue = normalizeFlyingBlue(body[key]);
      continue;
    }
    if (key === "billing_email") {
      const email = emptyToNull(body[key]);
      patch.billing_email = email ? email.toLowerCase() : null;
      continue;
    }
    patch[key] = emptyToNull(body[key]);
  }
  if (opts.requirePhone) {
    const raw = emptyToNull(body.phone);
    const e164 = raw ? toE164(raw, "FR") : null;
    if (!e164) return { patch, error: "Indiquez un numéro de téléphone." };
    patch.phone = e164;
  }
  return { patch };
}
