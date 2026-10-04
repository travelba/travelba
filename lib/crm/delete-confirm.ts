/** La suppression d’un client exige la saisie de son nom complet (casse, espaces et accents indifférents). */
export const DELETE_CUSTOMER_CONFIRM_ERROR = "Saisissez le nom du client pour confirmer";

function foldName(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Vrai si la saisie désigne bien ce client. Un nom vide ne confirme jamais. */
export function customerDeleteConfirmed(input: unknown, fullName: string) {
  const expected = foldName(fullName);
  if (!expected) return false;
  return foldName(input) === expected;
}
