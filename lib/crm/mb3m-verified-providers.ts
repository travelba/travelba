/**
 * Seule source des ProviderId envoyés à MB3M.
 * La table est `mb3m-verified-providers.json` : export Fournisseur du compte TBA
 * (Thomas Bolon), ContactId = Uid API, Name. 237 fournisseurs.
 * L’ancien export `mb3m-providers.ts` ne fournit aucun Uid. Aucun fournisseur n’est créé.
 * Un code IATA (AF) retrouve le nom de la compagnie dans cette table.
 */
import { MB3M_AIRLINE_PROVIDERS, MB3M_PROVIDERS } from "@/lib/crm/mb3m-providers";
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

const idByFoldedName = new Map<string, string>();
for (const row of MB3M_VERIFIED_PROVIDERS) {
  const key = foldVerifiedName(row.name);
  const current = idByFoldedName.get(key);
  if (!current || row.account) idByFoldedName.set(key, row.id);
}

const oldNameById = new Map(MB3M_PROVIDERS.map((row) => [row.id, row.name]));
/** Code IATA → Uid TBA, quand le nom de la compagnie est dans le référentiel. */
const idByIata = new Map<string, string>();
for (const [iata, oldId] of Object.entries(MB3M_AIRLINE_PROVIDERS)) {
  const name = oldNameById.get(oldId);
  const id = name ? idByFoldedName.get(foldVerifiedName(name)) : undefined;
  if (id) idByIata.set(iata.toLowerCase(), id);
}

/** Uid du référentiel TBA, ou null. Nom sans casse ni accent, ou code IATA. Un homonyme avec compte comptable l’emporte. */
export function mb3mVerifiedProviderId(name: string | null | undefined) {
  const key = foldVerifiedName(name);
  if (!key) return null;
  const named = idByFoldedName.get(key);
  if (named) return named;
  if (/^[a-z0-9]{2}$/.test(key)) return idByIata.get(key) ?? null;
  return null;
}
