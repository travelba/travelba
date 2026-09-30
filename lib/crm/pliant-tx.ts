const SECRET_KEYS = new Set(["pan", "cvv", "cvc", "cardnumber", "pin"]);

export type PliantTransactionRow = {
  pliant_transaction_id: string;
  card_id: string | null;
  pliant_card_id: string | null;
  status: string | null;
  type: string | null;
  merchant: string | null;
  billing_cents: number | null;
  billing_currency: string | null;
  transaction_cents: number | null;
  transaction_currency: string | null;
  amount_cents: number | null;
  currency: string | null;
  booked_at: string | null;
  raw: Record<string, unknown>;
};

export type PliantStayRef = {
  cardId: string;
  bookingId: string;
  reference: string | null;
  last4: string | null;
};

const INBOUND = new Set(["REFUND", "CHARGEBACK", "RECHARGE"]);

export const PLIANT_TYPE_LABELS: Record<string, string> = {
  PURCHASE: "Achat",
  CASH_WITHDRAWAL: "Retrait",
  REFUND: "Remboursement",
  CHARGEBACK: "Contestation",
  RECHARGE: "Recharge",
  STATUS_INQUIRY: "Vérification",
};

export const PLIANT_STATUS_LABELS: Record<string, string> = {
  PENDING: "En attente",
  CONFIRMED: "Confirmée",
  DECLINED: "Refusée",
  REVERSED: "Annulée",
  BOOKED: "Comptabilisée",
};

export function pliantTypeLabel(type: string | null) {
  if (!type) return "Mouvement";
  return PLIANT_TYPE_LABELS[type] || type;
}

export function pliantStatusLabel(status: string | null) {
  if (!status) return "Inconnu";
  return PLIANT_STATUS_LABELS[status] || status;
}

export function pliantStatusTone(status: string | null): "sky" | "green" | "amber" | "red" | "navy" | "gold" {
  if (status === "DECLINED") return "red";
  if (status === "PENDING") return "amber";
  if (status === "REVERSED") return "gold";
  if (status === "CONFIRMED" || status === "BOOKED") return "green";
  return "navy";
}

/** Centimes signés : un achat sort, un remboursement rentre. */
export function pliantSignedCents(type: string | null, cents: number | null) {
  if (cents == null || !Number.isFinite(cents)) return null;
  const abs = Math.abs(Math.round(cents));
  if (abs === 0) return 0;
  return type && INBOUND.has(type) ? abs : -abs;
}

export function pliantStayForCard(cardId: string | null, stays: PliantStayRef[]) {
  if (!cardId) return null;
  return stays.find((row) => row.cardId === cardId) || null;
}

export function pliantSyncSummary(fetched: number) {
  const lus = fetched > 1 ? `${fetched} mouvements lus` : `${fetched} mouvement lu`;
  return `Synchronisation terminée : ${lus}.`;
}

export function mapPliantTransaction(payload: unknown): PliantTransactionRow | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const id = text(row.transactionId) || text(row.id);
  if (!id) return null;
  const billing = money(row.billingAmount);
  const transaction = money(row.transactionAmount);
  const cardId = text(row.cardId);
  const cents = billing.cents ?? transaction.cents;
  const currency = billing.currency || transaction.currency;
  return {
    pliant_transaction_id: id,
    card_id: cardId,
    pliant_card_id: cardId,
    status: text(row.status),
    type: text(row.type),
    merchant: merchantName(row),
    billing_cents: billing.cents,
    billing_currency: billing.currency,
    transaction_cents: transaction.cents,
    transaction_currency: transaction.currency,
    amount_cents: cents,
    currency,
    booked_at: text(row.confirmedAt) || text(row.authorizedAt) || text(row.createdAt),
    raw: scrubPliantPayload(row),
  };
}

export function scrubPliantPayload(value: unknown): Record<string, unknown> {
  const clean = scrub(value);
  return clean && typeof clean === "object" && !Array.isArray(clean) ? (clean as Record<string, unknown>) : {};
}

export function pliantTransactionPage(payload: unknown, limit = 100) {
  if (!payload || typeof payload !== "object") return { rows: [] as unknown[], done: true };
  const body = payload as { data?: unknown; hasNextPage?: boolean };
  const rows = Array.isArray(body.data) ? body.data : [];
  if (body.hasNextPage === false || rows.length === 0) return { rows, done: true };
  if (body.hasNextPage === true) return { rows, done: false };
  return { rows, done: rows.length < limit };
}

function merchantName(row: Record<string, unknown>) {
  const data = row.merchantData;
  if (data && typeof data === "object") {
    const merchant = data as Record<string, unknown>;
    const name = text(merchant.name) || text(merchant.displayName) || text(merchant.cleanName);
    if (name) return name.slice(0, 200);
  }
  const legacy = text(row.merchantName);
  return legacy ? legacy.slice(0, 200) : null;
}

function money(value: unknown) {
  if (!value || typeof value !== "object") return { cents: null as number | null, currency: null as string | null };
  const row = value as Record<string, unknown>;
  const amount = typeof row.value === "number" ? row.value : Number(row.value);
  const currency = text(row.currency);
  if (!Number.isFinite(amount)) return { cents: null, currency };
  return { cents: Math.round(amount), currency };
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEYS.has(key.toLowerCase())) continue;
    out[key] = scrub(child);
  }
  return out;
}
