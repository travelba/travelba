import { PliantAccountBalanceCard } from "@/components/admin/PliantCardDesk";
import { loadPliantAccountBalance, pliantConfigured } from "@/lib/crm/pliant";

/** Solde du compte Pliant, hors du chemin qui peint le dossier. */
export async function DossierPliantBalance() {
  if (!pliantConfigured()) return <PliantAccountBalanceCard account={null} />;
  const account = await Promise.race([
    loadPliantAccountBalance(),
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 12_000);
    }),
  ]);
  return <PliantAccountBalanceCard account={account} />;
}
