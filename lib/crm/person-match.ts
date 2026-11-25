export type PersonName = {
  first_name: string | null;
  last_name: string | null;
  usage_name?: string | null;
};

export function foldName(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’'`.,;/-]/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function nameTokens(value: string | null | undefined) {
  return foldName(value)
    .split(" ")
    .filter((token) => token.length >= 2);
}

/**
 * Mot d’occupation (FR/EN), sans accent.
 * « an » / « year » ne comptent qu’avec un chiffre, une parenthèse, ou seuls.
 * « guest » et « pax » non plus : « Guest A » et « Pax Test » sont des noms, « 2 guests » est rejeté par le chiffre.
 */
const OCCUPANCY_TOKEN =
  /^(?:adultes?|adults?|enfants?|child(?:ren)?|kids?|bebes?|bab(?:y|ies)|infants?|personnes?|persons?|occupants?|chambres?|rooms?|voyageurs?|travell?ers?)$/;
const AGE_TOKEN = /^(?:an|ans|year|years)$/;
const AGE_FILLER =
  /^(?:de|du|des|un|une|et|moins|of|old|yo|an|ans|year|years|adultes?|adults?|enfants?|child(?:ren)?|kids?|bebes?|bab(?:y|ies)|infants?|personnes?|persons?|occupants?|chambres?|rooms?|voyageurs?|travell?ers?)$/;

function occupancyTokens(value: string) {
  return foldName(value).split(" ").filter(Boolean);
}

/**
 * Libellé de chambre, pas une personne : « 2 adultes », « 1 Adult », « 2 Adulte(s) »,
 * « 1 personne(s) », « 1 Enfant », « 5 ans) », « 2 enfants (1 an ».
 * Un prénom « An » suivi d’un nom (« An Nguyen ») reste un nom.
 */
export function isOccupancyGuestLabel(value: string | null | undefined) {
  const text = (value || "").replace(/\s+/g, " ").trim();
  if (!text) return false;
  if (/[()（）[\]]/.test(text)) return true;
  const tokens = occupancyTokens(text);
  if (tokens.some((token) => OCCUPANCY_TOKEN.test(token))) return true;
  const counted = /\d/.test(text);
  if (counted && (tokens.some((token) => AGE_TOKEN.test(token)) || /^\d+\b/.test(text))) return true;
  if (
    tokens.some((token) => AGE_TOKEN.test(token)) &&
    tokens.every((token) => token.length < 3 || AGE_FILLER.test(token))
  ) {
    return true;
  }
  return false;
}

/** « Adulte 2 » : voyageur sans nom, quand le document n’imprime personne. */
export function isUnnamedAdult(first: string | null | undefined, last: string | null | undefined) {
  return foldName(first) === "adulte" && /^\d+$/.test((last || "").trim());
}

/** Libellé d’occupation déjà découpé en prénom / nom. « Adulte N » n’en fait pas partie. */
export function isDerivedOccupancyTraveler(
  first: string | null | undefined,
  last: string | null | undefined
) {
  if (isUnnamedAdult(first, last)) return false;
  const joined = [first, last]
    .map((part) => (part || "").trim())
    .filter(Boolean)
    .join(" ");
  return isOccupancyGuestLabel(joined);
}

export function isPlaceholderTraveler(
  first: string | null | undefined,
  last: string | null | undefined
) {
  return isUnnamedAdult(first, last) || isDerivedOccupancyTraveler(first, last);
}

const PERSON_NAME = /^[\p{L}'’‘ʼ\-]+(?:\s+[\p{L}'’‘ʼ\-]+)+$/u;

/** Un segment « Prénom Nom ». Un chiffre, une parenthèse ou un mot d’occupation : rien. */
export function parseGuestLabel(value: string): PersonName | null {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text || isOccupancyGuestLabel(text)) return null;
  if (!PERSON_NAME.test(text)) return null;
  const parts = text.split(" ");
  if (parts.length < 2 || parts.some((part) => !/\p{L}/u.test(part))) return null;
  return { first_name: parts.slice(0, -1).join(" "), last_name: parts[parts.length - 1] || null };
}

function editDistance(a: string, b: string) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > 2) return 3;
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

