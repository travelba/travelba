import "server-only";

import { pliantBalancePocket, type AccountPocket } from "@/lib/crm/account-balances";
import { loadPliantAccountBalance, pliantConfigured } from "@/lib/crm/pliant";
import { loadRevolutAccountBalances } from "@/lib/crm/revolut";
import { loadStripeAccountBalance } from "@/lib/crm/stripe";

export type AgencyAccount = {
  id: "revolut" | "stripe" | "pliant";
  label: string;
  href: string;
  pockets: AccountPocket[];
};

const WAIT_MS = 12_000;

function unavailable(): AccountPocket[] {
  return [{ name: null, amount: null, currency: "EUR", pending: null }];
}

function bounded<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), WAIT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
}

/** Revolut, Stripe, Pliant. Un compte fermé n’apparaît pas. Un appel trop long devient indisponible. */
export async function loadAgencyAccounts(): Promise<AgencyAccount[]> {
  const [revolut, stripe, pliant] = await Promise.all([
    bounded(loadRevolutAccountBalances(), unavailable()),
    bounded(loadStripeAccountBalance(), unavailable()),
    pliantConfigured()
      ? bounded(loadPliantAccountBalance(), { availableCents: null as number | null, currency: "EUR" })
      : Promise.resolve(null),
  ]);
  const accounts: AgencyAccount[] = [];
  if (revolut) accounts.push({ id: "revolut", label: "Revolut", href: "/admin/revolut", pockets: revolut });
  if (stripe) accounts.push({ id: "stripe", label: "Stripe", href: "/admin/stripe", pockets: stripe });
  if (pliant) {
    accounts.push({ id: "pliant", label: "Pliant", href: "/admin/pliant", pockets: pliantBalancePocket(pliant) });
  }
  return accounts;
}
