import type { EurFx } from "./visa-fees";

/** Compte carte Pliant. La devise du plafond doit être celle du compte. */
export type PliantAccount = {
  id: string;
  currency: string;
  status: string;
  defaultAccount?: boolean;
};

const INTO_EUR = new Set(["USD", "GBP", "ILS"]);

export function pickCardAccount(accounts: PliantAccount[], currency: string): PliantAccount | null {
  const active = accounts.filter((row) => row.status === "ACTIVE" && row.id && row.currency);
  const wanted = currency.trim().toUpperCase();
  const same = active.find((row) => row.currency.toUpperCase() === wanted);
  if (same) return same;
  return active.find((row) => row.defaultAccount) || active[0] || null;
}

/** Garde la devise si le compte la porte. Sinon convertit vers l’euro, au centime supérieur. */
export function limitForAccount(
  cents: number,
  currency: string,
  accountCurrency: string,
  rates: EurFx
): { value: number; currency: string } | null {
  if (!(cents > 0) || !Number.isFinite(cents)) return null;
  const from = currency.trim().toUpperCase();
  const to = accountCurrency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) return null;
  if (from === to) return { value: Math.round(cents), currency: to };
  if (to !== "EUR" || !INTO_EUR.has(from)) return null;
  const units = rates[from as "USD" | "GBP" | "ILS"];
  if (!(units > 0)) return null;
  return { value: Math.ceil(cents / units), currency: "EUR" };
}

export function settlePliantLimit(input: {
  cents: number;
  currency: string;
  accounts: PliantAccount[];
  rates: EurFx;
}): { value: number; currency: string; cardAccountId: string | null } | null {
  const account = pickCardAccount(input.accounts, input.currency);
  const money = limitForAccount(input.cents, input.currency, account?.currency || "EUR", input.rates);
  if (!money) return null;
  return { ...money, cardAccountId: account?.id || null };
}
