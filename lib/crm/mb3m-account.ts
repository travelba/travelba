import { MB3M_ACTIVITY, mb3mChooseActivity, type Mb3mFeeCode } from "@/lib/crm/mb3m-conform";
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
  /** Marge : vente − coûts rattachés. Sans coût pointé, la vente entière. Nulle sur un frais d’agence. */
  margin?: number | null;
  /** Fournisseurs des coûts, pour la note de la ligne. */
  note?: string | null;
  itemId?: string | null;
  chargeKind?: string | null;
  providerId?: string | null;
  providerName?: string | null;
  refPiece?: string | null;
  /** Billets à 10 chiffres, une ligne SOAP par passager quand la billetterie part. */
  ticketRefs?: string[];
  refCommand?: string | null;
  fareScope?: "france" | "international" | null;
  /** 401 billetterie, 12 hôtel, 13 tourisme, 4 remise. */
  customCode?: Mb3mFeeCode | null;
  agencyProvider?: boolean;
  /** Vol 2, 1001 ou 27 : pas envoyé tant que l’API n’accepte pas CommissionId. */
  held?: boolean;
  supplierReason?: string | null;
  /** Montant global du séjour : hors pièce dès qu’une prestation est détaillée. */
  rollup?: boolean;
};

/**
 * Marge et fournisseurs par transaction, calculés par la comptabilité du voyage.
 * Le mode de règlement des coûts (carte Pliant, virement Revolut) reste dans le CRM : tout texte
 * envoyé à MB3M (Note de ligne, RefPiece, Notes de pièce) s’imprime sur la facture du client.
 */
export type Mb3mMarginMap = Map<string, { margin: number; suppliers: string[] }>;

export function mb3mLineNote(suppliers: string[]) {
  const names = [...new Set(suppliers.map((name) => name.trim()).filter(Boolean))];
  return names.length ? `Fournisseur : ${names.join(", ")}` : null;
}

/**
 * Activités du fichier agence (12/11/2026).
 * 2 aérien (Amadeus), 1001 achat direct, 27 low cost, 5 train, 7 hôtel, 22 terrestre.
 * Les frais d’agence ne sont pas une activité : ligne Custom. Les frais généraux (14) ne partent jamais.
 * Il n’y a pas d’activité « Prestation complémentaire » ni « Interface GDS ».
 */

export const MB3M_ACTIVITY_TICKETING = MB3M_ACTIVITY.air;
export const MB3M_ACTIVITY_DIRECT = MB3M_ACTIVITY.directTicket;
export const MB3M_ACTIVITY_RAIL = MB3M_ACTIVITY.rail;
export const MB3M_ACTIVITY_LOW_COST = MB3M_ACTIVITY.lowCost;
export const MB3M_ACTIVITY_STANDARD = MB3M_ACTIVITY.land;
export const MB3M_ACTIVITY_PACKAGE = MB3M_ACTIVITY.tourOperator;

export function mb3mAgencyActivityId(kind: string | null | undefined) {
  if (!kind || kind === "package" || kind === "stay") return MB3M_ACTIVITY_PACKAGE;
  return mb3mChooseActivity({ kind });
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

const ITEM_ID = /:(?:item|expense):([^:\s]+)$/i;

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
      const chargeKind = row.chargeKind ?? mb3mChargeKind(row);
      return {
        transactionId: row.id,
        label: (row.label || "").trim().slice(0, 120) || "Dépense",
        amount,
        activityId: mb3mLineActivityId(chargeKind),
        itemId: row.external_id?.match(ITEM_ID)?.[1] || null,
        chargeKind,
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
/**
 * Signature des lignes telles qu’elles partent vers MB3M. Avec une marge, le net envoyé
 * (vente − marge) en fait partie : une pièce ouverte émise sous l’ancien découpage est remplacée.
 */
export function mb3mLineSignature(lines: Mb3mAccountLine[]) {
  return lines
    .map((line) => {
      const base = `${line.transactionId}:${line.amount.toFixed(2)}:${line.label}:${line.activityId ?? ""}`;
      if (line.margin == null) return base;
      const net = Math.round((line.amount - line.margin) * 100) / 100;
      return `${base}:n${net.toFixed(2)}:m${line.margin.toFixed(2)}`;
    })
    .join("|");
}

/** Une pièce imprimée dont les lignes (marge comprise) ne correspondent plus : « Marge à corriger ». */
export function mb3mPieceStale(piece: { transactionIds: string[]; signature: string | null }, lines: Mb3mAccountLine[]) {
  if (!piece.signature || !piece.transactionIds.length) return false;
  const held = new Set(lines.filter((line) => line.held).map((line) => line.transactionId));
  if (piece.transactionIds.some((id) => held.has(id))) return false;
  const ids = new Set(piece.transactionIds);
  const current = lines.filter((line) => ids.has(line.transactionId));
  if (current.length !== piece.transactionIds.length) return false;
  // Les signatures du 15/10/2026 portaient le règlement derrière « :§ » ; il ne compte plus.
  return mb3mLineSignature(current) !== piece.signature.replace(/:§[^|]*/g, "");
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

/**
 * Lien sous une ligne du grand livre. Une facture Amadeus n’apparaît que si elle est émise,
 * avec le PDF. Une pro forma CRM reste visible pour l’agence.
 */
export function mb3mLedgerMention(input: {
  kind: string | null;
  number: string;
  printed: boolean;
  preview: boolean;
  href: string | null;
  bookingId: string | null;
}): { text: string; href: string | null } | null {
  const number = input.number.trim();
  if (!number) return null;
  const gds = input.kind === "gds";
  if (gds && !input.printed) return null;
  if (!input.printed && !input.preview) return null;
  if (input.printed) {
    return { text: gds ? `Facture n° ${number}` : mb3mFactureMention(number, true).text, href: input.href };
  }
  return { text: `Facture pro forma n° ${number}`, href: input.bookingId ? mb3mProformaHref(input.bookingId) : null };
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
