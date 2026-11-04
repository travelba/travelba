/**
 * Un crédit client se rapproche. Intérêts, virements internes, remboursements,
 * frais et le versement Stripe (le bloc, avant découpage) ne se créditent pas.
 */

export const REVOLUT_CREDIT_CATEGORIES = [
  "client",
  "interet",
  "interne",
  "remboursement",
  "frais",
  "stripe",
  "stripe_paiement",
] as const;

export type RevolutCreditCategory = (typeof REVOLUT_CREDIT_CATEGORIES)[number];

export type RevolutClassifyInput = {
  type?: string | null;
  reference?: string | null;
  description?: string | null;
  counterpartyName?: string | null;
  legs?: Array<{
    amount?: number;
    description?: string;
    account_id?: string;
    counterparty?: { name?: string; account_type?: string } | null;
  }> | null;
};

const INTERNAL_LABEL =
  /\bEUR\s+MAIN\b|(?:^|\s)(?:FROM|TO)\s+EUR\b|\bVIREMENT\s+INTERNE\b|\bENTRE\s+COMPTES\b|\bOWN\s+ACCOUNT\b|(?:^|\s)(?:FROM|TO)\s+TR[ÉE]SO/i;

export function isRevolutCreditCategory(value: string | null | undefined): value is RevolutCreditCategory {
  return (REVOLUT_CREDIT_CATEGORIES as readonly string[]).includes(value || "");
}

/** Le versement Stripe (bloc) n’est pas un crédit. Chaque paiement découpé l’est, au clic. */
export function revolutCreditInboxStatus(category: RevolutCreditCategory): "unmatched" | "ignored" {
  if (category === "client" || category === "stripe" || category === "stripe_paiement") return "unmatched";
  return "ignored";
}

export function revolutCategoryCollectable(category: string | null | undefined) {
  return !category || category === "client" || category === "stripe_paiement";
}

export function revolutRowCollectable(row: {
  status?: string | null;
  category?: string | null;
  stripe_line?: { deja_encaisse?: boolean } | null;
}) {
  if (row.status && row.status !== "unmatched") return false;
  if (row.stripe_line?.deja_encaisse) return false;
  return revolutCategoryCollectable(row.category);
}

export function classifyRevolutCredit(input: RevolutClassifyInput): {
  category: RevolutCreditCategory;
  label: string | null;
} {
  const type = (input.type || "").toLowerCase();
  const description = (input.description || "").trim();
  const reference = (input.reference || "").trim();
  const counterparty = (input.counterpartyName || "").trim();
  const text = `${description} ${reference} ${counterparty}`;

  if (type === "interest" || /^interest earned\b/i.test(description)) {
    return { category: "interet", label: "Intérêts Revolut" };
  }
  if (isStripeSettlement({ description, reference, counterparty })) {
    return { category: "stripe", label: "Stripe" };
  }
  if (
    type === "refund" ||
    type === "card_refund" ||
    type === "card_credit" ||
    type === "card_chargeback" ||
    type === "topup_return"
  ) {
    return { category: "remboursement", label: "Remboursement" };
  }
  if (type === "fee" || type === "charge" || type === "tax" || type === "tax_refund") {
    return { category: "frais", label: "Frais Revolut" };
  }
  if (type === "exchange" || isInternalTransfer(input, text)) {
    return { category: "interne", label: "Virement interne" };
  }
  return { category: "client", label: null };
}

export function isStripeSettlement(input: {
  description?: string | null;
  reference?: string | null;
  counterparty?: string | null;
}) {
  const description = input.description || "";
  const reference = (input.reference || "").trim();
  const counterparty = (input.counterparty || "").trim();
  if (/^stripe$/i.test(counterparty)) return true;
  if (/payment from stripe/i.test(description)) return true;
  if (/^stripe$/i.test(reference)) return true;
  return false;
}

function isInternalTransfer(input: RevolutClassifyInput, text: string) {
  if (INTERNAL_LABEL.test(text)) return true;
  const type = (input.type || "").toLowerCase();
  const legs = input.legs || [];
  if (type !== "transfer" || legs.length < 2) return false;
  return legs.every((leg) => {
    if (!leg?.account_id) return false;
    const accountType = String(leg.counterparty?.account_type || "").toLowerCase();
    return accountType !== "external";
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function labelFor(category: RevolutCreditCategory) {
  switch (category) {
    case "interet":
      return "Intérêts Revolut";
    case "interne":
      return "Virement interne";
    case "remboursement":
      return "Remboursement";
    case "frais":
      return "Frais Stripe";
    case "stripe":
      return "Stripe";
    default:
      return null;
  }
}

/** Catégorie stockée, sinon lecture du mouvement Revolut. */
export function classifyStoredRevolut(row: {
  category?: string | null;
  raw?: unknown;
  counterparty_name?: string | null;
  reference?: string | null;
}): { category: RevolutCreditCategory; label: string | null } {
  if (isRevolutCreditCategory(row.category) && row.category !== "client") {
    return { category: row.category, label: labelFor(row.category) };
  }
  const raw = asRecord(row.raw);
  const legs = Array.isArray(raw?.legs) ? raw.legs : [];
  const leg = asRecord(legs[0]);
  const counterparty = asRecord(leg?.counterparty);
  const fromLeg = typeof counterparty?.name === "string" ? counterparty.name : null;
  return classifyRevolutCredit({
    type: typeof raw?.type === "string" ? raw.type : null,
    reference: row.reference,
    description: typeof leg?.description === "string" ? leg.description : null,
    counterpartyName: row.counterparty_name || fromLeg,
    legs: legs.flatMap((item) => {
      const record = asRecord(item);
      if (!record) return [];
      const party = asRecord(record.counterparty);
      return [
        {
          amount: typeof record.amount === "number" ? record.amount : undefined,
          description: typeof record.description === "string" ? record.description : undefined,
          account_id: typeof record.account_id === "string" ? record.account_id : undefined,
          counterparty: party
            ? {
                name: typeof party.name === "string" ? party.name : undefined,
                account_type: typeof party.account_type === "string" ? party.account_type : undefined,
              }
            : null,
        },
      ];
    }),
  });
}

/**
 * File encore ouverte : intérêts, internes et remboursements sortent.
 * Un versement Stripe reste ouvert jusqu’au découpage. Un crédit déjà posé ne bouge pas.
 */
export function revolutPendingReclass(row: {
  status?: string | null;
  direction?: string | null;
  category?: string | null;
  matched_transaction_id?: string | null;
  parent_id?: string | null;
  raw?: unknown;
  counterparty_name?: string | null;
  reference?: string | null;
}): { category: RevolutCreditCategory; status?: "ignored" } | null {
  if (row.parent_id) return null;
  if (row.direction === "debit") return null;
  if (row.status === "matched" || row.matched_transaction_id) return null;
  const klass = classifyStoredRevolut(row);
  if (klass.category === "client") {
    return row.category === "client" ? null : { category: "client" };
  }
  if (klass.category === "stripe") {
    return row.category === "stripe" ? null : { category: "stripe" };
  }
  if (row.status === "ignored" && row.category === klass.category) return null;
  return { category: klass.category, status: "ignored" };
}
