/**
 * Fournisseur affiché sur une carte hôtel sans nom.
 * Même libellé que `MB3M_HOTEL_DIVERS_PROVIDER_NAME` (référentiel TBA,
 * Uid 013428ca-a71c-4d2a-90a7-75c279281f82). Rien n’est écrit tant que
 * l’agence ne choisit pas un autre nom.
 */
export const HOTEL_CARD_DEFAULT_SUPPLIER = "Hôtel Divers";

export function hotelSupplierFieldValue(kind: string | null | undefined, supplier: string | null | undefined) {
  if (kind !== "hotel") return supplier || "";
  const named = (supplier || "").trim();
  return named || HOTEL_CARD_DEFAULT_SUPPLIER;
}

/** Le défaut reste vide en base : une carte sans fournisseur n’est pas réécrite. */
export function hotelSupplierToStore(kind: string | null | undefined, supplier: string) {
  if (kind !== "hotel") return supplier;
  return supplier.trim() === HOTEL_CARD_DEFAULT_SUPPLIER ? "" : supplier;
}
