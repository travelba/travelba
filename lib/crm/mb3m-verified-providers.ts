/**
 * Seule source des ProviderId envoyés à MB3M.
 * Ces Uid ont été lus sur les factures du compte. L’export fournisseurs actuel
 * (`mb3m-providers.ts`) n’en contient aucun : il ne sert plus à l’envoi.
 * Pour brancher le vrai export Uid de Thomas Bolon, remplacer uniquement ce tableau
 * (même forme : id + name). La résolution par nom reste dans `mb3m-conform.ts`.
 */
export type Mb3mVerifiedProvider = { id: string; name: string };

export const MB3M_VERIFIED_PROVIDERS: readonly Mb3mVerifiedProvider[] = [
  { id: "aa8d41ef-4caf-4481-997e-d3bff7ca8e06", name: "TRANSAVIA" },
  { id: "85abcd27-fca7-4b39-a72a-f997678367a9", name: "LITTLE EMPERORS" },
  { id: "d128c2f9-c4b9-42ab-be1a-2218818d08ad", name: "EXPEDIA" },
  { id: "d3cc4238-69aa-49f8-abda-246fba252641", name: "VUELING" },
  { id: "e1a4c84e-4061-4cb0-8e6e-05fb4461327e", name: "AVIANCA" },
  { id: "e9c6fe94-6df3-4e54-91f1-201b2a778930", name: "DISTINCT DESTINATIONS" },
];

function foldVerifiedName(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Uid à envoyer, ou null si ce nom n’est pas dans la liste vérifiée. */
export function mb3mVerifiedProviderId(name: string | null | undefined) {
  const key = foldVerifiedName(name);
  if (!key) return null;
  return MB3M_VERIFIED_PROVIDERS.find((row) => foldVerifiedName(row.name) === key)?.id ?? null;
}
