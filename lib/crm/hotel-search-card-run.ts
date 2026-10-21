import "server-only";

import { parisTodayIso } from "./dates";
import { hotelSearchCardDraft } from "./hotel-search-card";
import { rememberPliantCard } from "./pliant-card-run";
import { issuePliantCard, lockPliantCard, pliantConfigured, readPliantCardFace } from "./pliant";
import { hotelSearchAdmin, markHotelRequest, readHotelRequest } from "./hotel-search-store";

function referenceFor(id: string) {
  return `HS-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export async function issueHotelSearchCard(input: { requestId: string; staffId: string }) {
  const sandbox = process.env.PLIANT_SANDBOX === "1";
  const row = await readHotelRequest(input.requestId);
  if (!row) return { ok: false as const, message: "Demande introuvable." };
  if (row.status === "issued" || row.status === "locked") {
    return { ok: false as const, message: "La carte est déjà émise." };
  }
  if (row.status !== "pending") return { ok: false as const, message: "Cette demande n’est plus à valider." };
  const db = hotelSearchAdmin();
  const { data: customer } = await db
    .from("crm_customers")
    .select("first_name, last_name")
    .eq("id", row.customer_id)
    .maybeSingle();
  const person = (customer as { first_name?: string; last_name?: string } | null) || {};
  const firstName = person.first_name || "";
  const lastName = person.last_name || "";
  const draft = hotelSearchCardDraft({
    sandbox,
    configured: pliantConfigured(),
    firstName,
    lastName,
    hotelName: row.hotel_name,
    clientName: `${firstName} ${lastName}`.trim(),
    reference: referenceFor(row.id),
    sellCents: row.sell_cents,
    currency: row.currency,
    checkOut: row.check_out,
    today: parisTodayIso(),
    organizationId: process.env.PLIANT_ORGANIZATION_ID || "",
  });
  if (!draft.ok) return draft;
  let cardId: string | null = null;
  try {
    const issued = await issuePliantCard(process.env.PLIANT_CARDHOLDER_ID || "", draft.body);
    cardId = issued.cardId;
  } catch (err) {
    console.error("[hotels] carte", err instanceof Error ? "refus" : "échec");
    return { ok: false as const, message: "La carte n’a pas été émise." };
  }
  if (!cardId) return { ok: false as const, message: "La carte n’a pas été émise." };
  let last4: string | null = null;
  try {
    last4 = (await readPliantCardFace(cardId)).last4;
  } catch {
    last4 = null;
  }
  await rememberPliantCard(db, {
    pliant_card_id: cardId,
    customer_id: row.customer_id,
    booking_id: null,
    label: typeof draft.body.label === "string" ? draft.body.label : null,
    last4,
    limit_cents: row.sell_cents,
    currency: "EUR",
    status: "active",
    limit_manual: true,
    transaction_limit_cents: row.sell_cents,
    max_transaction_count: null,
    note: "Recherche hôtel test",
  });
  const saved = await markHotelRequest(
    row.id,
    {
      status: "issued",
      pliant_card_id: cardId,
      validated_by: input.staffId,
      validated_at: new Date().toISOString(),
    },
    db
  );
  if (!saved) return { ok: false as const, message: "La carte est émise, le suivi n’a pas été enregistré." };
  return { ok: true as const, message: "Carte test émise. Aucun débit n’est lancé." };
}

export async function refuseHotelSearchRequest(input: { requestId: string; staffId: string }) {
  const row = await readHotelRequest(input.requestId);
  if (!row) return { ok: false as const, message: "Demande introuvable." };
  if (row.status !== "pending") return { ok: false as const, message: "Cette demande n’est plus à valider." };
  const saved = await markHotelRequest(row.id, {
    status: "refused",
    validated_by: input.staffId,
    validated_at: new Date().toISOString(),
  });
  if (!saved) return { ok: false as const, message: "Le refus n’a pas été enregistré." };
  return { ok: true as const, message: "Demande refusée. Aucune carte." };
}

export async function lockHotelSearchCard(input: { requestId: string }) {
  const row = await readHotelRequest(input.requestId);
  if (!row) return { ok: false as const, message: "Demande introuvable." };
  if (row.status === "locked") return { ok: true as const, message: "La carte est déjà bloquée." };
  if (row.status !== "issued" || !row.pliant_card_id) {
    return { ok: false as const, message: "Aucune carte à bloquer." };
  }
  if (process.env.PLIANT_SANDBOX !== "1") {
    return { ok: false as const, message: "Le blocage test attend le mode Pliant sandbox." };
  }
  try {
    await lockPliantCard(row.pliant_card_id);
  } catch {
    console.error("[hotels] blocage", "refus");
    return { ok: false as const, message: "La carte n’a pas pu être bloquée." };
  }
  const db = hotelSearchAdmin();
  await rememberPliantCard(db, {
    pliant_card_id: row.pliant_card_id,
    status: "locked",
    customer_id: row.customer_id,
    limit_manual: true,
  });
  const saved = await markHotelRequest(row.id, { status: "locked", locked_at: new Date().toISOString() }, db);
  if (!saved) return { ok: false as const, message: "La carte est bloquée, le suivi n’a pas été enregistré." };
  return { ok: true as const, message: "Carte bloquée." };
}
