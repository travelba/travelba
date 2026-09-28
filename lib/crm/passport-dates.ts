/** Délivrance toujours avant expiration. La MRZ ne porte que l'expiration. */

function utcDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toIso(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function shiftYears(iso: string, years: number) {
  const date = utcDate(iso);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return toIso(date);
}

export function shiftDays(iso: string, days: number) {
  const date = utcDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}

/** Passeport français : expiration = veille du 5e (mineur) ou du 10e (majeur) anniversaire. */
export function frenchExpiry(issued: string, years: 5 | 10) {
  return shiftDays(shiftYears(issued, years), -1);
}

/** Même jour, 5 ou 10 ans plus tard (Suisse et d'autres). */
export function anniversaryExpiry(issued: string, years: 5 | 10) {
  return shiftYears(issued, years);
}

export function expiryMatchesIssue(issued: string, expires: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issued) || !/^\d{4}-\d{2}-\d{2}$/.test(expires)) return false;
  if (issued >= expires) return false;
  return (
    frenchExpiry(issued, 10) === expires ||
    frenchExpiry(issued, 5) === expires ||
    anniversaryExpiry(issued, 10) === expires ||
    anniversaryExpiry(issued, 5) === expires
  );
}

function uniqueDates(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const dates: string[] = [];
  for (const value of values) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || seen.has(value)) continue;
    seen.add(value);
    dates.push(value);
  }
  return dates;
}

function validIso(day: string, month: string, year: string) {
  const dd = Number(day);
  const mm = Number(month);
  const yyyy = Number(year);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || yyyy < 1900 || yyyy > 2100) return null;
  const iso = `${year}-${month}-${day}`;
  const check = utcDate(iso);
  if (check.getUTCFullYear() !== yyyy || check.getUTCMonth() + 1 !== mm || check.getUTCDate() !== dd) {
    return null;
  }
  return iso;
}

/** Dates imprimées DDMMYYYY, DD/MM/YYYY ou DD MM YYYY. Pas les YYMMDD de la MRZ. */
export function visualDatesFromOcr(text: string) {
  const dates: string[] = [];
  const patterns = [
    /(?<!\d)(\d{2})(\d{2})(\d{4})(?!\d)/g,
    /(?<!\d)(\d{2})[./\-\s](\d{2})[./\-\s](\d{4})(?!\d)/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const iso = validIso(match[1], match[2], match[3]);
      if (iso) dates.push(iso);
    }
  }
  return uniqueDates(dates);
}

function bestValidityPair(pool: string[]) {
  let best: { issued_on: string; expires_on: string } | null = null;
  for (const expires of pool) {
    for (const issued of pool) {
      if (!expiryMatchesIssue(issued, expires)) continue;
      if (!best || expires > best.expires_on || (expires === best.expires_on && issued > best.issued_on)) {
        best = { issued_on: issued, expires_on: expires };
      }
    }
  }
  return best;
}

/**
 * Remet délivrance et expiration dans le bon sens.
 * L'expiration MRZ gagne. Sinon, le couple qui tombe sur 5 ou 10 ans
 * (veille d'anniversaire, ou même jour).
 */
export function reconcilePassportDates(input: {
  issued: string | null;
  expires: string | null;
  mrzExpires?: string | null;
  extra?: string[] | null;
}) {
  const extra = input.extra || [];
  const mrzExpires = input.mrzExpires && /^\d{4}-\d{2}-\d{2}$/.test(input.mrzExpires) ? input.mrzExpires : null;
  const pool = uniqueDates([input.issued, input.expires, ...extra]);

  if (mrzExpires) {
    const candidates = pool.filter((date) => date !== mrzExpires && date < mrzExpires);
    const matched = candidates.filter((date) => expiryMatchesIssue(date, mrzExpires));
    if (matched.length) {
      return { issued_on: matched.sort().at(-1) || null, expires_on: mrzExpires };
    }
    const labeled = input.issued && input.issued < mrzExpires ? input.issued : null;
    const latest = candidates.sort().at(-1) || null;
    return { issued_on: labeled || latest, expires_on: mrzExpires };
  }

  const pair = bestValidityPair(pool);
  if (pair) {
    const own = new Set(uniqueDates([input.issued, input.expires]));
    if (!own.size || own.has(pair.issued_on) || own.has(pair.expires_on)) return pair;
  }

  const issued = input.issued;
  const expires = input.expires;
  if (issued && expires && issued > expires) {
    return { issued_on: expires, expires_on: issued };
  }
  return { issued_on: issued, expires_on: expires };
}
