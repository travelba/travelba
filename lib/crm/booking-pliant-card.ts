import { BOOKING_PLIANT_MAX_TX, bookingPliantCardSpec } from "./pliant-spend";

export type BookingPliantDb = {
  from: (table: string) => any;
};

export type BookingPliantCardResult =
  | {
      ok: true;
      issued: boolean;
      cardId: string;
      ceilingCents: number;
      last4: string | null;
      holderFirstName: string;
      holderLastName: string;
    }
  | { ok: false; error: string };

/** Une carte par dossier. Un second appel ne réémet pas : il change le plafond. */
export async function ensureBookingPliantCard(opts: {
  db: BookingPliantDb;
  bookingId: string;
  firstName: string;
  lastName: string;
  bookingReference: string;
  endDate?: string | null;
  ceilingCents: number;
  today: string;
  configured: boolean;
  organizationId: string;
  cardholderId: string;
  issue: (cardholderId: string, body: unknown) => Promise<{ cardId: string | null }>;
  updateLimit: (cardId: string, limit: { value: number; currency: string }, count: number) => Promise<void>;
  readLast4?: (cardId: string) => Promise<string | null>;
}): Promise<BookingPliantCardResult> {
  const spec = bookingPliantCardSpec({
    firstName: opts.firstName,
    lastName: opts.lastName,
    bookingReference: opts.bookingReference,
    ceilingCents: opts.ceilingCents,
    today: opts.today,
    endDate: opts.endDate,
    organizationId: opts.organizationId,
  });
  if (!spec) return { ok: false, error: "Le dossier n’a pas de prénom et de nom." };
  if (!opts.configured) return { ok: false, error: "Pliant n’est pas branché." };

  const { data } = await opts.db
    .from("crm_booking_pliant_cards")
    .select("pliant_card_id, card_last4")
    .eq("booking_id", opts.bookingId)
    .maybeSingle();
  const existing = data as { pliant_card_id?: string | null; card_last4?: string | null } | null;
  const limit = { value: opts.ceilingCents, currency: "EUR" };
  let cardId = existing?.pliant_card_id?.trim() || "";
  let issued = false;

  try {
    if (cardId) {
      await opts.updateLimit(cardId, limit, BOOKING_PLIANT_MAX_TX);
    } else {
      const created = await opts.issue(opts.cardholderId, spec.body);
      cardId = created.cardId?.trim() || "";
      issued = true;
    }
  } catch (err) {
    const message = err instanceof Error && err.message.startsWith("Pliant") ? err.message : "Pliant n’a pas créé la carte.";
    return { ok: false, error: message };
  }
  if (!cardId) return { ok: false, error: "Pliant n’a pas créé la carte." };

  let last4 = existing?.card_last4?.trim() || null;
  if (opts.readLast4 && !/^\d{4}$/.test(last4 || "")) {
    const read = await opts.readLast4(cardId);
    if (read && /^\d{4}$/.test(read)) last4 = read;
  }

  await opts.db.from("crm_booking_pliant_cards").upsert(
    {
      booking_id: opts.bookingId,
      pliant_card_id: cardId,
      ceiling_cents: opts.ceilingCents,
      currency: "EUR",
      holder_first_name: spec.holderFirstName,
      holder_last_name: spec.holderLastName,
      card_last4: last4,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "booking_id" }
  );

  return {
    ok: true,
    issued,
    cardId,
    ceilingCents: opts.ceilingCents,
    last4,
    holderFirstName: spec.holderFirstName,
    holderLastName: spec.holderLastName,
  };
}
