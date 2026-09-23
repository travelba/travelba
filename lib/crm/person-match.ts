export type PersonName = {
  first_name: string | null;
  last_name: string | null;
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

export function isPlaceholderTraveler(
  first: string | null | undefined,
  last: string | null | undefined
) {
  return foldName(first) === "adulte" && /^\d+$/.test((last || "").trim());
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

/** Une lettre d’écart, seulement à partir de 4 lettres (Leoh / Leo). Ali ≠ Alice. */
function givenTokenClose(a: string, b: string) {
  if (a === b) return true;
  if (Math.max(a.length, b.length) < 4) return false;
  return editDistance(a, b) <= 1;
}

function givenNamesClose(a: string | null | undefined, b: string | null | undefined) {
  const left = nameTokens(a);
  const right = nameTokens(b);
  if (!left.length || !right.length) return false;
  return left.some((token) => right.some((other) => givenTokenClose(token, other)));
}

function combinedTokens(person: PersonName) {
  return nameTokens(`${person.first_name || ""} ${person.last_name || ""}`);
}

/** Le nom entier est dans un seul champ : « Simon, Albilia » ou « ALBILIA Simon ». */
function nameFoldedIntoOneField(structured: PersonName, blob: PersonName) {
  const family = foldName(structured.last_name).replace(/ /g, "");
  const givens = nameTokens(structured.first_name);
  if (!family || !givens.length) return false;
  const tokens = combinedTokens(blob);
  if (!tokens.length) return false;
  const familyHit = tokens.some((token) => lastNamesMatch(structured.last_name, token));
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
  if (lastNamesMatch(a.last_name, b.last_name) && givenNamesClose(a.first_name, b.first_name)) {
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

export type PartyMatch = { kind: "holder" } | { kind: "companion"; id: string };

export function matchTravelerToParty(
  traveler: PersonName,
  holder: PersonName,
  companions: (PersonName & { id: string })[]
): PartyMatch | null {
  if (isPlaceholderTraveler(traveler.first_name, traveler.last_name)) return null;
  if (!nameTokens(traveler.first_name).length || !foldName(traveler.last_name)) return null;
  const holderHit = namesReferToSamePerson(traveler, holder);
  const companionHits = companions.filter((companion) => namesReferToSamePerson(traveler, companion));
  if (holderHit && companionHits.length === 0) return { kind: "holder" };
  if (!holderHit && companionHits.length === 1) return { kind: "companion", id: companionHits[0].id };
  return null;
}
