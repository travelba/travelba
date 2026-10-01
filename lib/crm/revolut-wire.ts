/** Coordonnées SEPA du compte euros Revolut Business. L’IBAN n’est pas journalisé. */

export type RevolutAccountRow = {
  id: string;
  name?: string;
  currency?: string;
  state?: string;
};

export type RevolutBankDetailRow = {
  iban?: string;
  bic?: string;
  beneficiary?: string;
  schemes?: string[];
};

export type AgencyWire = {
  iban: string;
  bic: string;
  accountHolder: string;
};

type WireCandidate = AgencyWire & { accountId: string; sepa: boolean; fr: boolean };

function cleanIban(value: string | undefined) {
  return (value || "").replace(/\s+/g, "").toUpperCase();
}

export function groupIban(iban: string) {
  return cleanIban(iban).replace(/(.{4})/g, "$1 ").trim();
}

function usableDetail(row: RevolutBankDetailRow, account: RevolutAccountRow): WireCandidate | null {
  const iban = cleanIban(row.iban);
  if (!/^FR[A-Z0-9]{25}$/.test(iban) && !/^[A-Z]{2}[A-Z0-9]{13,32}$/.test(iban)) return null;
  const schemes = (row.schemes || []).map((scheme) => scheme.toLowerCase());
  const sepa = schemes.includes("sepa");
  if (schemes.length > 0 && !sepa) return null;
  const holder = (row.beneficiary || account.name || "").trim();
  return {
    accountId: account.id,
    iban,
    bic: (row.bic || "").replace(/\s+/g, "").toUpperCase(),
    accountHolder: holder,
    sepa,
    fr: iban.startsWith("FR"),
  };
}

function isMainAccount(account: RevolutAccountRow) {
  return (account.name || "").trim().toLowerCase() === "main";
}

/** Un seul IBAN : SEPA puis français. Plusieurs IBAN distincts → rien. */
function chooseUnique(candidates: WireCandidate[]): AgencyWire | null {
  const sepa = candidates.filter((row) => row.sepa);
  const pool = sepa.length ? sepa : candidates;
  const french = pool.filter((row) => row.fr);
  const narrowed = french.length ? french : pool;
  const ibans = new Set(narrowed.map((row) => row.iban));
  if (ibans.size !== 1) return null;
  const chosen = narrowed[0];
  return { iban: chosen.iban, bic: chosen.bic, accountHolder: chosen.accountHolder };
}

/**
 * IBAN SEPA du compte euros actif nommé Main.
 * Les poches (autre nom) ne sont pas proposées dès qu’un Main existe.
 * Sans Main, un seul IBAN euros distinct. Sinon rien : pas de compte au hasard.
 */
export function pickEurSepaWire(
  accounts: RevolutAccountRow[],
  details: Array<{ accountId: string; rows: RevolutBankDetailRow[] }>
): AgencyWire | null {
  const byAccount = new Map(details.map((entry) => [entry.accountId, entry.rows]));
  const activeEur = accounts.filter(
    (account) =>
      (account.state || "active") === "active" && (account.currency || "").toUpperCase() === "EUR"
  );
  const candidates: WireCandidate[] = [];
  for (const account of activeEur) {
    for (const row of byAccount.get(account.id) || []) {
      const candidate = usableDetail(row, account);
      if (candidate) candidates.push(candidate);
    }
  }
  const mainIds = new Set(activeEur.filter(isMainAccount).map((account) => account.id));
  if (mainIds.size) {
    return chooseUnique(candidates.filter((row) => mainIds.has(row.accountId)));
  }
  return chooseUnique(candidates);
}
