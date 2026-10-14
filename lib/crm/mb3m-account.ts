import { mb3mActivityId, mb3mConfigured, mb3mRealm } from "@/lib/crm/mb3m";
import { isAutoTicketingExpense } from "@/lib/crm/ticketing-fee";

/** Facture MB3M ouverte par compte. Le grand livre reste la source des montants. */

export type Mb3mAccountCompany = {
  id: string;
  funding?: string | null;
};

export type Mb3mLedgerRow = {
  id: string;
  direction: "credit" | "debit" | string;
  status?: string | null;
  currency?: string | null;
  amount: number | string;
  label?: string | null;
  billing_company_id?: string | null;
  occurred_on?: string | null;
  external_id?: string | null;
  booking_id?: string | null;
  /** Nature déjà résolue (carte, frais, séjour). */
  chargeKind?: string | null;
};

export type Mb3mAccountLine = {
  transactionId: string;
  label: string;
  amount: number;
  activityId: number | null;
  /** Marge : vente − coûts rattachés. Sans coût pointé, la vente entière. */
  margin?: number | null;
  /** Fournisseurs des coûts, pour la note de la ligne. */
  note?: string | null;
};

/** Marge et fournisseurs par transaction, calculés par la comptabilité du voyage. */
export type Mb3mMarginMap = Map<string, { margin: number; suppliers: string[] }>;

export function mb3mLineNote(suppliers: string[]) {
  const names = [...new Set(suppliers.map((name) => name.trim()).filter(Boolean))];
  return names.length ? `Fournisseur : ${names.join(", ")}` : null;
}

/**
 * Activités du fichier agence.
 * Le 3 de la base de test n’est pas l’assurance.
 * Maritime (9) et Low Cost (27) n’ont pas de type Travelba : on ne les devine pas.
 * Frais généraux (14) est une activité de charges : la base agence refuse une ligne de facture
 * dessus (-504, « Nullable object must have a value » sur la facture entière). Les frais d’agence
 * partent en Divers Terrestre.
 */
const AGENCY_ACTIVITY: Record<string, number> = {
  flight: 2,
  insurance: 3,
  rail: 5,
  hotel: 7,
  car: 8,
  package: 11,
  fee: 22,
  cruise: 20,
  transfer: 22,
  activity: 22,
  chauffeur: 22,
  greeter: 22,
  visa: 22,
  checkin: 22,
  expense: 22,
};

/** Tour opérateur : la ligne unique du bouton dossier, et le montant global du séjour. */
export const MB3M_ACTIVITY_PACKAGE = 11;

export function mb3mAgencyActivityId(kind: string | null | undefined) {
  if (!kind || kind === "package" || kind === "stay") return MB3M_ACTIVITY_PACKAGE;
  return AGENCY_ACTIVITY[kind] ?? 22;
}

/** La base de test envoie toujours son activité unique. La production suit le fichier agence. */
export function mb3mLineActivityId(kind: string | null | undefined) {
  if (mb3mRealm() === "production") return mb3mAgencyActivityId(kind);
  return mb3mActivityId();
}

/** Ancienne ligne unique du bouton. La facture de dossier envoie une activité par dépense. */
export function mb3mDossierActivityId() {
  if (mb3mRealm() === "production") return MB3M_ACTIVITY_PACKAGE;
  return mb3mActivityId();
}

const ITEM_ID = /:(?:item|expense):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function withChargeKinds(
  rows: Mb3mLedgerRow[],
  items: { id?: string | null; kind?: string | null; details?: Record<string, unknown> | null }[]
) {
  const byId = new Map(items.flatMap((item) => (item.id ? [[item.id, item] as const] : [])));
  return rows.map((row) => {
    const item = byId.get(row.external_id?.match(ITEM_ID)?.[1] || "");
    return {
      ...row,
      chargeKind:
        row.chargeKind ||
        mb3mChargeKind({
          external_id: row.external_id,
          booking_id: row.booking_id,
          itemKind: item?.kind,
          ticketing: item ? isAutoTicketingExpense(item) : false,
        }),
    };
  });
}

/** Dépenses postées du dossier, avec l’activité de chaque ligne. */
export function mb3mDossierLines(
  rows: Mb3mLedgerRow[],
  items: { id?: string | null; kind?: string | null; details?: Record<string, unknown> | null }[],
  margins?: Mb3mMarginMap | null
) {
  return mb3mAccountLines(withChargeKinds(rows, items), null, false, margins);
}

export function mb3mChargeKind(row: {
  external_id?: string | null;
  booking_id?: string | null;
  itemKind?: string | null;
  ticketing?: boolean;
}) {
  const external = row.external_id || "";
  if (external.endsWith(":agency-commission") || external.endsWith(":ticketing-fee") || row.ticketing) return "fee";
  if (row.itemKind) return row.itemKind;
  if (row.booking_id) return "package";
  return "fee";
}

export type Mb3mAccountBucket = {
  companyId: string | null;
};

const OPEN_NONE = "00000000-0000-0000-0000-000000000000";

