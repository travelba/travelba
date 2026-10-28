import { isValidIsoDate } from "./dates";
import { parseMoney } from "./money";

/**
 * Commission IATA à recevoir du fournisseur (Little Emperors, Expedia, autre).
 * Il n’y a pas de taux habituel : seul un montant ou un taux imprimé est retenu.
 * Le client ne voit ni cette commission ni la marge.
 */

export const MIN_MARGIN_OF_NET = 0.12;

export const SUPPLIER_COMMISSION_COLUMNS = [
  "commission_attendue",
  "commission_taux",
  "commission_date_prevue",
  "commission_recue",
  "commission_recue_le",
] as const;

export type SupplierCommissionColumn = (typeof SUPPLIER_COMMISSION_COLUMNS)[number];

export type CommissionKind = "recue" | "attendue" | "aucune";

export type SupplierCommission = {
  attendue: number | null;
  taux: number | null;
  datePrevue: string | null;
  recue: number | null;
  recueLe: string | null;
};

export type CountedCommission = {
  amount: number;
  kind: CommissionKind;
};

export type CommissionColumns = {
  commission_attendue: number | null;
  commission_taux: number | null;
  commission_date_prevue: string | null;
  commission_recue: number | null;
  commission_recue_le: string | null;
};

const DETAIL_KEYS = [
  "commission_attendue",
  "commission_taux",
  "commission_date_prevue",
  "commission_recue",
  "commission_recue_le",
] as const;

/** Aide affichée à l’agence à côté de la commission. */
export const COMMISSION_MARGIN_HELP =
  "La marge minimale est 12 % du net. La commission attendue compte dans ce minimum.";

function round(amount: number) {
  return Math.round(amount * 100) / 100;
}

function moneyOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" || typeof value === "string") {
    const parsed = parseMoney(value);
    if (parsed == null || parsed < 0) return null;
    return parsed;
  }
  return null;
}

/** 0,10 ou 10 ou « 10 % » → 0,10. Au-dessus de 1, le nombre est un pourcentage. */
export function parseCommissionRate(value: unknown): number | null {
  if (value == null || value === "") return null;
  const raw = String(value).trim().replace(/\s/g, "").replace("%", "");
  if (!raw) return null;
  const normalized = raw.replace(",", ".");
  const number = Number(normalized);
  if (!Number.isFinite(number) || number <= 0) return null;
  const rate = number > 1 ? number / 100 : number;
  if (rate <= 0 || rate > 1) return null;
  return Math.round(rate * 10000) / 10000;
}

export function parseIsoDay(value: unknown): string | null {
  if (value == null || value === "") return null;
  const day = String(value).trim().slice(0, 10);
  return isValidIsoDate(day) ? day : null;
}

/** Fin de carte (ou du séjour) + un mois calendaire. Le jour est ramené à la fin du mois. */
export function addIsoMonths(iso: string, months: number) {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  const cursor = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate();
  const clamped = Math.min(day, last);
  return new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), clamped)).toISOString().slice(0, 10);
}

export function defaultCommissionDue(end: string | null | undefined) {
  if (!end) return null;
  const day = end.slice(0, 10);
  if (!isValidIsoDate(day)) return null;
  return addIsoMonths(day, 1);
}

export function readCommission(row: {
  commission_attendue?: unknown;
  commission_taux?: unknown;
  commission_date_prevue?: unknown;
  commission_recue?: unknown;
  commission_recue_le?: unknown;
  details?: Record<string, unknown> | null;
} | null | undefined): SupplierCommission {
  const details = row?.details || {};
  return {
    attendue: moneyOrNull(row?.commission_attendue ?? details.commission_attendue),
    taux: parseCommissionRate(row?.commission_taux ?? details.commission_taux),
    datePrevue: parseIsoDay(row?.commission_date_prevue ?? details.commission_date_prevue),
    recue: moneyOrNull(row?.commission_recue ?? details.commission_recue),
    recueLe: parseIsoDay(row?.commission_recue_le ?? details.commission_recue_le),
  };
}

/** La commission reçue remplace l’attendue dès qu’un montant est saisi, y compris zéro. */
export function countedCommission(input: {
  attendue?: number | null;
  recue?: number | null;
}): CountedCommission {
  if (input.recue != null && Number.isFinite(input.recue)) {
    return { amount: round(Math.max(0, input.recue)), kind: "recue" };
  }
  if (input.attendue != null && Number.isFinite(input.attendue)) {
    return { amount: round(Math.max(0, input.attendue)), kind: "attendue" };
  }
  return { amount: 0, kind: "aucune" };
}

