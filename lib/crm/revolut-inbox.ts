/** Inbox rapprochement : uniquement les crédits clients (virements reçus). */
export function isRevolutCredit(direction: string | null | undefined) {
  return direction !== "debit";
}

/** Change, frais et remboursements carte : jamais un virement client à rapprocher. */
const NOT_A_CUSTOMER_CREDIT = new Set([
  "card_payment",
  "card_refund",
  "charge",
  "atm",
  "exchange",
  "fee",
  "refund",
]);

export function shouldIngestRevolutForRapprochement(input: {
  type?: string | null;
  signedAmount: number;
  reference?: string | null;
}) {
  const txType = (input.type || "").toLowerCase();
  if (NOT_A_CUSTOMER_CREDIT.has(txType)) return false;
  if (!(Number(input.signedAmount) > 0)) return false;
  if (/^stripe$/i.test((input.reference || "").trim())) return false;
  return true;
}

/** Sortie complétée du compte : onglet Débits, jamais un crédit client. */
export function shouldIngestRevolutDebit(input: { signedAmount: number; state?: string | null }) {
  if (!(Number(input.signedAmount) < 0)) return false;
  const state = (input.state || "").toLowerCase();
  if (state && state !== "completed") return false;
  return true;
}

export type RevolutSenderSource = {
  counterparty_name?: string | null;
  reference?: string | null;
  raw?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstLeg(raw: unknown): Record<string, unknown> | null {
  const root = asRecord(raw);
  const legs = root && Array.isArray(root.legs) ? root.legs : [];
  return asRecord(legs[0]);
}

/** Revolut SEPA topup : « Payment from {expéditeur} » dans legs[].description. */
export function senderFromPaymentDescription(description: string | null | undefined) {
  const text = (description || "").trim();
  if (!text) return null;
  const match = text.match(/^(?:payment|received)\s+from\s+(.+)$/i);
  const name = match?.[1]?.trim();
  return name || null;
}

export function senderFromRevolutPayload(input: {
  description?: string | null;
  counterpartyName?: string | null;
}) {
  return (
    senderFromPaymentDescription(input.description) ||
    (input.counterpartyName || "").trim() ||
    null
  );
}

function sameLabel(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Expéditeur du virement — jamais la seule désignation SEPA. */
export function revolutSenderName(row: RevolutSenderSource) {
  const leg = firstLeg(row.raw);
  const counterparty = asRecord(leg?.counterparty);
  const fromPayload = senderFromRevolutPayload({
    description: typeof leg?.description === "string" ? leg.description : null,
    counterpartyName: typeof counterparty?.name === "string" ? counterparty.name : null,
  });
  if (fromPayload) return fromPayload;
  const stored = (row.counterparty_name || "").trim();
  const reference = (row.reference || "").trim();
  if (stored && (!reference || !sameLabel(stored, reference))) return stored;
  return "";
}

export function revolutDesignation(row: Pick<RevolutSenderSource, "reference">) {
  return (row.reference || "").trim();
}

export function revolutInboxCopy(row: RevolutSenderSource) {
  const sender = revolutSenderName(row) || "Expéditeur inconnu";
  const designation = revolutDesignation(row);
  return {
    sender,
    designation: designation && !sameLabel(designation, sender) ? designation : "",
  };
}

/** Bénéficiaire d’une sortie : commerçant, contrepartie, ou « To … » dans la description. */
export function revolutDebitParty(input: {
  merchantName?: string | null;
  counterpartyName?: string | null;
  description?: string | null;
}) {
  const merchant = (input.merchantName || "").trim();
  if (merchant) return merchant;
  const counterparty = (input.counterpartyName || "").trim();
  if (counterparty) return counterparty;
  const description = (input.description || "").trim();
  const to = description.match(/^(?:to|payment to)\s+(.+)$/i)?.[1]?.trim();
  return to || description || null;
}

export function revolutDebitKindLabel(type: string | null | undefined) {
  switch ((type || "").toLowerCase()) {
    case "transfer":
      return "Virement";
    case "card_payment":
      return "Carte";
    case "atm":
      return "Retrait";
    case "fee":
    case "charge":
      return "Frais";
    case "exchange":
      return "Change";
    case "refund":
    case "card_refund":
      return "Remboursement";
    default:
      return "Sortie";
  }
}

export type RevolutDebitLine = {
  id: string;
  amount: number;
  currency: string;
  party: string;
  reference: string;
  bookedAt: string | null;
  kind: string;
};

type RevolutLeg = {
  amount?: number;
  currency?: string;
  description?: string;
  counterparty?: { name?: string; iban?: string; account_no?: string };
};

export type RevolutIngestInput = {
  id?: string;
  type?: string | null;
  state?: string | null;
  reference?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  merchant?: { name?: string | null } | null;
  legs?: RevolutLeg[] | null;
};

export type RevolutInboxDraft = {
  direction: "credit" | "debit";
  /** Un débit ne reste pas « à rapprocher ». */
  status: "unmatched" | "ignored";
  amount: number;
  currency: string;
  counterparty_name: string | null;
  counterparty_iban: string | null;
  reference: string | null;
  booked_at: string | null;
};

/** Crédit à rapprocher, ou débit en lecture seule. Null = hors des deux onglets. */
export function revolutInboxDraft(tx: RevolutIngestInput): RevolutInboxDraft | null {
  const leg = tx.legs?.[0];
  if (!tx.id || !leg) return null;
  const signed = Number(leg.amount || 0);
  const reference = (tx.reference || "").trim();
  const credit = shouldIngestRevolutForRapprochement({
    type: tx.type,
    signedAmount: signed,
    reference,
  });
  const debitLeg = credit ? null : (tx.legs || []).find((item) => Number(item.amount) < 0) || null;
  const movement = credit ? leg : debitLeg;
  if (!movement) return null;
  const movementSigned = Number(movement.amount || 0);
  if (!credit && !shouldIngestRevolutDebit({ signedAmount: movementSigned, state: tx.state })) {
    return null;
  }
  const counterpartyName = credit
    ? senderFromRevolutPayload({
        description: movement.description,
        counterpartyName: movement.counterparty?.name,
      })
    : revolutDebitParty({
        merchantName: tx.merchant?.name,
        counterpartyName: movement.counterparty?.name,
        description: movement.description,
      });
  return {
    direction: credit ? "credit" : "debit",
    status: credit ? "unmatched" : "ignored",
    amount: Math.abs(movementSigned),
    currency: movement.currency || "EUR",
    counterparty_name: counterpartyName,
    counterparty_iban: movement.counterparty?.iban || movement.counterparty?.account_no || null,
    reference: reference || null,
    booked_at: tx.completed_at || tx.created_at || null,
  };
}

export function revolutDebitLine(row: {
  id: string;
  amount: number | string;
  currency: string;
  counterparty_name: string | null;
  reference: string | null;
  booked_at: string | null;
  raw?: unknown;
}): RevolutDebitLine {
  const root = asRecord(row.raw);
  const leg = firstLeg(row.raw);
  const merchant = asRecord(root?.merchant);
  const counterparty = asRecord(leg?.counterparty);
  const stored = (row.counterparty_name || "").trim();
  const party =
    stored ||
    revolutDebitParty({
      merchantName: typeof merchant?.name === "string" ? merchant.name : null,
      counterpartyName: typeof counterparty?.name === "string" ? counterparty.name : null,
      description: typeof leg?.description === "string" ? leg.description : null,
    }) ||
    "Bénéficiaire inconnu";
  const reference = (row.reference || "").trim();
  const type = typeof root?.type === "string" ? root.type : null;
  return {
    id: row.id,
    amount: Math.abs(Number(row.amount) || 0),
    currency: row.currency || "EUR",
    party,
    reference: reference && !sameLabel(reference, party) ? reference : "",
    bookedAt: row.booked_at,
    kind: revolutDebitKindLabel(type),
  };
}
