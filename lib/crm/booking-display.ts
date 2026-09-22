import type { CrmBookingItem } from "@/lib/crm/types";
import { formatDateFr, formatDateTimeFr } from "@/lib/crm/money";

function detail(item: CrmBookingItem, key: string) {
  const value = item.details?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export function itemWhen(item: CrmBookingItem) {
  return formatDateTimeFr(item.start_at) || formatDateFr(item.start_at);
}

export function itemDetailsLine(item: CrmBookingItem) {
  const parts: string[] = [];
  if (item.kind === "flight" || item.kind === "rail") {
    const route =
      detail(item, "from") && detail(item, "to")
        ? `${detail(item, "from")} → ${detail(item, "to")}`
        : "";
    parts.push(detail(item, "flight_number"), route, detail(item, "cabin"));
  }
  if (item.kind === "hotel") {
    parts.push(detail(item, "hotel_name") || item.supplier || "", detail(item, "room"));
  }
  if (item.kind === "transfer") {
    const route =
      detail(item, "pickup") && detail(item, "dropoff")
        ? `${detail(item, "pickup")} → ${detail(item, "dropoff")}`
        : "";
    parts.push(route);
  }
  if (item.kind === "insurance") {
    parts.push(detail(item, "policy_number"));
  }
  const pnr = item.confirmation_ref || detail(item, "pnr");
  if (pnr) parts.push(`Réf. ${pnr}`);
  else if (item.supplier) parts.push(item.supplier);
  const notes = detail(item, "notes");
  if (notes) parts.push(notes);
  return parts.filter(Boolean).join(" · ");
}
