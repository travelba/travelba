/** File Fournisseurs : unmatched, sans dossier, et pas une annulation orpheline. */
export function leStaysInSupplierQueue(row: {
  crm_booking_id?: string | null;
  status?: string | null;
  state?: string | null;
}) {
  if (row.crm_booking_id) return false;
  if ((row.status || "") !== "unmatched") return false;
  const state = (row.state || "")
    .trim()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  if (state === "cancelled" || state === "canceled" || state === "annulee" || state === "annule") return false;
  return true;
}