export function lastNamesMatch(a: string | null | undefined, b: string | null | undefined) {
  const left = foldName(a).replace(/ /g, "");
  const right = foldName(b).replace(/ /g, "");
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length < 6 || right.length < 6) return false;
  return editDistance(left, right) <= 2;
}

export function firstNamesMatch(a: string | null | undefined, b: string | null | undefined) {
  const left = nameTokens(a);
  const right = nameTokens(b);
  if (!left.length || !right.length) return false;
  return left.some((token) => right.includes(token));
}

/**
 * Prénom seul, sans nom de famille : le début des prénoms enregistrés.
 * « Charles-Elie » = « Charles Elie John Haim », « Meryl » = « Méryl ».
 * Un prénom plus loin dans la liste (« Elie » devant « Charles Elie ») ne compte pas.
 */
export function firstNameOnlyMatches(query: string | null | undefined, given: string | null | undefined) {
  const left = nameTokens(query);
  const right = nameTokens(given);
  if (!left.length || !right.length || left.length > right.length) return false;
  return left.every((token, index) => token === right[index]);
}

/**
 * Formes courtes et variantes. Un groupe = une personne.
 * Patrick et Patricia restent séparés. Jean n’est pas John.
 */
const GIVEN_VARIANT_GROUPS = [
  ["john", "jonathan", "jon", "johnny", "johnathan"],
  ["yanik", "yannick", "yannik", "yanick", "yannic", "yann"],
  ["mike", "michael", "mickael", "mikhael"],
  ["bob", "robert"],
  ["bill", "will", "william"],
  ["jim", "james"],
  ["joe", "joseph"],
  ["tom", "thomas"],
  ["dan", "danny", "daniel"],
  ["ben", "benjamin"],
  ["sam", "samuel"],
  ["alex", "alexander", "alexandre"],
  ["nick", "nicholas", "nicolas"],
  ["chris", "christopher", "christophe"],
  ["matt", "matthew", "mathieu"],
  ["kate", "cathy", "katherine", "catherine"],
  ["liz", "beth", "elizabeth", "elisabeth"],
  ["steve", "steven", "stephen", "stephane"],
  ["tony", "anthony"],
  ["fred", "frederick", "frederic"],
  ["ed", "edward", "edouard"],
  ["theo", "theodore"],
  ["max", "maxime", "maximilien"],
  ["gab", "gabriel"],
] as const;

const givenVariantKey = new Map<string, number>();
GIVEN_VARIANT_GROUPS.forEach((group, index) => {
  for (const name of group) givenVariantKey.set(name, index);
});

function givenVariantsMatch(a: string, b: string) {
  const left = givenVariantKey.get(a);
  return left != null && left === givenVariantKey.get(b);
}

/** « John » est le début de « Jonathan ». Quatre lettres de plus, pour ne pas confondre Jean et Jeanne. */
function givenPrefixMatch(a: string, b: string) {
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.length >= 4 && longer.length - shorter.length >= 4 && longer.startsWith(shorter);
}

/** Préfixe un peu court (Nathan / Nathanaël) : doute, pas une identité certaine. */
function givenShortPrefix(a: string, b: string) {
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  const extra = longer.length - shorter.length;
  return shorter.length >= 4 && extra >= 2 && extra < 4 && longer.startsWith(shorter);
}

/** Une lettre d’écart, seulement à partir de 4 lettres (Leoh / Leo). Ali ≠ Alice. */
function givenTokenClose(a: string, b: string) {
  if (a === b) return true;
  if (givenVariantsMatch(a, b)) return true;
  if (givenPrefixMatch(a, b)) return true;
  if (Math.max(a.length, b.length) < 4) return false;
  return editDistance(a, b) <= 1;
}

function givenTokensNear(a: string | null | undefined, b: string | null | undefined, maxDistance: number) {
  const left = nameTokens(a);
  const right = nameTokens(b);
  if (!left.length || !right.length) return false;
  return left.some((token) =>
    right.some((other) => {
      if (givenTokenClose(token, other)) return true;
      if (Math.max(token.length, other.length) < 4) return false;
      return editDistance(token, other) <= maxDistance;
    })
  );
}

