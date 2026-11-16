/**
 * Seule source des ProviderId envoyés à MB3M.
 * Export « Fournisseur » du compte TBA (Thomas Bolon) : ContactId = Uid API, Name.
 * 237 fournisseurs (la feuille va de A1 à E238, en-tête compris).
 * Pour mettre à jour le référentiel, remplacer `mb3m-verified-providers.json`.
 * L’ancien export `mb3m-providers.ts` ne fournit aucun Uid. Aucun fournisseur n’est créé.
 */
import providers from "@/lib/crm/mb3m-verified-providers.json";

export type Mb3mVerifiedProvider = { id: string; name: string; account: boolean };

export const MB3M_VERIFIED_PROVIDERS: readonly Mb3mVerifiedProvider[] = providers;

function foldVerifiedName(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Uid du référentiel TBA, ou null si ce nom n’y est pas. Un homonyme avec compte comptable l’emporte. */
export function mb3mVerifiedProviderId(name: string | null | undefined) {
  const key = foldVerifiedName(name);
  if (!key) return null;
  const hits = MB3M_VERIFIED_PROVIDERS.filter((row) => foldVerifiedName(row.name) === key);
  return (hits.find((row) => row.account) || hits[0])?.id ?? null;
}
