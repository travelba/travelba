export function formatMoney(amount: number, currency = "EUR") {
  return amount.toLocaleString("fr-FR", {
    style: "currency",
    currency: currency || "EUR",
  });
}

export function formatDateFr(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("fr-FR", { dateStyle: "medium" });
}

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function isUpcomingBooking(endDate: string | null) {
  if (!endDate) return true;
  return endDate >= todayIsoDate();
}