/** Vide : personne. Cette liste est le client pilote. */
export function mb3mAccountSyncAllowed(customerId: string) {
  if (!mb3mConfigured()) return false;
  if (mb3mRealm() !== "production" && !mb3mActivityId()) return false;
  const allow = (process.env.MB3M_SYNC_CUSTOMER_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return allow.includes(customerId);
}

export function mb3mAccountsSplit(companies: Mb3mAccountCompany[]) {
  const kinds = new Set(companies.map((company) => company.funding).filter((kind) => kind === "advance" || kind === "pro"));
  return kinds.has("advance") && kinds.has("pro");
}

export function mb3mOpenAccountKey(customerId: string, companyId: string | null) {
  return `${customerId}:${companyId || OPEN_NONE}`;
}

function euros(row: Mb3mLedgerRow) {
  const currency = (row.currency || "EUR").trim().toUpperCase();
  return !currency || currency === "EUR";
}

function posted(row: Mb3mLedgerRow) {
  return !row.status || row.status === "posted";
}

export function rowInMb3mAccount(row: Mb3mLedgerRow, companyId: string | null, split: boolean) {
  if (!split) return true;
  return (row.billing_company_id || null) === companyId;
}

export function mb3mAccountBuckets(companies: Mb3mAccountCompany[], rows: Mb3mLedgerRow[]): Mb3mAccountBucket[] {
  if (!mb3mAccountsSplit(companies)) return [{ companyId: null }];
  const ids = new Set<string | null>();
  for (const row of rows) {
    if (!posted(row) || !euros(row)) continue;
    ids.add(row.billing_company_id || null);
  }
  if (!ids.size) return [];
  return [...ids].map((companyId) => ({ companyId }));
}

/** Toutes les dépenses en euros déjà postées, y compris les plus anciennes. */
export function mb3mAccountLines(
  rows: Mb3mLedgerRow[],
  companyId: string | null,
  split: boolean,
  margins?: Mb3mMarginMap | null
): Mb3mAccountLine[] {
  return rows
    .filter((row) => posted(row) && euros(row) && row.direction === "debit" && rowInMb3mAccount(row, companyId, split))
    .map((row) => {
      const hit = margins?.get(row.id);
      const amount = Math.round(Number(row.amount) * 100) / 100;
      return {
        transactionId: row.id,
        label: (row.label || "").trim().slice(0, 120) || "Dépense",
        amount,
        activityId: mb3mLineActivityId(row.chargeKind ?? mb3mChargeKind(row)),
        // Chaque ligne porte sa marge : vente − coûts pointés. Sans coût, la marge est la vente,
        // comme MB3M le calcule lui-même pour une ligne sans achat. Rattacher un coût la fait baisser.
        margin: hit ? Math.round(hit.margin * 100) / 100 : amount,
        note: hit ? mb3mLineNote(hit.suppliers) : null,
      };
    })
    .filter((line) => line.transactionId && line.amount > 0)
    .sort((left, right) => left.transactionId.localeCompare(right.transactionId));
}

export function mb3mAccountBalance(rows: Mb3mLedgerRow[], companyId: string | null, split: boolean) {
  return rows.reduce((sum, row) => {
    if (!posted(row) || !euros(row) || !rowInMb3mAccount(row, companyId, split)) return sum;
    const amount = Number(row.amount);
    if (!Number.isFinite(amount)) return sum;
    return sum + (row.direction === "credit" ? amount : -amount);
  }, 0);
}

/** La marge entre dans la signature : un coût rattaché remplace une pro forma non imprimée. */
export function mb3mLineSignature(lines: Mb3mAccountLine[]) {
  return lines
    .map((line) => {
      const base = `${line.transactionId}:${line.amount.toFixed(2)}:${line.label}:${line.activityId ?? ""}`;
      return line.margin == null ? base : `${base}:m${line.margin.toFixed(2)}`;
    })
    .join("|");
}

/** Une pièce imprimée dont les lignes (marge comprise) ne correspondent plus : « Marge à corriger ». */
export function mb3mPieceStale(piece: { transactionIds: string[]; signature: string | null }, lines: Mb3mAccountLine[]) {
  if (!piece.signature || !piece.transactionIds.length) return false;
  const ids = new Set(piece.transactionIds);
  const current = lines.filter((line) => ids.has(line.transactionId));
  if (current.length !== piece.transactionIds.length) return false;
  return mb3mLineSignature(current) !== piece.signature;
}

/** Tant que la facture n’est pas émise, un écart de lignes la remplace. Une liste vide l’annule. */
export function mb3mInvoiceAction(current: Mb3mAccountLine[] | null, next: Mb3mAccountLine[]) {
  if (!current) return next.length ? ("create" as const) : ("keep" as const);
  if (!next.length) return "clear" as const;
  if (mb3mLineSignature(current) === mb3mLineSignature(next)) return "keep" as const;
  return "replace" as const;
}

export function mb3mFactureMention(number: string, issued: boolean) {
  const piece = number.trim();
  if (issued) return { text: `Facture MB3M n° ${piece}`, openPdf: true };
  return { text: `Comptabilisé dans MB3M · Facture n° ${piece}`, openPdf: false };
}

export function mb3mFactureHref(path: string, number: string) {
  const name = encodeURIComponent(`Facture MB3M n° ${number.trim()}.pdf`);
  return `/api/files?path=${encodeURIComponent(path)}&inline=1&name=${name}`;
}

export function mb3mProformaHref(bookingId: string) {
  return `/api/admin/bookings/${bookingId}/mb3m`;
}

export function mb3mStaySpan(rows: Mb3mLedgerRow[], companyId: string | null, split: boolean) {
  const days = rows
    .filter((row) => posted(row) && row.direction === "debit" && rowInMb3mAccount(row, companyId, split))
    .map((row) => (row.occurred_on || "").slice(0, 10))
    .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day))
    .sort();
  const today = new Date().toISOString().slice(0, 10);
  const start = days[0] || today;
  const end = days.at(-1) || start;
  return { start, end: end < start ? start : end };
}
