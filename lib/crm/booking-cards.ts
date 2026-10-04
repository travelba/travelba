import "server-only";

import { parisIsoDate } from "./hotel-arrival";
import { bookingCardValidity, manualStayCardDraft, sameCardNameCount } from "./manual-stay-card";
import { issuePliantCard, pliantConfigured } from "./pliant";

type Admin = { from: (table: string) => any };

export async function issueBookingCard(
  admin: Admin,
  input: { bookingId: string; amount: string; firstName: string; lastName: string }
) {
  const { data: bookingData } = await admin
    .from("crm_bookings")
    .select("id, end_date")
    .eq("id", input.bookingId)
    .maybeSingle();
  const booking = bookingData as { id: string; end_date: string | null } | null;
  if (!booking) throw new Error("Dossier introuvable.");

  const today = parisIsoDate(new Date());
  const window = bookingCardValidity(today, booking.end_date);
  const { data: priorData } = await admin
    .from("crm_booking_cards")
    .select("first_name, last_name")
    .eq("booking_id", input.bookingId);
  const prior = (priorData || []) as { first_name: string; last_name: string }[];
  const draft = manualStayCardDraft({
    amount: input.amount,
    firstName: input.firstName,
    lastName: input.lastName,
    validFrom: window.validFrom,
    validTo: window.validTo,
    organizationId: process.env.PLIANT_ORGANIZATION_ID || "",
    existingCards: sameCardNameCount(
      prior.map((row) => ({ firstName: row.first_name, lastName: row.last_name })),
      input.firstName,
      input.lastName
    ),
  });
  if ("error" in draft) throw new Error(draft.error);
  if (!pliantConfigured()) throw new Error("Pliant n'est pas branché.");

  const issued = await issuePliantCard(process.env.PLIANT_CARDHOLDER_ID || "", draft.body);
  if (!issued.cardId) throw new Error("Pliant n'a pas créé la carte.");

  const { error } = await admin.from("crm_booking_cards").insert({
    booking_id: input.bookingId,
    pliant_card_id: issued.cardId,
    label: draft.body.label,
    first_name: draft.body.customFirstName,
    last_name: draft.body.customLastName,
    limit_cents: draft.body.limit.value,
    currency: "EUR",
    valid_from: draft.body.validFrom,
    valid_to: draft.body.validTo,
  });
  if (error) throw new Error("La carte a été créée, mais le dossier ne l’a pas enregistrée.");
  return { ok: true as const };
}
