/** Adresse d’une boîte Travel BA ou Travel BT. Ce n’est pas l’e-mail d’un client. */
export function isAgencyCustomerEmail(email: string | null | undefined) {
  const value = (email || "").trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at < 1) return false;
  const domain = value.slice(at + 1);
  return (
    domain === "travelba.fr" ||
    domain.endsWith(".travelba.fr") ||
    domain === "travelbt.fr" ||
    domain.endsWith(".travelbt.fr")
  );
}
