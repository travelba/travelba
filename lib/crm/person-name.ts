export type PersonName = {
  first_name: string | null;
  last_name: string | null;
};

export function normalizePersonName(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/**
 * Nom exact, prénom égal ou préfixe.
 * « Benjamin » et « Benjamin, Elie, David » sont la même personne :
 * la normalisation retire virgules et espaces, puis le plus court est un préfixe.
 * Un prénom de billet vide ne contredit pas la fiche (nom seul).
 */
export function holderNamesMatch(customer: PersonName, person: PersonName) {
  const lastCustomer = normalizePersonName(customer.last_name);
  const lastPerson = normalizePersonName(person.last_name);
  if (!lastPerson || lastCustomer !== lastPerson) return false;
  const firstPerson = normalizePersonName(person.first_name);
  if (!firstPerson) return true;
  const firstCustomer = normalizePersonName(customer.first_name);
  if (!firstCustomer) return false;
  return (
    firstCustomer === firstPerson ||
    firstCustomer.startsWith(firstPerson) ||
    firstPerson.startsWith(firstCustomer)
  );
}

/** Même règle, mais les deux prénoms sont requis : pas de lien sur le seul nom de famille. */
export function companionNamesMatch(companion: PersonName, person: PersonName) {
  const lastCompanion = normalizePersonName(companion.last_name);
  const lastPerson = normalizePersonName(person.last_name);
  const firstCompanion = normalizePersonName(companion.first_name);
  const firstPerson = normalizePersonName(person.first_name);
  if (!lastCompanion || !lastPerson || !firstCompanion || !firstPerson) return false;
  if (lastCompanion !== lastPerson) return false;
  return (
    firstCompanion === firstPerson ||
    firstCompanion.startsWith(firstPerson) ||
    firstPerson.startsWith(firstCompanion)
  );
}

export function proposedTravelerLink(
  traveler: PersonName & { companion_id: string | null; is_account_holder: boolean },
  customer: PersonName,
  companions: Array<PersonName & { id: string }>
): { is_account_holder: true } | { companion_id: string } | null {
  if (traveler.companion_id || traveler.is_account_holder) return null;
  if (holderNamesMatch(customer, traveler)) return { is_account_holder: true };
  const hits = companions.filter((companion) => companionNamesMatch(companion, traveler));
  if (hits.length === 1) return { companion_id: hits[0].id };
  return null;
}
