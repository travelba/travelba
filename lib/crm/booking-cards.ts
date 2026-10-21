import "server-only";

import { hotelDisplayName } from "./carnet";
import { pliantDesignation } from "./eta-il-fee";
import { parisIsoDate } from "./hotel-arrival";
import { bookingCardValidity, manualStayCardDraft, sameCardNameCount } from "./manual-stay-card";
import { rememberPliantCard } from "./pliant-card-run";
import { isActiveItem, type CrmBookingItem } from "./types";
import {
  issuePliantCard,
  lockPliantCard,
  pliantConfigured,
  readPliantCardFace,
  terminatePliantCard,
  unlockPliantCard,
} from "./pliant";
import type { Db } from "../supabase/db";

type Admin = Db;

export async function issueBookingCard(
  admin: Admin,
  input: {
    bookingId: string;
    amount: string;
    firstName: string;
    lastName: string;
    designation?: string | null;
    transactionAmount?: string;
    transactionCount?: string;
  }
) {
  const { data: bookingData } = await admin
    .from("crm_bookings")
    .select("id, end_date, customer_id, reference")
    .eq("id", input.bookingId)
    .maybeSingle();
  const booking = bookingData as { id: string; end_date: string | null; customer_id: string | null; reference: string | null } | null;
  if (!booking) throw new Error("Dossier introuvable.");

  if (!pliantDesignation(input.designation)) throw new Error("Indiquez le nom de la carte.");

  const today = parisIsoDate(new Date());
  const window = bookingCardValidity(today, booking.end_date);
  const [{ data: priorData }, { data: customerData }, { data: itemData }] = await Promise.all([
    admin.from("crm_booking_cards").select("first_name, last_name").eq("booking_id", input.bookingId),
    booking.customer_id
      ? admin.from("crm_customers").select("last_name").eq("id", booking.customer_id).maybeSingle()
      : Promise.resolve({ data: null as { last_name?: string | null } | null }),
    admin.from("crm_booking_items").select("kind, title, supplier, details, lifecycle").eq("booking_id", input.bookingId),
  ]);
  const prior = (priorData || []) as { first_name: string; last_name: string }[];
  const hotels = ((itemData || []) as Pick<CrmBookingItem, "kind" | "title" | "supplier" | "details" | "lifecycle">[])
    .filter((item) => item.kind === "hotel" && isActiveItem(item))
    .map((item) => hotelDisplayName(item as CrmBookingItem));
  const draft = manualStayCardDraft({
    amount: input.amount,
    firstName: input.firstName,
    lastName: input.lastName,
    validFrom: window.validFrom,
    validTo: window.validTo,
    organizationId: process.env.PLIANT_ORGANIZATION_ID || "",
    designation: input.designation,
    client: (customerData as { last_name?: string | null } | null)?.last_name || input.lastName,
    hotels,
    reference: booking.reference,
    transactionAmount: input.transactionAmount ?? "",
    transactionCount: input.transactionCount ?? "",
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
  const last4 = (await readPliantCardFace(issued.cardId)).last4;

  const { error } = await admin.from("crm_booking_cards").insert({
    booking_id: input.bookingId,
    pliant_card_id: issued.cardId,
    label: draft.body.label,
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
    limit_cents: draft.body.limit.value,
    transaction_limit_cents: draft.body.transactionLimit.value,
    max_transaction_count: null,
    currency: "EUR",
    valid_from: draft.body.validFrom,
    valid_to: draft.body.validTo,
    last4,
  });
  if (error) throw new Error("La carte a été créée, mais le dossier ne l’a pas enregistrée.");
  await rememberPliantCard(admin, {
    pliant_card_id: issued.cardId,
    booking_id: input.bookingId,
    customer_id: booking.customer_id,
    label: draft.body.label,
    last4,
    limit_cents: draft.body.limit.value,
    currency: "EUR",
    status: "active",
    limit_manual: true,
    transaction_limit_cents: draft.body.transactionLimit.value,
    max_transaction_count: null,
  });
  return { ok: true as const };
}

async function bookingCardRow(admin: Admin, bookingId: string, cardRowId: string) {
  const { data } = await admin
    .from("crm_booking_cards")
    .select("id, pliant_card_id, status")
    .eq("booking_id", bookingId)
    .eq("id", cardRowId)
    .maybeSingle();
  const row = data as { id: string; pliant_card_id: string; status?: string | null } | null;
  if (!row?.pliant_card_id) throw new Error("Carte introuvable.");
  if (row.status === "terminated") throw new Error("Cette carte est déjà supprimée.");
  return row;
}

export async function setBookingCardLocked(admin: Admin, bookingId: string, cardRowId: string, locked: boolean) {
  if (!pliantConfigured()) throw new Error("Pliant n'est pas branché.");
  const row = await bookingCardRow(admin, bookingId, cardRowId);
  if (locked) await lockPliantCard(row.pliant_card_id);
  else await unlockPliantCard(row.pliant_card_id);
  const { error } = await admin
    .from("crm_booking_cards")
    .update({ status: locked ? "locked" : "active" })
    .eq("id", row.id)
    .eq("booking_id", bookingId);
  if (error) throw new Error("Pliant a répondu, mais le dossier n’a pas enregistré le blocage.");
  await rememberPliantCard(admin, {
    pliant_card_id: row.pliant_card_id,
    booking_id: bookingId,
    status: locked ? "locked" : "active",
  });
}

export async function terminateBookingCard(admin: Admin, bookingId: string, cardRowId: string) {
  if (!pliantConfigured()) throw new Error("Pliant n'est pas branché.");
  const row = await bookingCardRow(admin, bookingId, cardRowId);
  await terminatePliantCard(row.pliant_card_id);
  const { error } = await admin
    .from("crm_booking_cards")
    .update({ status: "terminated" })
    .eq("id", row.id)
    .eq("booking_id", bookingId);
  if (error) throw new Error("Pliant a supprimé la carte, mais le dossier la montre encore.");
}
