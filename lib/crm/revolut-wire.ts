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

type WireCandidate = AgencyWire & { sepa: boolean; fr: boolean };

function cleanIban(value: string | undefined) {
  return (value || "").replace(/\s+/g, "").toUpperCase();
}

export function groupIban(iban: string) {
  return cleanIban(iban).replace(/(.{4})/g, "$1 ").trim();
}

function usableDetail(row: RevolutBankDetailRow, accountName: string): WireCandidate | null {
  const iban = cleanIban(row.iban);
  if (!/^FR[A-Z0-9]{25}$/.test(iban) && !/^[A-Z]{2}[A-Z0-9]{13,32}$/.test(iban)) return null;
  const schemes = (row.schemes || []).map((scheme) => scheme.toLowerCase());
  const sepa = schemes.includes("sepa");
  if (schemes.length > 0 && !sepa) return null;
  const holder = (row.beneficiary || accountName || "").trim();
  return {
    iban,
    bic: (row.bic || "").replace(/\s+/g, "").toUpperCase(),
    accountHolder: holder,
    sepa,
    fr: iban.startsWith("FR"),
  };
}

/**
 * Un seul IBAN SEPA du compte euros actif.
 * Plusieurs IBAN distincts → rien : on n’affiche pas un compte au hasard.
 */
export function pickEurSepaWire(
  accounts: RevolutAccountRow[],
  details: Array<{ accountId: string; rows: RevolutBankDetailRow[] }>
): AgencyWire | null {
  const byAccount = new Map(details.map((entry) => [entry.accountId, entry.rows]));
  const candidates: WireCandidate[] = [];
  for (const account of accounts) {
    if ((account.state || "active") !== "active") continue;
    if ((account.currency || "").toUpperCase() !== "EUR") continue;
    const rows = byAccount.get(account.id) || [];
    for (const row of rows) {
      const candidate = usableDetail(row, account.name || "");
      if (candidate) candidates.push(candidate);
    }
  }
  const sepa = candidates.filter((row) => row.sepa);
  const pool = sepa.length ? sepa : candidates;
  const french = pool.filter((row) => row.fr);
  const narrowed = french.length ? french : pool;
  const ibans = new Set(narrowed.map((row) => row.iban));
  if (ibans.size !== 1) return null;
  const chosen = narrowed[0];
  return { iban: chosen.iban, bic: chosen.bic, accountHolder: chosen.accountHolder };
}
