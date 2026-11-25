import { phoneSearchDigits } from "./admin-list";
import { attachSearchFold } from "./attach-search";

/** 0 mot entier, 1 préfixe de mot, 2 fragment. Plus petit = plus pertinent. */
export type DirectoryRank = 0 | 1 | 2;

const MAX_TOKENS = 8;

/**
 * Mots de la saisie, sans accent, au moins deux signes.
 * Un numéro (« 06 12 34 ») devient ses chiffres nationaux, un seul mot.
 */
export function directoryTokens(query: string | null | undefined) {
  const raw = (query || "").trim().slice(0, 80);
  if (!raw) return [];
  const phone = phoneSearchDigits(raw);
  if (phone.length >= 4) return [phone];
  const tokens: string[] = [];
  for (const token of attachSearchFold(raw).split(" ")) {
    if (token.length < 2 || tokens.includes(token)) continue;
    tokens.push(token);
    if (tokens.length >= MAX_TOKENS) break;
  }
  return tokens;
}

/** Chiffres d’un numéro, forme stockée et forme nationale (« 06… »). */
export function phoneSearchWords(value: string | null | undefined) {
  const digits = (value || "").replace(/\D/g, "");
  if (digits.length < 4) return "";
  let national = digits;
  if (national.startsWith("0033")) national = national.slice(4);
  if (national.startsWith("33") && national.length >= 11) national = national.slice(2);
  else if (national.startsWith("0")) national = national.slice(1);
  const local = national ? `0${national}` : "";
  return [digits, national, local].filter(Boolean).join(" ");
}

/** Texte replié : minuscules, sans accent, et les formes du téléphone. */
export function directoryBlob(parts: Array<string | null | undefined>) {
  const text = parts.map((part) => (part || "").trim()).filter(Boolean).join(" ");
  const phones = parts.map((part) => phoneSearchWords(part)).filter(Boolean).join(" ");
  return [attachSearchFold(text), attachSearchFold(phones)].filter(Boolean).join(" ");
}

function wordsOf(blob: string) {
  return blob.split(" ").filter(Boolean);
}

/** Rang d’un mot. `null` s’il n’est ni un mot, ni un préfixe, ni un fragment. */
export function tokenRank(blob: string, token: string): DirectoryRank | null {
  if (!token || !blob) return null;
  const words = wordsOf(blob);
  if (words.some((word) => word === token)) return 0;
  if (words.some((word) => word.startsWith(token))) return 1;
  if (blob.includes(token)) return 2;
  return null;
}

/**
 * Tous les mots doivent matcher (ET), dans n’importe quel ordre.
 * Le rang retenu est le moins bon des mots : un fragment ne passe pas devant un mot entier.
 */
export function directoryRank(query: string | null | undefined, blob: string | null | undefined): DirectoryRank | null {
  const tokens = directoryTokens(query);
  if (!tokens.length) return null;
  const hay = attachSearchFold(blob || "");
  let worst: DirectoryRank = 0;
  for (const token of tokens) {
    const rank = tokenRank(hay, token);
    if (rank == null) return null;
    if (rank > worst) worst = rank;
  }
  return worst;
}

export type DirectoryCustomer = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  usage_name?: string | null;
  company_name?: string | null;
  email?: string | null;
  phone?: string | null;
  phone_secondary?: string | null;
  companies?: string[] | null;
  people?: string[] | null;
};

/** Prénom, nom, les deux ordres, nom d’usage, sociétés, e-mail, téléphones, accompagnants. */
export function customerSearchBlob(customer: DirectoryCustomer) {
  const first = customer.first_name || "";
  const last = customer.last_name || "";
  return directoryBlob([
    first,
    last,
    customer.usage_name,
    `${first} ${last}`,
    `${last} ${first}`,
    customer.company_name,
    ...(customer.companies || []),
    ...(customer.people || []),
    customer.email,
    customer.phone,
    customer.phone_secondary,
  ]);
}

export type DirectoryBooking = {
  id: string;
  reference: string | null;
  title: string | null;
  destination: string | null;
  customer?: DirectoryCustomer | null;
  people?: string[] | null;
};