/** Deux lettres d’écart, ou un préfixe court : possible, pas assez pour rattacher le livret. */
function givenNamesUncertain(a: string | null | undefined, b: string | null | undefined) {
  if (givenNamesClose(a, b)) return false;
  const left = nameTokens(a);
  const right = nameTokens(b);
  if (!left.length || !right.length) return false;
  return left.some((token) =>
    right.some((other) => {
      if (givenShortPrefix(token, other)) return true;
      if (Math.max(token.length, other.length) < 4) return false;
      return editDistance(token, other) <= 2;
    })
  );
}

function givenNamesClose(a: string | null | undefined, b: string | null | undefined) {
  const left = nameTokens(a);
  const right = nameTokens(b);
  if (!left.length || !right.length) return false;
  return left.some((token) => right.some((other) => givenTokenClose(token, other)));
}

function familyValues(person: PersonName) {
  return [person.last_name, person.usage_name].filter((value) => foldName(value));
}

function familiesMatch(a: PersonName, b: PersonName) {
  const left = familyValues(a);
  const right = familyValues(b);
  if (!left.length || !right.length) return false;
  return left.some((name) => right.some((other) => lastNamesMatch(name, other)));
}

function combinedTokens(person: PersonName) {
  return nameTokens(`${person.first_name || ""} ${person.last_name || ""} ${person.usage_name || ""}`);
}

/** Le nom entier est dans un seul champ : « Simon, Albilia » ou « ALBILIA Simon ». */
function nameFoldedIntoOneField(structured: PersonName, blob: PersonName) {
  const families = familyValues(structured);
  const givens = nameTokens(structured.first_name);
  if (!families.length || !givens.length) return false;
  const tokens = combinedTokens(blob);
  if (!tokens.length) return false;
  const familyHit = tokens.some((token) => families.some((name) => lastNamesMatch(name, token)));
  const givenHit = givens.some((given) =>
    tokens.some((token) => givenTokenClose(given, token) && !lastNamesMatch(structured.last_name, token))
  );
  return familyHit && givenHit;
}

export function namesReferToSamePerson(a: PersonName, b: PersonName) {
  if (
    isPlaceholderTraveler(a.first_name, a.last_name) ||
    isPlaceholderTraveler(b.first_name, b.last_name)
  ) {
    return false;
  }
  if (familiesMatch(a, b) && givenNamesClose(a.first_name, b.first_name)) {
    return true;
  }
  if (lastNamesMatch(a.last_name, b.first_name) && givenNamesClose(a.first_name, b.last_name)) {
    return true;
  }
  if (lastNamesMatch(a.first_name, b.last_name) && givenNamesClose(a.last_name, b.first_name)) {
    return true;
  }
  return nameFoldedIntoOneField(a, b) || nameFoldedIntoOneField(b, a);
}

export function sameRecordedTraveler(a: PersonName, b: PersonName) {
  if (isPlaceholderTraveler(a.first_name, a.last_name) || isPlaceholderTraveler(b.first_name, b.last_name)) {
    return (
      foldName(a.first_name) === foldName(b.first_name) &&
      (a.last_name || "").trim() === (b.last_name || "").trim()
    );
  }
  return namesReferToSamePerson(a, b);
}

export type PersonIdentity = PersonName & { birth_date?: string | null };

function birthDay(value: string | null | undefined) {
  const raw = (value || "").trim();
  return raw ? raw.slice(0, 10) : "";
}

/**
 * Même personne, y compris quand les prénoms sont à deux lettres
 * et que le nom et la date de naissance sont les mêmes.
 * Sans cette date, deux lettres ne suffisent pas.
 */
export function sameRecordedIdentity(a: PersonIdentity, b: PersonIdentity) {
  if (
    isPlaceholderTraveler(a.first_name, a.last_name) ||
    isPlaceholderTraveler(b.first_name, b.last_name)
  ) {
    return false;
  }
  if (namesReferToSamePerson(a, b)) return true;
  const left = birthDay(a.birth_date);
  const right = birthDay(b.birth_date);
  if (!left || left !== right) return false;
  if (!familiesMatch(a, b)) return false;
  return givenTokensNear(a.first_name, b.first_name, 2);
}

/**
 * Pas assez sûr pour rattacher le livret, trop proche pour dire qu’il manque.
 * Une date de naissance différente écarte le doute.
 */
