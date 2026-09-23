export function formatMoney(amount: number, currency = "EUR") {
  return amount.toLocaleString("fr-FR", {
    style: "currency",
    currency: currency || "EUR",
  });
}

/** Frais d’agence prélevés sur chaque versement client (crédits). */
export const AGENCY_FEE_RATE = 0.1;

export function agencyFeeFromGross(gross: number) {
  const n = Number(gross);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * AGENCY_FEE_RATE * 100) / 100;
}

export function netAfterAgencyFee(gross: number) {
  const n = Number(gross);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round((n - agencyFeeFromGross(n)) * 100) / 100;
}

/** Crédit disponible = avoir positif (déjà net des frais d’agence 10 % sur les versements). */
export function creditDisponible(balance: number) {
  const n = Number(balance);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100) / 100;
}

export function formatEncours(amount: number, currency = "EUR") {
  return `Encours ${formatMoney(amount, currency)}`;
}

export function encoursCaption(amount: number) {
  if (!Number.isFinite(amount) || amount === 0) return "Compte à jour";
  if (amount < 0) return "Reste à régler";
  return "Avoir";
}

export function formatCreditDisponible(balance: number, currency = "EUR") {
  return formatMoney(creditDisponible(balance), currency);
}

export function formatDateFr(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("fr-FR", { dateStyle: "medium" });
}

export function formatDateTimeFr(value: string | null | undefined) {
  if (!value) return "";
  if (value.length === 10) return formatDateFr(value);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function isoDateInDays(days: number) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

export function isUpcomingBooking(endDate: string | null) {
  if (!endDate) return true;
  return endDate >= todayIsoDate();
}

export function daysUntil(date: string | null | undefined) {
  if (!date) return null;
  const d = parseFrDate(date);
  if (!d) return null;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

export function jMinusLabel(date: string | null | undefined) {
  const n = daysUntil(date);
  if (n == null || n < 0) return null;
  if (n === 0) return "Aujourd’hui";
  return `J - ${n}`;
}

export function postedLedgerTotals(
  rows: { direction: "debit" | "credit"; amount: number | string }[]
) {
  let credits = 0;
  let debits = 0;
  for (const row of rows) {
    const n = Number(row.amount);
    if (!Number.isFinite(n)) continue;
    if (row.direction === "credit") credits += n;
    else debits += n;
  }
  const settledPct = debits > 0 ? Math.min(100, Math.round((credits / debits) * 100)) : null;
  return { credits, debits, settledPct };
}

function parseFrDate(value: string) {
  const d = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function tripDurationDays(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  const a = parseFrDate(start);
  const b = parseFrDate(end);
  if (!a || !b) return null;
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1);
}

export function formatDateRangeShort(start?: string | null, end?: string | null) {
  if (!start && !end) return "Dates à confirmer";
  const a = start ? parseFrDate(start) : null;
  const b = end ? parseFrDate(end) : null;
  if (!a && !b) return "Dates à confirmer";
  if (a && b) {
    const sameMonth =
      a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
    const month = b.toLocaleDateString("fr-FR", { month: "long" });
    const year = b.getFullYear();
    if (sameMonth) {
      return `${a.getDate()} — ${b.getDate()} ${capitalize(month)} ${year}`;
    }
    const monthA = a.toLocaleDateString("fr-FR", { month: "long" });
    return `${a.getDate()} ${capitalize(monthA)} — ${b.getDate()} ${capitalize(month)} ${year}`;
  }
  return formatDateFr(start || end);
}

export function formatMonthYear(value?: string | null) {
  const d = value ? parseFrDate(value) : null;
  if (!d) return "";
  return capitalize(d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }));
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Garde chiffres, espaces, un seul séparateur décimal (virgule) et les points de milliers. */
export function maskMoneyTyping(raw: string) {
  let s = raw.replace(/[^\d,.\s\u00a0\u202f]/g, "");
  const comma = s.indexOf(",");
  if (comma === -1) return s;
  const head = s.slice(0, comma + 1);
  const tail = s.slice(comma + 1).replace(/[^\d]/g, "").slice(0, 2);
  return head + tail;
}

/** Accepte 1234,50 · 1234.50 · 1 234,50 · 1.234,56. Vide → null. */
export function parseMoney(raw: string | number | null | undefined): number | null {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    return Math.round(raw * 100) / 100;
  }
  if (raw == null) return null;
  let s = String(raw).trim().replace(/[\s\u00a0\u202f]/g, "");
  if (!s) return null;
  s = s.replace(/[^\d,.]/g, "");
  if (!s || s === "," || s === ".") return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    s = s.replace(",", ".");
  } else if (lastDot >= 0) {
    const groups = s.split(".");
    const last = groups[groups.length - 1] ?? "";
    if (groups.length > 2 || last.length === 3) s = groups.join("");
  }
  if (s.startsWith(".")) s = `0${s}`;
  if (s.endsWith(".")) s = s.slice(0, -1);
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

export function moneyToInput(value: number | string | null | undefined) {
  const n = parseMoney(value);
  if (n == null) return "";
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