export type CardMargin = {
  direct: number | null;
  commission: number;
  kind: CommissionKind;
  margin: number | null;
  /** Net en euros utilisé pour les 12 %. */
  net: number | null;
  belowMinimum: boolean;
};

/**
 * Marge = vente − achat + commission comptée.
 * Vente et achat doivent être en euros. Sinon la marge directe reste vide, la commission est montrée seule.
 */
export function cardMargin(input: {
  sale: number | null;
  purchase: number | null;
  commission: { attendue?: number | null; recue?: number | null };
}): CardMargin {
  const counted = countedCommission(input.commission);
  const sale = input.sale != null && Number.isFinite(input.sale) ? round(input.sale) : null;
  const purchase = input.purchase != null && Number.isFinite(input.purchase) ? round(input.purchase) : null;
  const direct = sale != null && purchase != null ? round(sale - purchase) : null;
  const margin = direct != null ? round(direct + counted.amount) : null;
  const net = purchase != null && purchase > 0 ? purchase : null;
  const belowMinimum = net != null && margin != null && margin / net + 1e-9 < MIN_MARGIN_OF_NET;
  return { direct, commission: counted.amount, kind: counted.kind, margin, net, belowMinimum };
}

export function formatCommissionRate(rate: number | null) {
  if (rate == null || !Number.isFinite(rate)) return null;
  const percent = Math.round(rate * 10000) / 100;
  const label = Number.isInteger(percent) ? String(percent) : String(percent).replace(".", ",");
  return `${label} %`;
}

/** Montant de commission à partir d’un taux et d’un net en euros. Pas de taux inventé. */
export function commissionFromRate(rate: number | null, netEur: number | null) {
  if (rate == null || netEur == null || !(netEur > 0)) return null;
  return round(netEur * rate);
}

export type CommissionQueueStatus = "attendue" | "en_retard" | "recue";

export function commissionStatus(
  commission: SupplierCommission,
  today: string
): CommissionQueueStatus | null {
  const tracked = commission.attendue != null || commission.taux != null || commission.recue != null;
  if (!tracked) return null;
  if (commission.recue != null) return "recue";
  if (commission.datePrevue && commission.datePrevue < today) return "en_retard";
  return "attendue";
}

