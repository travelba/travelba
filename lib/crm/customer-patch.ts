import { normalizeFlyingBlue, normalizeIban, ibanError, normalizeSiret, normalizeVat, siretError } from "./billing";
import { resolveCountryCode, resolveNationality } from "./countries";
import { emptyToNull } from "./identity";
import { normalizeLoyaltyMap } from "./loyalty";
import { parseCompanyRole } from "./company-role";
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
  "loyalty",
  "iban",
  "company_name",
  "siret",
  "vat_number",
  "billing_email",
  "billing_address_line",
  "billing_postal_code",
  "billing_city",
  "billing_country",
  "company_role",
  "billing_parent_id",
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
    if (key === "nationality") {
      patch[key] = resolveNationality(String(body[key] || ""));
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
    if (key === "loyalty") {
      const loyalty = normalizeLoyaltyMap(body.loyalty);
      patch.loyalty = loyalty;
      if (loyalty.flying_blue) patch.flying_blue = loyalty.flying_blue;
      continue;
    }
    if (key === "iban") {
      const iban = normalizeIban(body[key]);
      const err = ibanError(iban);
      if (err) return { patch, error: err };
      patch.iban = iban;
      continue;
    }
    if (key === "billing_email") {
      const email = emptyToNull(body[key]);
      patch.billing_email = email ? email.toLowerCase() : null;
      continue;
    }
    if (key === "company_role") {
      const role = parseCompanyRole(body[key]);
      patch.company_role = role;
      if (role !== "member") patch.billing_parent_id = null;
      continue;
    }
    if (key === "billing_parent_id") {
      patch.billing_parent_id = emptyToNull(body[key]);
      continue;
    }
    patch[key] = emptyToNull(body[key]);
  }
  // Un PATCH partiel (ex. facturation) ne touche pas au téléphone ; on refuse seulement de l’effacer.
  if (opts.requirePhone && "phone" in body) {
    const raw = emptyToNull(body.phone);
    const e164 = raw ? toE164(raw, "FR") : null;
    if (!e164) return { patch, error: "Indiquez un numéro de téléphone." };
    patch.phone = e164;
  }
  return { patch };
}
