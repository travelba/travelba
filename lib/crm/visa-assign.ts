import { resolveNationality } from "@/lib/crm/countries";
import { foldName, isPlaceholderTraveler, lastNamesMatch, nameTokens, namesReferToSamePerson } from "@/lib/crm/person-match";
import type { CrmBookingTraveler } from "@/lib/crm/types";

export type VisaHolder = {
  first_name: string | null;
  last_name: string | null;
  usage_name?: string | null;
  /** Pays du visa, ISO 2 ou nom. */
  country: string | null;
  number?: string | null;
  expires_on?: string | null;
};

export type VisaCountry = { iso: string; name: string };

export type AssignedVisa = {
  travelerId: string;
  companionId: string | null;
  country: string;
  first_name: string | null;
  last_name: string | null;
  usage_name: string | null;
  number: string | null;
  expires_on: string | null;
};

export type VisaAssignResult = {
  assigned: AssignedVisa[];
  errors: string[];
};

const COUNTRY_ALIASES: Record<string, string[]> = {
  US: ["esta", "united states", "etats unis", "u s a", "usa"],
  GB: ["united kingdom", "royaume uni", "great britain"],
  CA: ["ave", "canada"],
  AU: ["evisitor", "australia", "australie"],
  NZ: ["nzeta", "new zealand", "nouvelle zelande"],
  KR: ["k eta", "korea", "coree"],
  IL: ["eta il", "israel"],
  KE: ["kenya"],
  IN: ["india", "inde"],
};

function holderLabel(holder: VisaHolder) {
  return [holder.first_name, holder.last_name].filter(Boolean).join(" ").trim() || "ce visa";
}

export function countriesMentioned(text: string, countries: VisaCountry[]) {
  const folded = foldName(text);
  const found: string[] = [];
  for (const country of countries) {
    const name = foldName(country.name);
    const aliases = COUNTRY_ALIASES[country.iso] || [];
    const named =
      (name.length > 2 && folded.includes(name)) ||
      aliases.some((alias) => folded.includes(alias)) ||
      new RegExp(`\\b${country.iso}\\b`, "i").test(text);
    if (named && !found.includes(country.iso)) found.push(country.iso);
  }
  return found;
}

export function travelerMentioned(traveler: CrmBookingTraveler, text: string) {
  if (isPlaceholderTraveler(traveler.first_name, traveler.last_name)) return false;
  const tokens = nameTokens(text);
  if (!tokens.length) return false;
  const families = [traveler.last_name].filter((value) => foldName(value));
  const lastHit = families.some((name) => tokens.some((token) => lastNamesMatch(name, token)));
  const firstHit = nameTokens(traveler.first_name).some((token) => tokens.includes(token));
  return lastHit && firstHit;
}

/** Texte d’un PDF : une personne par voyageur nommé, si un seul pays du séjour est lisible. */
export function holdersFromVisaText(
  text: string,
  travelers: CrmBookingTraveler[],
  countries: VisaCountry[]
): VisaHolder[] {
  const named = travelers.filter((traveler) => travelerMentioned(traveler, text));
  const isos = countriesMentioned(text, countries);
  if (!named.length || isos.length !== 1) return [];
  return named.map((traveler) => ({
    first_name: traveler.first_name,
    last_name: traveler.last_name,
    usage_name: null,
    country: isos[0],
  }));
}

export function assignVisaHolders(
  holders: VisaHolder[],
  travelers: CrmBookingTraveler[],
  countries: VisaCountry[]
): VisaAssignResult {
  const allowed = new Set(countries.map((country) => country.iso));
  const assigned: AssignedVisa[] = [];
  const errors: string[] = [];
  if (!holders.length) {
    return {
      assigned,
      errors: [
        "Nous n’avons pas lu le nom sur ce visa. Déposez un fichier plus lisible, ou un visa à la fois.",
      ],
    };
  }
  for (const holder of holders) {
    const country = resolveNationality(holder.country);
    const label = holderLabel(holder);
    if (!country || !allowed.has(country)) {
      errors.push(`${label} : ce visa ne correspond pas à un pays du séjour.`);
      continue;
    }
    const matches = travelers.filter((traveler) => namesReferToSamePerson(traveler, holder));
    if (matches.length !== 1) {
      errors.push(
        `${label} : nous n’avons pas reconnu un seul voyageur. Déposez un fichier plus lisible, ou un visa à la fois.`
      );
      continue;
    }
    const traveler = matches[0];
    assigned.push({
      travelerId: traveler.id,
      companionId: traveler.companion_id,
      country,
      first_name: holder.first_name,
      last_name: holder.last_name,
      usage_name: holder.usage_name || null,
      number: holder.number || null,
      expires_on: holder.expires_on || null,
    });
  }
  return { assigned, errors };
}
