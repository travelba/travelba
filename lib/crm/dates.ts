/** Affichage saisie : jj/mm/aaaa. Stockage : yyyy-mm-dd. */

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

export function maskFrDate(value: string): string {
  const iso = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return isoToFrInput(value);
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}
