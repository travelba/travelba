/**
 * Billet électronique : un code compagnie / PNR n’est pas un passager,
 * et le nombre de billets suit les vrais numéros (13 chiffres).
 */

export function ticketNumberDigits(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 13 ? digits : "";
}

/** Numéros de billet distincts portés par les passagers. */
export function realTicketList(people: unknown): string[] {
  const numbers: string[] = [];
  const seen = new Set<string>();
  if (!Array.isArray(people)) return numbers;
  for (const person of people) {
    if (!person || typeof person !== "object") continue;
    const digits = ticketNumberDigits((person as { ticket_number?: unknown }).ticket_number);
    if (!digits || seen.has(digits)) continue;
    seen.add(digits);
    numbers.push(digits);
  }
  return numbers;
}

/**
 * Nombre de vrais billets.
 * Les numéros des passagers priment. Sinon la liste déjà stockée.
 * Aucun numéro : null (l’appelant garde son autre compte).
 */
export function countRealTickets(people: unknown, stored?: unknown): number | null {
  const fromPeople = realTicketList(people);
  if (fromPeople.length) return fromPeople.length;
  if (!Array.isArray(stored)) return null;
  const seen = new Set<string>();
  for (const value of stored) {
    const digits = ticketNumberDigits(value);
    if (digits) seen.add(digits);
  }
  return seen.size ? seen.size : null;
}

/** « AF/ZLFJIN » : code compagnie à 2 caractères, PNR à 6. */
export function isAirlinePnrPair(left: string, right: string) {
  return /^[A-Z0-9]{2}$/.test(left.toUpperCase()) && /^[A-Z0-9]{6}$/.test(right.toUpperCase());
}

export function compactNameToken(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
}

/** PNR, localisateurs et codes compagnie imprimés sur le reçu. */
export function collectTicketTokens(text: string) {
  const locators = new Set<string>();
  const airlines = new Set<string>();
  const source = text.toUpperCase();
  for (const match of source.matchAll(/\b([A-Z0-9]{2})\/([A-Z0-9]{6})\b/g)) {
    airlines.add(match[1]);
    locators.add(match[2]);
  }
  for (const match of source.matchAll(/R[EÉ]F[EÉ]RENCE DU DOSSIER(?!\s+COMPAGNIE)\s+([A-Z0-9]{5,8})\b/g)) {
    if (!/^\d{8}$/.test(match[1]) && /[A-Z]/.test(match[1])) locators.add(match[1]);
  }
  for (const match of source.matchAll(/\b([A-Z][A-Z0-9])\s+\d{2,4}\b/g)) {
    airlines.add(match[1]);
  }
  return { locators, airlines };
}

/**
 * Passager inventé : prénom ou nom égal à un PNR / localisateur,
 * ou nom qui est le code compagnie à 2 caractères du reçu.
 */
export function passengerIsInvented(
  person: { first_name?: string | null; last_name?: string | null },
  locators: Set<string>,
  airlines: Set<string>
) {
  const first = compactNameToken(person.first_name);
  const last = compactNameToken(person.last_name);
  if (first && locators.has(first)) return true;
  if (last && locators.has(last)) return true;
  if (last && /^[A-Z0-9]{2}$/.test(last) && airlines.has(last)) return true;
  if (first && last && isAirlinePnrPair(last, first) && (locators.has(first) || airlines.has(last))) return true;
  return false;
}

type GuardPerson = { first_name?: string | null; last_name?: string | null; ticket_number?: string | null };

type GuardItem = {
  kind?: string | null;
  confirmation_ref?: string | null;
  details?: Record<string, unknown> | null;
};

type GuardExtract = {
  items?: GuardItem[] | null;
  travelers?: GuardPerson[] | null;
};

function personLabel(person: GuardPerson) {
  return [person.first_name, person.last_name]
    .map((part) => (part || "").trim())
    .filter(Boolean)
    .join(" ");
}

function tokensOf(extract: GuardExtract) {
  const { locators, airlines } = collectTicketTokens(
    (extract.items || [])
      .flatMap((item) => {
        const details = item.details || {};
        return [item.confirmation_ref, details.pnr, details.flight_number, details.airline_iata, details.airline];
      })
      .filter((value): value is string => typeof value === "string")
      .join("\n")
  );
  for (const item of extract.items || []) {
    const details = item.details || {};
    for (const value of [item.confirmation_ref, details.pnr]) {
      const token = compactNameToken(typeof value === "string" ? value : "");
      if (/^[A-Z0-9]{5,8}$/.test(token) && !/^\d{8}$/.test(token) && /[A-Z]/.test(token)) locators.add(token);
    }
    const iata = compactNameToken(typeof details.airline_iata === "string" ? details.airline_iata : "");
    if (/^[A-Z0-9]{2}$/.test(iata)) airlines.add(iata);
    const flight = typeof details.flight_number === "string" ? details.flight_number.toUpperCase() : "";
    const prefix = flight.match(/^([A-Z][A-Z0-9])\b/);
    if (prefix) airlines.add(prefix[1]);
  }
  return { locators, airlines };
}

