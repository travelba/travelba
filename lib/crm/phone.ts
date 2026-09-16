import parsePhoneNumberFromString, {
  AsYouType,
  getCountryCallingCode,
  isSupportedCountry,
  type CountryCode,
} from "libphonenumber-js";
import { countriesForSelect } from "./countries";

export type PhoneCountry = {
  iso2: CountryCode;
  name: string;
  dial: string;
  flag: string;
};

export const PHONE_COUNTRIES: PhoneCountry[] = countriesForSelect().flatMap((country) => {
  if (!isSupportedCountry(country.iso2)) return [];
  const iso2 = country.iso2 as CountryCode;
  return [
    {
      iso2,
      name: country.name,
      dial: `+${getCountryCallingCode(iso2)}`,
      flag: country.iso2
        .toUpperCase()
        .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0))),
    },
  ];
});

export function parseStoredPhone(value: string | null | undefined): {
  country: CountryCode;
  national: string;
} {
  if (!value?.trim()) return { country: "FR", national: "" };
  const parsed =
    parsePhoneNumberFromString(value) || parsePhoneNumberFromString(value, "FR");
  if (!parsed) return { country: "FR", national: value };
  return {
    country: parsed.country || "FR",
    national: parsed.formatNational(),
  };
}

export function toE164(
  nationalOrRaw: string,
  country: CountryCode = "FR"
): string | null {
  const parsed = parsePhoneNumberFromString(nationalOrRaw, country);
  if (!parsed?.isValid()) return null;
  return parsed.number;
}

export function isValidPhone(nationalOrRaw: string, country: CountryCode = "FR") {
  if (!nationalOrRaw.trim()) return true;
  return Boolean(parsePhoneNumberFromString(nationalOrRaw, country)?.isValid());
}

export function formatAsYouType(national: string, country: CountryCode) {
  const formatter = new AsYouType(country);
  return formatter.input(national);
}

export function formatPhoneDisplay(value: string | null | undefined) {
  if (!value) return "";
  const parsed = parsePhoneNumberFromString(value) || parsePhoneNumberFromString(value, "FR");
  return parsed ? parsed.formatInternational() : value;
}
