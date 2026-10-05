import "server-only";

import { parisIsoDate } from "./hotel-arrival";
import { bookingCardValidity, manualStayCardBody, sameCardNameCount } from "./manual-stay-card";
import { issuePliantCard, pliantAccountCeilingCents, pliantConfigured } from "./pliant";
import type { Db } from "../supabase/db";

type Admin = Db;

export async function issueBookingCard(
  admin: Admin,
  input: { bookingId: string; firstName: string; lastName: string }
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
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName) throw new Error("Indiquez le nom et le prénom.");
  if (!pliantConfigured()) throw new Error("Pliant n'est pas branché.");
  const organizationId = process.env.PLIANT_ORGANIZATION_ID || "";
  const limitCents = await pliantAccountCeilingCents(organizationId);
  const body = manualStayCardBody({
    firstName,
    lastName,
    limitCents,
    validFrom: window.validFrom,
    validTo: window.validTo,
    organizationId,
    existingCards: sameCardNameCount(
      prior.map((row) => ({ firstName: row.first_name, lastName: row.last_name })),
      firstName,
      lastName
    ),
  });

  const issued = await issuePliantCard(process.env.PLIANT_CARDHOLDER_ID || "", body);
  if (!issued.cardId) throw new Error("Pliant n'a pas créé la carte.");

  const { error } = await admin.from("crm_booking_cards").insert({
    booking_id: input.bookingId,
    pliant_card_id: issued.cardId,
    label: body.label,
    first_name: body.customFirstName,
    last_name: body.customLastName,
    limit_cents: body.limit.value,
    currency: "EUR",
    valid_from: body.validFrom,
    valid_to: body.validTo,
  });
  if (error) throw new Error("La carte a été créée, mais le dossier ne l’a pas enregistrée.");
  return { ok: true as const };
}