/** Référence, titre, destination, client et voyageurs du dossier. */
export function bookingSearchBlob(booking: DirectoryBooking) {
  return directoryBlob([
    booking.reference,
    booking.title,
    booking.destination,
    booking.customer ? customerSearchBlob(booking.customer) : "",
    ...(booking.people || []),
  ]);
}

export function compareDirectoryRank(a: DirectoryRank | null, b: DirectoryRank | null) {
  return (a ?? 9) - (b ?? 9);
}

/** Le plus pertinent d’abord. À rang égal, l’ordre d’entrée est gardé. Sans mot, la liste ne change pas. */
export function sortByDirectoryRank<T>(rows: T[], query: string, blob: (row: T) => string) {
  if (!directoryTokens(query).length) return rows;
  return rows
    .map((row, index) => ({ row, index, rank: directoryRank(query, blob(row)) }))
    .filter((item): item is { row: T; index: number; rank: DirectoryRank } => item.rank != null)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((item) => item.row);
}

export type DirectoryCompany = {
  customer_id: string;
  company_name: string | null;
  siret?: string | null;
};

export type DirectoryCompanion = {
  id: string;
  customer_id: string;
  first_name: string | null;
  last_name: string | null;
  usage_name?: string | null;
  relationship?: string | null;
};

export type DirectoryTraveler = {
  id: string;
  booking_id: string;
  first_name: string | null;
  last_name: string | null;
  is_account_holder?: boolean | null;
};

export type DirectoryBookingRow = {
  id: string;
  reference: string | null;
  title: string | null;
  destination: string | null;
  customer_id: string | null;
  start_date?: string | null;
  end_date?: string | null;
  archived_at?: string | null;
};

function text(value: string | null | undefined) {
  return (value || "").trim();
}

function personName(first: string | null | undefined, last: string | null | undefined) {
  return [text(first), text(last)].filter(Boolean).join(" ");
}

function companyNames(customer: DirectoryCustomer, companies: DirectoryCompany[]) {
  const names = [customer.company_name, ...companies.map((row) => row.company_name)]
    .map((name) => text(name))
    .filter(Boolean);
  const unique: string[] = [];
  for (const name of names) {
    if (unique.some((item) => attachSearchFold(item) === attachSearchFold(name))) continue;
    unique.push(name);
  }
  return unique;
}

function shownCompany(names: string[], query: string) {
  return names.find((name) => directoryRank(query, directoryBlob([name])) != null) || names[0] || "";
}

/**
 * Clients, dossiers et voyageurs, du plus pertinent au moins pertinent.
 * Le prénom exact (« Amin ») passe devant « Amina » et « Benjamin », même si le nom de famille est plus loin dans l’alphabet.
 */
