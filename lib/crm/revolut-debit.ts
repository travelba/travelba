import { formatDateFr } from "./dates";
import { staffStayLabel } from "./staff-stay";

/** Réservation du client voyageur ou du compte qui règle. */
export function bookingBelongsToCustomer(
  booking: { customer_id: string; billing_customer_id?: string | null },
  customerId: string
) {
  if (!customerId) return false;
  return booking.customer_id === customerId || booking.billing_customer_id === customerId;
}

export type ExpenseBookingRow = {
  id: string;
  customer_id: string;
  billing_customer_id?: string | null;
  start_date?: string | null;
};

/** Dossiers du client, sans doublon, le plus récent d’abord. */
export function bookingsForExpenseMatch<T extends ExpenseBookingRow>(rows: T[], customerId: string) {
  const seen = new Set<string>();
  return rows
    .filter((row) => {
      if (!bookingBelongsToCustomer(row, customerId) || seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    })
    .sort((a, b) => {
      const left = a.start_date || "";
      const right = b.start_date || "";
      if (left === right) return 0;
      if (!left) return 1;
      if (!right) return -1;
      return right.localeCompare(left);
    });
}

export function revolutBookingPickLabel(booking: {
  reference: string;
  title?: string | null;
  destination?: string | null;
  start_date?: string | null;
  archived_at?: string | null;
  visible_to_client?: boolean | null;
}) {
  const place = (booking.title || booking.destination || "Voyage").trim() || "Voyage";
  const when = booking.start_date ? formatDateFr(booking.start_date) : "";
  return [booking.reference, place, when, staffStayLabel(booking)].filter(Boolean).join(" · ");
}

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function filterBookingChoices<T extends { label: string; reference: string }>(rows: T[], query: string) {
  const needles = fold(query.trim()).split(/\s+/).filter(Boolean);
  if (!needles.length) return rows;
  return rows.filter((row) => {
    const hay = fold(`${row.reference} ${row.label}`);
    return needles.every((part) => hay.includes(part));
  });
}

export function revolutExpenseError(code: string) {
  switch (code) {
    case "already_matched":
      return "Déjà rapprochée";
    case "not_a_debit":
      return "Le rapprochement d’une dépense ne porte que sur les sorties.";
    case "booking_not_found":
      return "Réservation introuvable.";
    case "booking_not_for_customer":
      return "Cette réservation n’est pas à ce client.";
    case "customer_not_found":
      return "Client introuvable.";
    case "refused":
      return "Cette sortie a été refusée.";
    default:
      return "Rapprochement impossible. Réessayez.";
  }
}

export type RevolutExpenseRow = {
  id: string;
  direction?: string | null;
  status: string;
  matched_booking_id?: string | null;
  settled_at?: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DebitAdmin = { from: (table: string) => any };

/**
 * Rattache une sortie au client et au dossier. N’écrit aucune ligne du grand livre.
 * Le montant Revolut reste un coût d’agence, pas un prix vendu.
 */
export async function applyRevolutExpense(
  admin: DebitAdmin,
  row: RevolutExpenseRow,
  customerId: string,
  bookingId: string
) {
  if (row.direction !== "debit") return { ok: false as const, error: "not_a_debit" as const };
  if (row.status === "matched" || row.matched_booking_id) {
    return { ok: false as const, error: "already_matched" as const };
  }
  if (row.status === "ignored" && row.settled_at) {
    return { ok: false as const, error: "refused" as const };
  }
  if (row.status !== "unmatched" && row.status !== "ignored") {
    return { ok: false as const, error: "already_matched" as const };
  }
  if (!customerId || !bookingId) return { ok: false as const, error: "booking_required" as const };

  const { data: customer, error: customerError } = await admin
    .from("crm_customers")
    .select("id")
    .eq("id", customerId)
    .maybeSingle();
  if (customerError || !customer) return { ok: false as const, error: "customer_not_found" as const };

  const { data: booking, error: bookingError } = await admin
    .from("crm_bookings")
    .select("id, reference, title, customer_id, billing_customer_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError || !booking) return { ok: false as const, error: "booking_not_found" as const };
  if (!bookingBelongsToCustomer(booking, customerId)) {
    return { ok: false as const, error: "booking_not_for_customer" as const };
  }

  const { data: updated, error: updateError } = await admin
    .from("crm_revolut_transactions")
    .update({
      status: "matched",
      matched_customer_id: customerId,
      matched_booking_id: bookingId,
      matched_transaction_id: null,
      settled_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("direction", "debit")
    .in("status", ["unmatched", "ignored"])
    .is("matched_booking_id", null)
    .select("id")
    .maybeSingle();
  if (updateError || !updated) return { ok: false as const, error: "already_matched" as const };

  return {
    ok: true as const,
    reference: String(booking.reference || ""),
    title: typeof booking.title === "string" ? booking.title : "",
  };
}

/** Remet dans la file les sorties que l’ancien import avait écartées sans clic, et répare un statut écrasé. */
export async function repairRevolutDebitQueue(admin: DebitAdmin) {
  const matched = await admin
    .from("crm_revolut_transactions")
    .update({ status: "matched" })
    .eq("direction", "debit")
    .eq("status", "ignored")
    .not("matched_booking_id", "is", null);
  if (matched?.error) throw new Error("File des débits indisponible.");
  const opened = await admin
    .from("crm_revolut_transactions")
    .update({ status: "unmatched" })
    .eq("direction", "debit")
    .eq("status", "ignored")
    .is("settled_at", null)
    .is("matched_booking_id", null)
    .is("matched_customer_id", null);
  if (opened?.error) throw new Error("File des débits indisponible.");
}
