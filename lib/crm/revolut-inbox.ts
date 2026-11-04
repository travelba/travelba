import {
  classifyRevolutCredit,
  revolutCreditInboxStatus,
  type RevolutCreditCategory,
} from "./revolut-classify";

type InboxStripeLine = {
  kind?: string | null;
  name?: string | null;
  email?: string | null;
  dossier_ref?: string | null;
  payment_intent_id?: string | null;
  fee?: number | null;
  net?: number | null;
  booking_id?: string | null;
};

/** Un crédit client se rapproche au grand livre. Une sortie se rattache à un dossier, sans crédit. */
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
  category?: string | null;
  stripe_line?: InboxStripeLine | null;
  parent_id?: string | null;
  status?: string | null;
  id?: string;
  booked_at?: string | null;
  amount?: number | string | null;
  currency?: string | null;
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

function stripePaymentDesignation(line: InboxStripeLine | null | undefined) {
  if (!line || line.kind === "cache") return "";
  const parts = [
    (line.email || "").trim(),
    (line.dossier_ref || "").trim(),
    (line.payment_intent_id || "").trim(),
  ].filter(Boolean);
  if (line.fee) parts.push(`frais ${line.fee.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € à la charge de l’agence`);
  const net = line.net;
  if (line.kind === "paiement" && typeof net === "number" && Number.isFinite(net)) {
    parts.push(`net ${net.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
  }
  return parts.join(" · ");
}

export function revolutInboxCopy(row: RevolutSenderSource) {
  const category =
    row.category ||
    (row.raw || row.counterparty_name || row.reference
      ? classifyRevolutCredit({
          type: typeof (row.raw as { type?: string } | null)?.type === "string" ? (row.raw as { type: string }).type : null,
          reference: row.reference,
          description:
            typeof (row.raw as { legs?: Array<{ description?: string }> } | null)?.legs?.[0]?.description === "string"
              ? (row.raw as { legs: Array<{ description?: string }> }).legs[0].description
              : null,
          counterpartyName: row.counterparty_name,
        }).category
      : null);
  if (category === "interet") return { sender: "Intérêts Revolut", designation: "" };
  if (category === "interne") return { sender: "Virement interne", designation: "" };
  if (category === "frais") {
    if (row.parent_id || row.stripe_line?.kind === "frais") {
      return { sender: "Frais Stripe", designation: "Frais d’agence, non crédités au client" };
    }
    return { sender: "Frais Revolut", designation: "" };
  }
  if (category === "stripe") return { sender: "Stripe", designation: "Versement en attente du détail" };
  if (category === "stripe_paiement") {
    const name = (row.stripe_line?.name || "").trim() || revolutSenderName(row) || "Client Stripe";
    const detail = stripePaymentDesignation(row.stripe_line);
    const ref = revolutDesignation(row);
    return {
      sender: `Stripe · ${name}`,
      designation: [detail, ref && !detail.includes(ref) ? ref : ""].filter(Boolean).join(" · "),
    };
  }
  if (category === "remboursement") {
    const sender = revolutSenderName(row) || "Remboursement";
    return { sender, designation: revolutDesignation(row) };
  }
  const sender = revolutSenderName(row) || "Expéditeur inconnu";
  const designation = revolutDesignation(row);
  return {
    sender,
    designation: designation && !sameLabel(designation, sender) ? designation : "",
  };
}

/** File « à encaisser » : les lignes d’un versement ouvert restent groupées, le bloc entier non. */
export function revolutInboxVisible(
  row: RevolutSenderSource,
  rows: RevolutSenderSource[],
  scope: "unmatched" | "all"
) {
  const category = row.category || null;
  const children = rows.some((other) => other.parent_id && row.id && other.parent_id === row.id);
  if (category === "stripe" && !row.parent_id && children) return false;
  if (scope === "all") return true;
  if (row.parent_id && (category === "stripe_paiement" || category === "frais" || category === "remboursement")) {
    return rows.some(
      (other) =>
        other.parent_id === row.parent_id && other.category === "stripe_paiement" && other.status === "unmatched"
    );
  }
  if (category === "interet" || category === "interne" || category === "remboursement" || category === "frais") {
    return false;
  }
  if (category === "stripe") return row.status === "unmatched";
  return row.status === "unmatched";
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
  status: "unmatched" | "matched" | "ignored";
  customerLabel: string;
  bookingId: string | null;
  bookingLabel: string;
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
  /** Une sortie neuve attend le clic. Refuser la pose ensuite en ignored. */
  status: "unmatched" | "ignored";
  /** Null pour une sortie. Un crédit non client est classé tout de suite. */
  category: RevolutCreditCategory | null;
  amount: number;
  currency: string;
  counterparty_name: string | null;
  counterparty_iban: string | null;
  reference: string | null;
  booked_at: string | null;
};

/** Crédit à rapprocher, ou sortie à rattacher. Null = hors des deux onglets. */
export function revolutInboxDraft(tx: RevolutIngestInput): RevolutInboxDraft | null {
  const leg = tx.legs?.[0];
  if (!tx.id || !leg) return null;
  const signed = Number(leg.amount || 0);
  const reference = (tx.reference || "").trim();
  const klass = classifyRevolutCredit({
    type: tx.type,
    reference,
    description: leg.description,
    counterpartyName: leg.counterparty?.name,
    legs: tx.legs,
  });
  const stripeCredit = klass.category === "stripe" && signed > 0;
  const credit =
    stripeCredit ||
    shouldIngestRevolutForRapprochement({
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
    status: credit ? revolutCreditInboxStatus(klass.category) : "unmatched",
    category: credit ? klass.category : null,
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
  status?: string | null;
  customerLabel?: string | null;
  bookingId?: string | null;
  bookingLabel?: string | null;
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
  const status =
    row.status === "matched" || row.status === "ignored" ? row.status : "unmatched";
  return {
    id: row.id,
    amount: Math.abs(Number(row.amount) || 0),
    currency: row.currency || "EUR",
    party,
    reference: reference && !sameLabel(reference, party) ? reference : "",
    bookedAt: row.booked_at,
    kind: revolutDebitKindLabel(type),
    status,
    customerLabel: (row.customerLabel || "").trim(),
    bookingId: (row.bookingId || "").trim() || null,
    bookingLabel: (row.bookingLabel || "").trim(),
  };
}

function sameInstant(left: string | null | undefined, right: string | null | undefined) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  const a = Date.parse(left);
  const b = Date.parse(right);
  if (Number.isFinite(a) && Number.isFinite(b)) return a === b;
  return left === right;
}

/** Vrai quand la ligne en base porte déjà le mouvement : la synchro n’a rien à réécrire. */
export function revolutInboxMatches(
  existing: {
    amount: number | string | null;
    currency: string | null;
    direction: string | null;
    counterparty_name: string | null;
    counterparty_iban: string | null;
    reference: string | null;
    booked_at: string | null;
    category?: string | null;
  },
  update: {
    amount: number;
    currency: string;
    direction: string;
    counterparty_name: string | null;
    counterparty_iban: string | null;
    reference: string | null;
    booked_at: string | null;
    category?: string | null;
  }
) {
  const text = (value: string | null | undefined) => value || null;
  const categoryOk = update.category == null || (existing.category || null) === update.category;
  return (
    Number(existing.amount) === update.amount &&
    (existing.currency || "EUR") === update.currency &&
    existing.direction === update.direction &&
    text(existing.counterparty_name) === text(update.counterparty_name) &&
    text(existing.counterparty_iban) === text(update.counterparty_iban) &&
    text(existing.reference) === text(update.reference) &&
    sameInstant(existing.booked_at, update.booked_at) &&
    categoryOk
  );
}

/** Insert pose le statut. L’update d’une ligne déjà connue ne le réécrit pas. */
export function revolutSyncPayload(txId: string, draft: RevolutInboxDraft) {
  const fields = {
    amount: draft.amount,
    currency: draft.currency,
    direction: draft.direction,
    counterparty_name: draft.counterparty_name,
    counterparty_iban: draft.counterparty_iban,
    reference: draft.reference,
    booked_at: draft.booked_at,
    category: draft.category,
  };
  return {
    insert: { revolut_transaction_id: txId, ...fields, status: draft.status },
    update: fields,
  };
}