export function suggestDirectory(
  input: {
    customers: DirectoryCustomer[];
    companies?: DirectoryCompany[];
    companions?: DirectoryCompanion[];
    bookings?: DirectoryBookingRow[];
    travelers?: DirectoryTraveler[];
  },
  query: string,
  limit = 20
) {
  const cap = Math.min(50, Math.max(1, limit));
  const companies = input.companies || [];
  const companions = input.companions || [];
  const travelers = input.travelers || [];
  const bookings = input.bookings || [];
  const companiesOf = new Map<string, DirectoryCompany[]>();
  for (const row of companies) {
    const list = companiesOf.get(row.customer_id) || [];
    list.push(row);
    companiesOf.set(row.customer_id, list);
  }
  const companionsOf = new Map<string, DirectoryCompanion[]>();
  for (const row of companions) {
    const list = companionsOf.get(row.customer_id) || [];
    list.push(row);
    companionsOf.set(row.customer_id, list);
  }
  const customerById = new Map(input.customers.map((row) => [row.id, row]));

  const namedCustomers = [...input.customers].sort(
    (a, b) => text(a.last_name).localeCompare(text(b.last_name), "fr") || text(a.first_name).localeCompare(text(b.first_name), "fr")
  );
  const clients = sortByDirectoryRank(namedCustomers, query, (customer) => {
    const names = companyNames(customer, companiesOf.get(customer.id) || []);
    const people = (companionsOf.get(customer.id) || []).map((person) =>
      personName(person.first_name, person.last_name || person.usage_name)
    );
    return customerSearchBlob({ ...customer, companies: names, people });
  })
    .slice(0, cap)
    .map((customer) => {
      const names = companyNames(customer, companiesOf.get(customer.id) || []);
      const hit = (companiesOf.get(customer.id) || []).find((row) =>
        directoryRank(query, directoryBlob([row.company_name, row.siret])) != null
      );
      return {
        id: customer.id,
        first_name: customer.first_name,
        last_name: customer.last_name,
        company_name: hit?.company_name || shownCompany(names, query),
        siret: hit?.siret || "",
      };
    });

  const datedBookings = [...bookings].sort((a, b) => (b.start_date || "").localeCompare(a.start_date || ""));
  const dossiers = sortByDirectoryRank(datedBookings, query, (booking) => {
    const customer = booking.customer_id ? customerById.get(booking.customer_id) : undefined;
    const people = [
      ...(customer ? (companionsOf.get(customer.id) || []).map((person) => personName(person.first_name, person.last_name)) : []),
      ...travelers
        .filter((person) => person.booking_id === booking.id)
        .map((person) => personName(person.first_name, person.last_name)),
    ];
    const names = customer ? companyNames(customer, companiesOf.get(customer.id) || []) : [];
    return bookingSearchBlob({
      ...booking,
      customer: customer ? { ...customer, companies: names } : null,
      people,
    });
  })
    .slice(0, cap)
    .map((booking) => ({
      id: booking.id,
      reference: booking.reference,
      title: booking.title,
      destination: booking.destination,
      start_date: booking.start_date || null,
      end_date: booking.end_date || null,
      archived_at: booking.archived_at || null,
    }));

  const companionHits = sortByDirectoryRank(companions, query, (person) =>
    customerSearchBlob({
      id: person.id,
      first_name: person.first_name,
      last_name: person.last_name,
      usage_name: person.usage_name,
    })
  ).map((person) => {
    const owner = customerById.get(person.customer_id);
    return {
      id: person.id,
      source: "companion",
      first_name: person.first_name,
      last_name: person.last_name,
      customer_id: person.customer_id,
      booking_id: null,
      reference: null,
      booking_title: null,
      relationship: text(person.relationship),
      context: owner ? personName(owner.first_name, owner.last_name) : "",
      rank: directoryRank(
        query,
        customerSearchBlob({
          id: person.id,
          first_name: person.first_name,
          last_name: person.last_name,
          usage_name: person.usage_name,
        })
      ),
    };
  });

  const companionNames = new Set(
    companions.map((person) => attachSearchFold(personName(person.first_name, person.last_name)))
  );
  const travelerHits = sortByDirectoryRank(
    travelers.filter((person) => {
      if (person.is_account_holder) return false;
      const booking = bookings.find((row) => row.id === person.booking_id);
      const key = attachSearchFold(personName(person.first_name, person.last_name));
      if (!key || companionNames.has(key)) return false;
      return Boolean(booking);
    }),
    query,
    (person) =>
      customerSearchBlob({
        id: person.id,
        first_name: person.first_name,
        last_name: person.last_name,
      })
  ).map((person) => {
    const booking = bookings.find((row) => row.id === person.booking_id);
    return {
      id: person.id,
      source: "traveler",
      first_name: person.first_name,
      last_name: person.last_name,
      customer_id: booking?.customer_id || null,
      booking_id: person.booking_id,
      reference: booking?.reference || null,
      booking_title: text(booking?.title) || text(booking?.destination),
      relationship: "",
      context: booking?.reference || "",
      rank: directoryRank(
        query,
        customerSearchBlob({ id: person.id, first_name: person.first_name, last_name: person.last_name })
      ),
    };
  });

  const voyageurs = [...companionHits, ...travelerHits]
    .sort((a, b) => compareDirectoryRank(a.rank, b.rank) || personName(a.last_name, a.first_name).localeCompare(personName(b.last_name, b.first_name), "fr"))
    .slice(0, cap)
    .map((person) => {
      const { rank, ...rest } = person;
      void rank;
      return rest;
    });

  return { clients, dossiers, voyageurs };
}
