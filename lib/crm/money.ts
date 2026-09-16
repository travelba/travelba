export function formatMoney(amount: number, currency = "EUR") {
  return amount.toLocaleString("fr-FR", {
    style: "currency",
    currency: currency || "EUR",
  });
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
