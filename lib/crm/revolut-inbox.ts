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