const AGENCY_FEE_LINE = /commission\s+d['’]agence|agency\s+commission/i;
const CURRENCY_AMOUNT =
  /(?:€|eur|euros?)\s*(\d{1,7}(?:[ \u00a0.]\d{3})*(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?)|(\d{1,7}(?:[ \u00a0.]\d{3})*(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?)\s*(?:€|eur|euros?)/i;
const DECIMAL_AMOUNT = /(\d{1,7}[.,]\d{2})\b/;
const RATE_AMOUNT = /(\d{1,2}(?:[.,]\d{1,2})?)\s*%/;

function amountOnCommissionLine(line: string) {
  const currency = line.match(CURRENCY_AMOUNT);
  if (currency) return moneyOrNull(currency[1] || currency[2]);
  const decimal = line.match(DECIMAL_AMOUNT);
  if (decimal) return moneyOrNull(decimal[1]);
  if (/r[eé]f|confirmation|booking|n[°o]\b|pnr/i.test(line)) return null;
  const bare = line.match(/commission(?:\s+[^\d%]{1,24})?\s*[:\-]?\s*(\d{1,5})\b/i);
  if (!bare) return null;
  return moneyOrNull(bare[1]);
}

/**
 * Montant ou taux imprimé sur une confirmation. Rien si la ligne est absente.
 * « Commission d’agence » est le frais client, pas la commission fournisseur.
 */
export function readPrintedCommission(text: string): { attendue: number | null; taux: number | null } {
  let attendue: number | null = null;
  let taux: number | null = null;
  for (const raw of text.split(/\n/)) {
    const line = raw.trim();
    if (!/commission/i.test(line) || AGENCY_FEE_LINE.test(line)) continue;
    if (RATE_AMOUNT.test(line)) {
      if (taux == null) taux = parseCommissionRate(line.match(RATE_AMOUNT)?.[1]);
      continue;
    }
    if (attendue == null) attendue = amountOnCommissionLine(line);
  }
  return { attendue, taux };
}

type StampItem = {
  kind: string;
  end_at?: string | null;
  details?: Record<string, unknown> | null;
};

function eurBase(details: Record<string, unknown> | null | undefined) {
  if (!details) return null;
  const currency = typeof details.supplier_currency === "string" ? details.supplier_currency.toUpperCase() : "";
  const documentCurrency = typeof details.document_currency === "string" ? details.document_currency.toUpperCase() : "";
  const netEur = moneyOrNull(details.supplier_net_eur);
  if (netEur != null) return netEur;
  if (!currency || currency === "EUR") {
    const net = moneyOrNull(details.supplier_net);
    if (net != null) return net;
  }
  if (!documentCurrency || documentCurrency === "EUR") return moneyOrNull(details.document_amount);
  return null;
}

/** Pose la commission lue sur l’unique hôtel, ou l’unique carte. Plusieurs cartes : on ne choisit pas. */
export function stampPrintedCommission<T extends StampItem>(items: T[], text: string): T[] {
  const printed = readPrintedCommission(text);
  if (printed.attendue == null && printed.taux == null) return items;
  const hotels = items.filter((item) => item.kind === "hotel");
  const services = items.filter((item) => item.kind !== "fee" && item.kind !== "expense");
  const target = hotels.length === 1 ? hotels[0] : services.length === 1 ? services[0] : null;
  if (!target) return items;
  return items.map((item) => {
    if (item !== target) return item;
    const details = { ...(item.details || {}) };
    if (printed.taux != null && details.commission_taux == null) details.commission_taux = printed.taux;
    const amount =
      printed.attendue ??
      (details.commission_attendue == null ? commissionFromRate(printed.taux, eurBase(details)) : null);
    if (amount != null && details.commission_attendue == null) details.commission_attendue = amount;
    const due = defaultCommissionDue(item.end_at);
    if (due && details.commission_date_prevue == null) details.commission_date_prevue = due;
    return { ...item, details };
  });
}

export function stripCommissionDetails(details: Record<string, unknown>) {
  const next = { ...details };
  for (const key of DETAIL_KEYS) delete next[key];
  return next;
}

/**
 * Sort la commission des détails (le client lit le JSON) et la pose en colonnes.
 * Sans montant ni taux imprimé, les colonnes restent vides.
 */
export function liftCommissionFromDetails(
  details: Record<string, unknown> | null | undefined,
  endAt: string | null | undefined,
  bookingEnd?: string | null
): { present: boolean; details: Record<string, unknown>; columns: CommissionColumns } {
  const source = details || {};
  const present = DETAIL_KEYS.some((key) => source[key] != null && source[key] !== "");
  const taux = parseCommissionRate(source.commission_taux);
  const printed = moneyOrNull(source.commission_attendue);
  const attendue = printed ?? commissionFromRate(taux, eurBase(source));
  const explicitDue = parseIsoDay(source.commission_date_prevue);
  const due =
    explicitDue ||
    (attendue != null || taux != null ? defaultCommissionDue(endAt) || defaultCommissionDue(bookingEnd) : null);
  return {
    present,
    details: stripCommissionDetails(source),
    columns: {
      commission_attendue: attendue,
      commission_taux: taux,
      commission_date_prevue: due,
      commission_recue: moneyOrNull(source.commission_recue),
      commission_recue_le: parseIsoDay(source.commission_recue_le),
    },
  };
}

const WRITE_KEYS = SUPPLIER_COMMISSION_COLUMNS;

export function commissionInputTouched(input: Record<string, unknown>) {
  return WRITE_KEYS.some((key) => Object.prototype.hasOwnProperty.call(input, key));
}

/**
 * Écriture agence ou MCP. Une clé absente ne change rien.
 * Une valeur vide efface. La date prévue se remplit si une commission est posée et qu’aucune date n’est donnée.
 */
export function commissionWritePatch(
  input: Record<string, unknown>,
  endAt: string | null | undefined,
  current?: SupplierCommission | null
): { error: string } | { columns: Partial<CommissionColumns> } | { columns: null } {
  if (!commissionInputTouched(input)) return { columns: null };
  const columns: Partial<CommissionColumns> = {};
  if ("commission_attendue" in input) {
    if (input.commission_attendue == null || input.commission_attendue === "") columns.commission_attendue = null;
    else {
      const amount = moneyOrNull(input.commission_attendue);
      if (amount == null) return { error: "Commission attendue invalide." };
      columns.commission_attendue = amount;
    }
  }
  if ("commission_taux" in input) {
    if (input.commission_taux == null || input.commission_taux === "") columns.commission_taux = null;
    else {
      const rate = parseCommissionRate(input.commission_taux);
      if (rate == null) return { error: "Taux de commission invalide." };
      columns.commission_taux = rate;
    }
  }
  if ("commission_recue" in input) {
    if (input.commission_recue == null || input.commission_recue === "") columns.commission_recue = null;
    else {
      const amount = moneyOrNull(input.commission_recue);
      if (amount == null) return { error: "Commission reçue invalide." };
      columns.commission_recue = amount;
    }
  }
  if ("commission_date_prevue" in input) {
    if (input.commission_date_prevue == null || input.commission_date_prevue === "") columns.commission_date_prevue = null;
    else {
      const day = parseIsoDay(input.commission_date_prevue);
      if (!day) return { error: "Date de commission prévue invalide." };
      columns.commission_date_prevue = day;
    }
  }
  if ("commission_recue_le" in input) {
    if (input.commission_recue_le == null || input.commission_recue_le === "") columns.commission_recue_le = null;
    else {
      const day = parseIsoDay(input.commission_recue_le);
      if (!day) return { error: "Date de commission reçue invalide." };
      columns.commission_recue_le = day;
    }
  }
  const attendue = "commission_attendue" in columns ? columns.commission_attendue : current?.attendue ?? null;
  const taux = "commission_taux" in columns ? columns.commission_taux : current?.taux ?? null;
  const hasExpectation = attendue != null || taux != null;
  if (hasExpectation && !("commission_date_prevue" in input) && !current?.datePrevue) {
    const due = defaultCommissionDue(endAt);
    if (due) columns.commission_date_prevue = due;
  }
  return { columns };
}

/** Retire la commission d’une carte avant de l’envoyer au navigateur du client. */
export function toClientBookingItem<T extends { details?: Record<string, unknown> | null }>(item: T): T {
  const next = { ...item } as T & Record<string, unknown>;
  for (const key of SUPPLIER_COMMISSION_COLUMNS) delete next[key];
  if (next.details && typeof next.details === "object") {
    next.details = stripCommissionDetails(next.details);
  }
  return next as T;
}

/** Colonnes à écrire, et détails sans commission. Les clés du corps gagnent sur le JSON. */
export function commissionForCardWrite(
  body: Record<string, unknown>,
  details: Record<string, unknown>,
  endAt: string | null | undefined,
  current?: SupplierCommission | null
): { error: string } | { details: Record<string, unknown>; columns: Partial<CommissionColumns> } {
  const lifted = liftCommissionFromDetails(details, endAt);
  const written = commissionWritePatch(body, endAt, current);
  if ("error" in written) return written;
  return {
    details: stripCommissionDetails(lifted.details),
    columns: { ...(lifted.present ? lifted.columns : {}), ...(written.columns || {}) },
  };
}

export function commissionMcpFields(item: {
  commission_attendue?: unknown;
  commission_taux?: unknown;
  commission_date_prevue?: unknown;
  commission_recue?: unknown;
  commission_recue_le?: unknown;
  details?: Record<string, unknown> | null;
  amount?: unknown;
  supplier_net_eur?: unknown;
}) {
  const commission = readCommission(item);
  const details = item.details || {};
  const sale = moneyOrNull(item.amount);
  const currency = typeof details.supplier_currency === "string" ? details.supplier_currency.toUpperCase() : "";
  const purchase =
    moneyOrNull(item.supplier_net_eur) ??
    moneyOrNull(details.supplier_net_eur) ??
    (!currency || currency === "EUR" ? moneyOrNull(details.supplier_net) : null);
  const margin = cardMargin({ sale, purchase, commission });
  return {
    commission_attendue: commission.attendue,
    commission_taux: commission.taux,
    commission_date_prevue: commission.datePrevue,
    commission_recue: commission.recue,
    commission_recue_le: commission.recueLe,
    marge_directe: margin.direct,
    commission_marge: margin.kind === "aucune" ? null : margin.commission,
    commission_marge_source: margin.kind,
    marge: margin.margin,
  };
}
