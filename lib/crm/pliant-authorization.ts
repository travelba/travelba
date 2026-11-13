import { formatDateFr } from "./dates";
import { normalizeMatchText } from "./revolut-match";

/**
 * Une autorisation confirmée et le débit qui la règle restent à quelques jours l’un de l’autre.
 * Sept jours couvre un week-end sans rapprocher deux achats distincts du même commerçant.
 */
export const PLIANT_AUTH_COVER_DAYS = 7;

const OUTGOING = new Set(["PURCHASE", "CASH_WITHDRAWAL"]);
const INCOMING = new Set(["REFUND", "CHARGEBACK"]);

/** Refus et annulation : jamais une sortie à rattacher. */
export function pliantStatusBlocksAttach(status: string | null | undefined) {
  const code = (status || "").toUpperCase();
  return code === "DECLINED" || code === "REVERSED";
}

export type PliantCoverSpend = {
  id: string;
  status: string | null;
  type?: string | null;
  merchant: string | null;
  /** Centimes de facturation Pliant (un achat est souvent négatif). */
  billingCents: number | null;
  currency?: string | null;
  /** Jour de l’autorisation (CONFIRMED) ou du débit (BOOKED). */
  occurredOn: string | null;
  cardId?: string | null;
  /** Dossiers de la carte, et le dossier déjà rattaché s’il y en a un. */
  bookingIds: string[];
};

export type AuthorizationCover = {
  debitId: string;
  /** « Couverte par le débit du 12 nov. 2026 ». */
  note: string;
};

export function pliantCoverNote(occurredOn: string | null | undefined) {
  const day = (occurredOn || "").slice(0, 10);
  return day ? `Couverte par le débit du ${formatDateFr(day)}` : "Couverte par le débit";
}

function dayNumber(value: string | null | undefined) {
  const day = (value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const time = Date.parse(`${day}T12:00:00Z`);
  return Number.isNaN(time) ? null : Math.round(time / 86400000);
}

function centsOf(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  const cents = Math.abs(Math.round(value));
  return cents > 0 ? cents : null;
}

function currencyOf(value: string | null | undefined) {
  const code = (value || "EUR").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : "EUR";
}

function sameFlow(left: string | null | undefined, right: string | null | undefined) {
  const a = (left || "").toUpperCase();
  const b = (right || "").toUpperCase();
  if (OUTGOING.has(a) && OUTGOING.has(b)) return true;
  if (INCOMING.has(a) && INCOMING.has(b)) return true;
  return false;
}

function sameScope(auth: PliantCoverSpend, debit: PliantCoverSpend) {
  if (auth.cardId && debit.cardId && auth.cardId === debit.cardId) return true;
  const bookings = new Set(auth.bookingIds.filter(Boolean));
  return debit.bookingIds.some((id) => bookings.has(id));
}

function debitCovers(auth: PliantCoverSpend, debit: PliantCoverSpend) {
  if ((debit.status || "").toUpperCase() !== "BOOKED") return false;
  if (auth.id === debit.id) return false;
  if (!sameFlow(auth.type, debit.type)) return false;
  const merchant = normalizeMatchText(auth.merchant);
  if (!merchant || merchant !== normalizeMatchText(debit.merchant)) return false;
  const amount = centsOf(auth.billingCents);
  if (amount == null || amount !== centsOf(debit.billingCents)) return false;
  if (currencyOf(auth.currency) !== currencyOf(debit.currency)) return false;
  const authDay = dayNumber(auth.occurredOn);
  const debitDay = dayNumber(debit.occurredOn);
  if (authDay == null || debitDay == null) return false;
  if (Math.abs(authDay - debitDay) > PLIANT_AUTH_COVER_DAYS) return false;
  return sameScope(auth, debit);
}

/**
 * Une autorisation CONFIRMED est couverte dès qu’un débit BOOKED existe :
 * même commerçant, même montant, à quelques jours, même dossier ou carte de ce dossier.
 * Le débit déjà rattaché compte. Rien n’est écrit.
 */
export function coverPliantAuthorizations(rows: PliantCoverSpend[]): Map<string, AuthorizationCover> {
  const debits = new Map<string, PliantCoverSpend>();
  for (const row of rows) {
    if ((row.status || "").toUpperCase() !== "BOOKED") continue;
    const prev = debits.get(row.id);
    if (!prev) {
      debits.set(row.id, { ...row, bookingIds: [...row.bookingIds] });
      continue;
    }
    const bookingIds = [...new Set([...prev.bookingIds, ...row.bookingIds])];
    debits.set(row.id, { ...prev, bookingIds, cardId: prev.cardId || row.cardId || null });
  }
  const found = new Map<string, AuthorizationCover>();
  for (const auth of rows) {
    if ((auth.status || "").toUpperCase() !== "CONFIRMED" || found.has(auth.id)) continue;
    let best: { debit: PliantCoverSpend; distance: number } | null = null;
    for (const debit of debits.values()) {
      if (!debitCovers(auth, debit)) continue;
      const distance = Math.abs((dayNumber(auth.occurredOn) || 0) - (dayNumber(debit.occurredOn) || 0));
      if (!best || distance < best.distance || (distance === best.distance && debit.id < best.debit.id)) {
        best = { debit, distance };
      }
    }
    if (!best) continue;
    found.set(auth.id, { debitId: best.debit.id, note: pliantCoverNote(best.debit.occurredOn) });
  }
  return found;
}

/**
 * La file générale garde l’autorisation couverte, avec la mention.
 * La liste d’un dossier la retire. Les suggestions ne sont pas recopiées : rien n’est proposé à rattacher.
 */
export function splitCoveredAuthorizations<T extends { id: string; suggestions: unknown[] }>(
  lines: T[],
  covers: Map<string, AuthorizationCover>
): { open: T[]; covered: (T & { coveredNote: string })[] } {
  const open: T[] = [];
  const covered: (T & { coveredNote: string })[] = [];
  for (const line of lines) {
    const cover = covers.get(line.id);
    if (!cover) {
      open.push(line);
      continue;
    }
    covered.push({ ...line, suggestions: [], coveredNote: cover.note });
  }
  return { open, covered };
}
