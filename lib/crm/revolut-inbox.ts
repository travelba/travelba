/** Inbox rapprochement : uniquement les crédits clients (virements reçus). */
export function isRevolutCredit(direction: string | null | undefined) {
  return direction !== "debit";
}

export function shouldIngestRevolutForRapprochement(input: {
  type?: string | null;
  signedAmount: number;
  reference?: string | null;
}) {
  const txType = (input.type || "").toLowerCase();
  if (txType === "card_payment" || txType === "charge" || txType === "atm") return false;
  if (!(Number(input.signedAmount) > 0)) return false;
  if (/^stripe$/i.test((input.reference || "").trim())) return false;
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
