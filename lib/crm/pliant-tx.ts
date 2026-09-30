const SECRET_KEYS = new Set(["pan", "cvv", "cvc", "cardnumber", "pin"]);

export type PliantTransactionRow = {
  pliant_transaction_id: string;
  card_id: string | null;
  status: string | null;
  type: string | null;
  merchant: string | null;
  billing_cents: number | null;
  billing_currency: string | null;
  transaction_cents: number | null;
  transaction_currency: string | null;
  booked_at: string | null;
  card_label: string | null;
  card_last4: string | null;
  holder_name: string | null;
  category: string | null;
  comment: string | null;
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

export const PLIANT_CATEGORY_LABELS: Record<string, string> = {
  ADVERTISING_AND_MARKETING: "Publicité",
  COMPUTING_AND_SOFTWARE: "Logiciels",
  EDUCATION_AND_TRAINING: "Formation",
  ELECTRONICS_AND_IT_EQUIPMENT: "Équipement",
  ENTERTAINMENT_AND_WELLNESS: "Loisirs",
  FOOD_AND_DRINKS: "Restaurants",
  GIFTS_AND_VOUCHERS: "Cadeaux",
  MATERIALS_AND_PACKAGING: "Fournitures",
  OFFICE_SUPPLIES_AND_EQUIPMENT: "Bureau",
  SERVICES: "Services",
  TRAVEL_AND_ACCOMMODATION: "Voyage et hébergement",
  HEALTHCARE: "Santé",
  OTHER: "Autre",
};

export function pliantTypeLabel(type: string | null) {
  if (!type) return "Mouvement";
  return PLIANT_TYPE_LABELS[type] || type;
}

export function pliantStatusLabel(status: string | null) {
  if (!status) return "Inconnu";
  return PLIANT_STATUS_LABELS[status] || status;
}

export function pliantCategoryLabel(category: string | null) {
  if (!category) return null;
  return PLIANT_CATEGORY_LABELS[category] || category;
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
  return {
    pliant_transaction_id: id,
    card_id: text(row.cardId),
    status: text(row.status),
    type: text(row.type),
    merchant: merchantName(row),
    billing_cents: billing.cents,
    billing_currency: billing.currency,
    transaction_cents: transaction.cents,
    transaction_currency: transaction.currency,
    booked_at: text(row.confirmedAt) || text(row.authorizedAt) || text(row.createdAt),
    card_label: clip(text(row.cardLabel), 80),
    card_last4: fourDigits(row.cardLast4),
    holder_name: clip(text(row.holderName), 120),
    category: text(row.category),
    comment: clip(text(row.comment), 200),
    raw: scrubPliantPayload(row),
  };
}

/** Ajoute le libellé de carte et le porteur, sans copier le numéro complet. */
export function annotatePliantPayload(payload: unknown, card: unknown, holder: unknown) {
  if (!payload || typeof payload !== "object") return payload;
  const row = { ...(payload as Record<string, unknown>) };
  const face = pliantCardFace(card);
  if (face.label) row.cardLabel = face.label;
  if (face.last4) row.cardLast4 = face.last4;
  const holderName = pliantHolderName(holder);
  if (holderName) row.holderName = holderName;
  return row;
}

export function pliantCardFace(card: unknown) {
  if (!card || typeof card !== "object") return { id: null as string | null, label: null as string | null, last4: null as string | null };
  const row = card as Record<string, unknown>;
  return {
    id: text(row.cardId) || text(row.id),
    label: clip(text(row.label) || text(row.purpose) || text(row.cardDesignLogoName), 80),
    last4: fourDigits(row.refNum) || fourDigits(row.last4),
  };
}

export function pliantHolderName(holder: unknown) {
  if (!holder || typeof holder !== "object") return null;
  const row = holder as Record<string, unknown>;
  const first = text(row.firstName) || text(row.firstname);
  const last = text(row.lastName) || text(row.lastname);
  const joined = [first, last].filter(Boolean).join(" ");
  return clip(joined || text(row.name), 120);
}

export function pliantHolderId(holder: unknown) {
  if (!holder || typeof holder !== "object") return null;
  const row = holder as Record<string, unknown>;
  return text(row.cardholderId) || text(row.id);
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
    const name = text(merchant.displayName) || text(merchant.name) || text(merchant.cleanName);
    if (name) return name.slice(0, 200);
  }
  const raw = row.merchantRawData;
  if (raw && typeof raw === "object") {
    const merchant = raw as Record<string, unknown>;
    const name =
      text(merchant.descriptionConfirmation) ||
      text(merchant.descriptionAuthorization) ||
      text(merchant.merchantLegalName) ||
      text(merchant.merchantNameOther);
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

function clip(value: string | null, max: number) {
  return value ? value.slice(0, max) : null;
}

function fourDigits(value: unknown) {
  const raw = text(value);
  return raw && /^\d{4}$/.test(raw) ? raw : null;
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
