/** Soldes des comptes agence (Revolut, Stripe, Pliant). Montants en unité majeure. */

export type AccountPocket = {
  /** Nom de poche. Absent quand le compte n’en a qu’une. */
  name: string | null;
  /** Null = lecture impossible. Zéro est un solde réel. */
  amount: number | null;
  currency: string;
  /** Stripe : argent pas encore versé. */
  pending: number | null;
};

function unavailable(): AccountPocket[] {
  return [{ name: null, amount: null, currency: "EUR", pending: null }];
}

const ZERO_DECIMAL = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf",
]);

const THREE_DECIMAL = new Set(["bhd", "jod", "kwd", "omr", "tnd"]);

export function stripeMinorToMajor(amount: number, currency: string) {
  const code = currency.toLowerCase();
  const scale = ZERO_DECIMAL.has(code) ? 1 : THREE_DECIMAL.has(code) ? 1000 : 100;
  return amount / scale;
}

function moneyRows(rows: unknown) {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const rec = row as { amount?: unknown; currency?: unknown };
    const amount = typeof rec.amount === "number" ? rec.amount : Number(rec.amount);
    const currency = typeof rec.currency === "string" ? rec.currency.toUpperCase() : "";
    if (!Number.isFinite(amount) || !/^[A-Z]{3}$/.test(currency)) return [];
    return [{ amount, currency }];
  });
}

function sumByCurrency(rows: { amount: number; currency: string }[]) {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.currency, (totals.get(row.currency) || 0) + row.amount);
  return totals;
}

/** Disponible Stripe (centimes) et attente de versement. Null = lecture impossible. */
export function stripeBalancePockets(balance: { available?: unknown; pending?: unknown } | null): AccountPocket[] {
  if (!balance) return unavailable();
  const available = sumByCurrency(moneyRows(balance.available));
  const pending = sumByCurrency(moneyRows(balance.pending));
  const currencies = [...new Set([...available.keys(), ...pending.keys()])].sort((a, b) => {
    if (a === "EUR") return -1;
    if (b === "EUR") return 1;
    return a.localeCompare(b);
  });
  if (!currencies.length) return [{ name: null, amount: 0, currency: "EUR", pending: null }];
  const several = currencies.length > 1;
  return currencies.map((currency) => {
    const waiting = pending.get(currency) || 0;
    return {
      name: several ? currency : null,
      amount: stripeMinorToMajor(available.get(currency) || 0, currency),
      currency,
      pending: waiting === 0 ? null : stripeMinorToMajor(waiting, currency),
    };
  });
}

type RevolutPocketInput = {
  name?: string;
  currency?: string;
  state?: string;
  balance?: number | string;
};

/** Comptes Revolut actifs. Le solde est déjà en euros. Inactif ou illisible : ignoré. */
export function revolutBalancePockets(accounts: RevolutPocketInput[]): AccountPocket[] {
  const pockets = accounts.flatMap((account) => {
    if ((account.state || "active") !== "active") return [];
    const currency = (account.currency || "").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) return [];
    const raw = account.balance;
    const amount = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : Number.NaN;
    if (!Number.isFinite(amount)) return [];
    const name = (account.name || "").trim();
    return [{ name: name || null, amount, currency, pending: null }];
  });
  pockets.sort((a, b) => {
    if (a.currency === "EUR" && b.currency !== "EUR") return -1;
    if (b.currency === "EUR" && a.currency !== "EUR") return 1;
    const aMain = (a.name || "").toLowerCase() === "main" ? 0 : 1;
    const bMain = (b.name || "").toLowerCase() === "main" ? 0 : 1;
    if (aMain !== bMain) return aMain - bMain;
    return (a.name || "").localeCompare(b.name || "", "fr");
  });
  if (!pockets.length) return unavailable();
  if (pockets.length === 1) return [{ ...pockets[0], name: null }];
  return pockets.map((pocket) => ({ ...pocket, name: pocket.name || pocket.currency }));
}

/** Plafond disponible Pliant, en centimes. */
export function pliantBalancePocket(account: { availableCents: number | null; currency: string } | null): AccountPocket[] {
  if (!account || account.availableCents == null) return unavailable();
  return [
    {
      name: null,
      amount: account.availableCents / 100,
      currency: (account.currency || "EUR").toUpperCase(),
      pending: null,
    },
  ];
}