function hasRealTicket(extract: GuardExtract) {
  for (const item of extract.items || []) {
    if (countRealTickets(item.details?.passengers, item.details?.ticket_numbers) != null) return true;
  }
  return (extract.travelers || []).some((person) => Boolean(ticketNumberDigits(person.ticket_number)));
}

function flightNeedsReview(extract: GuardExtract) {
  return (extract.items || []).some(
    (item) => (item.kind || "") === "flight" && item.details?.needs_review === true
  );
}

/**
 * Rattachement automatique : ne crée pas un voyageur douteux.
 * Un reçu qui a déjà un vrai numéro ne retient que les passagers qui en ont un.
 * Une lecture déjà à vérifier n’ajoute personne. Les noms écartés restent visibles sur la carte.
 */
export function guardAutoFlightTravelers<T extends GuardExtract>(extract: T): {
  extract: T;
  record: { first_name: string; last_name: string }[];
  held: string[];
} {
  const alreadyReview = flightNeedsReview(extract);
  const { locators, airlines } = tokensOf(extract);
  const ticketed = hasRealTicket(extract);
  const ticketedNames = new Set<string>();
  for (const item of extract.items || []) {
    const passengers = item.details?.passengers;
    if (!Array.isArray(passengers)) continue;
    for (const row of passengers) {
      if (!row || typeof row !== "object") continue;
      const person = row as GuardPerson;
      if (!ticketNumberDigits(person.ticket_number)) continue;
      ticketedNames.add(`${compactNameToken(person.first_name)}|${compactNameToken(person.last_name)}`);
    }
  }
  const held: string[] = [];
  const seen = new Set<string>();
  const hold = (person: GuardPerson, reason: string) => {
    const label = personLabel(person);
    if (!label) return;
    const key = `${label.toLocaleLowerCase("fr")}|${reason}`;
    if (seen.has(key)) return;
    seen.add(key);
    held.push(`${label} (${reason})`);
  };
  const namedTicket = (person: GuardPerson) =>
    ticketedNames.has(`${compactNameToken(person.first_name)}|${compactNameToken(person.last_name)}`);
  const keep = (person: GuardPerson) => {
    if (!personLabel(person)) return false;
    if (passengerIsInvented(person, locators, airlines)) {
      hold(person, "référence compagnie");
      return false;
    }
    if (ticketed && !ticketNumberDigits(person.ticket_number) && !namedTicket(person)) {
      hold(person, "billet absent");
      return false;
    }
    return true;
  };
  const items = (extract.items || []).map((item) => {
    const current = item.details?.passengers;
    if ((item.kind || "") !== "flight" || !item.details || !Array.isArray(current)) return item;
    const details = { ...item.details };
    const passengers = current.filter((row) => row && typeof row === "object" && keep(row as GuardPerson));
    details.passengers = passengers;
    const numbers = realTicketList(passengers);
    if (numbers.length) {
      details.ticket_numbers = numbers;
      details.ticket_count = numbers.length;
    } else if (passengers.length) {
      details.ticket_count = passengers.length;
      delete details.ticket_numbers;
    } else {
      delete details.ticket_numbers;
      details.ticket_count = 0;
    }
    return { ...item, details };
  });
  const travelers = (extract.travelers || []).filter((person) => keep(person));
  if (held.length) {
    const reason = heldReason(held);
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if ((item.kind || "") !== "flight") continue;
      const details = { ...(item.details || {}) };
      const current = typeof details.review_reason === "string" ? details.review_reason.trim() : "";
      details.needs_review = true;
      details.review_reason =
        current.includes("n’est pas ajouté") || current.includes("ne sont pas ajoutés")
          ? current
          : current
            ? `${current.replace(/[.!?…]$/, "")}. ${reason}`
            : reason;
      items[index] = { ...item, details };
    }
  }
  const cleaned = { ...extract, items, travelers } as T;
  if (alreadyReview) return { extract: cleaned, record: [], held };
  const record: { first_name: string; last_name: string }[] = [];
  const keys = new Set<string>();
  const push = (person: GuardPerson) => {
    const first = (person.first_name || "").trim();
    const last = (person.last_name || "").trim();
    if (!first && !last) return;
    const key = `${first.toLocaleLowerCase("fr")}|${last.toLocaleLowerCase("fr")}`;
    if (keys.has(key)) return;
    keys.add(key);
    record.push({ first_name: first, last_name: last });
  };
  for (const item of items) {
    if ((item.kind || "") !== "flight") continue;
    const passengers = item.details?.passengers;
    if (!Array.isArray(passengers)) continue;
    for (const row of passengers) {
      if (row && typeof row === "object") push(row as GuardPerson);
    }
  }
  if (!record.length) {
    for (const person of travelers) push(person);
  }
  return { extract: cleaned, record, held };
}

function heldReason(held: string[]) {
  if (held.length > 1) {
    return `${held.join(", ")} ne sont pas ajoutés au séjour.`;
  }
  return `${held[0]} n’est pas ajouté au séjour.`;
}
