import { isActiveItem } from "@/lib/crm/types";
import { isAutoTicketingExpense } from "@/lib/crm/ticketing-fee";

export function isInheritedTicketingFee(item: {
  kind?: string | null;
  details?: Record<string, unknown> | null;
  lifecycle?: string | null;
}) {
  return isAutoTicketingExpense(item) && isActiveItem(item) && item.lifecycle !== "removed";
}

export function ticketingFeeKept(details: Record<string, unknown> | null | undefined) {
  return details?.fee_kept === true;
}

/** Lignes automatiques encore au dossier. Chacune se garde ou se retire seule. */
export function inheritedTicketingFees<
  T extends { kind?: string | null; details?: Record<string, unknown> | null; lifecycle?: string | null },
>(items: T[]) {
  return items.filter(isInheritedTicketingFee);
}