export function identitiesCouldBeSame(a: PersonIdentity, b: PersonIdentity) {
  if (
    isPlaceholderTraveler(a.first_name, a.last_name) ||
    isPlaceholderTraveler(b.first_name, b.last_name)
  ) {
    return false;
  }
  if (sameRecordedIdentity(a, b)) return false;
  const left = birthDay(a.birth_date);
  const right = birthDay(b.birth_date);
  if (left && right && left !== right) return false;
  if (!familiesMatch(a, b)) return false;
  if (left && left === right) return true;
  return givenNamesUncertain(a.first_name, b.first_name);
}

/**
 * Ajout d’un accompagnant : le prénom demandé est le début des prénoms enregistrés,
 * et le nom est le nom de naissance ou le nom d’usage. Jamais le nom de famille seul.
 * « Joseph Elie Jacob » n’est pas « Élise ».
 */
export function addedTravelerNames(recorded: PersonName, query: PersonName) {
  if (
    isPlaceholderTraveler(recorded.first_name, recorded.last_name) ||
    isPlaceholderTraveler(query.first_name, query.last_name)
  ) {
    return false;
  }
  if (!nameTokens(query.first_name).length || !foldName(query.last_name)) return false;
  if (!firstNameOnlyMatches(query.first_name, recorded.first_name)) return false;
  return familiesMatch(recorded, query);
}

/**
 * La date de naissance fait partie de la personne.
 * Une date demandée ne correspond qu’à la même date déjà en fiche.
 * Sans date dans la demande, le prénom et le nom suffisent.
 */
export function sameAddedTraveler(recorded: PersonIdentity, query: PersonIdentity) {
  if (!addedTravelerNames(recorded, query)) return false;
  const asked = birthDay(query.birth_date);
  if (!asked) return true;
  const known = birthDay(recorded.birth_date);
  return Boolean(known) && known === asked;
}

function givenNamesAlign(a: string | null | undefined, b: string | null | undefined) {
  return firstNameOnlyMatches(a, b) || firstNameOnlyMatches(b, a);
}

/**
 * Le titulaire ajouté au séjour : les prénoms s’alignent (la fiche peut n’en
 * avoir qu’une partie) et le nom est le sien. Une date déjà en fiche qui
 * diffère est une autre personne. Sans date en fiche, on ne crée pas un
 * compagnon doublon. « David » n’est pas « Ilan David ». « Joseph » n’est pas « Élise ».
 */
export function holderMatchesAddedTraveler(holder: PersonIdentity, query: PersonIdentity) {
  if (
    isPlaceholderTraveler(holder.first_name, holder.last_name) ||
    isPlaceholderTraveler(query.first_name, query.last_name)
  ) {
    return false;
  }
  if (!nameTokens(query.first_name).length || !foldName(query.last_name)) return false;
  if (!givenNamesAlign(query.first_name, holder.first_name)) return false;
  if (!familiesMatch(holder, query)) return false;
  const asked = birthDay(query.birth_date);
  const known = birthDay(holder.birth_date);
  if (asked && known && asked !== known) return false;
  return true;
}

export type PartyMatch = { kind: "holder" } | { kind: "companion"; id: string };

export function matchTravelerToParty(
  traveler: PersonName,
  holder: PersonName,
  companions: (PersonName & { id: string })[]
): PartyMatch | null {
  if (isPlaceholderTraveler(traveler.first_name, traveler.last_name)) return null;
  if (!nameTokens(traveler.first_name).length) return null;
  if (!foldName(traveler.last_name)) {
    const holderHit = firstNameOnlyMatches(traveler.first_name, holder.first_name);
    const companionHits = companions.filter((companion) =>
      firstNameOnlyMatches(traveler.first_name, companion.first_name)
    );
    if (holderHit && companionHits.length === 0) return { kind: "holder" };
    if (!holderHit && companionHits.length === 1) return { kind: "companion", id: companionHits[0].id };
    return null;
  }
  const holderHit = namesReferToSamePerson(traveler, holder);
  const companionHits = companions.filter((companion) => namesReferToSamePerson(traveler, companion));
  if (holderHit && companionHits.length === 0) return { kind: "holder" };
  if (!holderHit && companionHits.length === 1) return { kind: "companion", id: companionHits[0].id };
  return null;
}
