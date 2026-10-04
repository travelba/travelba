/** Affichage saisie : jj/mm/aaaa. Stockage : yyyy-mm-dd. */

/** « 12 oct. 2026 ». Une date seule (10 caractères) est lue à midi local, sans décalage de jour. */
export function formatDateFr(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("fr-FR", { dateStyle: "medium" });
}

/** « 12 oct. 2026 14:30 » ; une date seule retombe sur `formatDateFr`. */
export function formatDateTimeFr(value: string | null | undefined) {
  if (!value) return "";
  if (value.length === 10) return formatDateFr(value);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Décale une date `yyyy-mm-dd` de `days` jours calendaires, en UTC.
 * Indépendant du fuseau du serveur ; accepte un horodatage (seuls les 10 premiers caractères comptent).
 */
export function addIsoDays(iso: string, days: number) {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function isoToFrInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const match = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return iso;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function isValidIsoDate(iso: string): boolean {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function frInputToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const asIso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (asIso) return isValidIsoDate(trimmed) ? trimmed : null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  const iso = `${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
  return isValidIsoDate(iso) ? iso : null;
}

const WEEKDAY_LABELS = ["lu", "ma", "me", "je", "ve", "sa", "di"] as const;

export const FR_MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;

export function weekdayLabels() {
  return WEEKDAY_LABELS;
}

export function calendarMonthLabel(year: number, monthIndex: number) {
  const name = FR_MONTHS[monthIndex] || "";
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

export type CalendarCell = {
  iso: string;
  day: number;
  outside: boolean;
};

/** Grille lundi → dimanche, jours du mois voisin en `outside`. */
export function calendarCells(year: number, monthIndex: number): CalendarCell[] {
  const first = new Date(year, monthIndex, 1);
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(year, monthIndex, 1 - lead);
  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    cells.push({
      iso: `${date.getFullYear()}-${month}-${day}`,
      day: date.getDate(),
      outside: date.getMonth() !== monthIndex,
    });
  }
  return cells;
}

export function shiftMonth(year: number, monthIndex: number, delta: number) {
  const date = new Date(year, monthIndex + delta, 1);
  return { year: date.getFullYear(), monthIndex: date.getMonth() };
}

export function maskFrDate(value: string): string {
  const iso = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return isoToFrInput(value);
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}
