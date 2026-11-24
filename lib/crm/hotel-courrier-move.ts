import type { SupabaseClient } from "@supabase/supabase-js";
import { recordAgencyJournal } from "./agency-log";
import { hotelReplyForDesk } from "./hotel-desk";
import { noticeHotelName } from "./hotel-reply-notice";
import { McpWriteError } from "./mcp-write";
import { fold } from "./text";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type HotelMailMoveMessage = {
  id: string;
  bookingId: string;
  bookingItemId: string;
  gmailThreadId: string | null;
  subject: string;
  body: string;
  receivedAt: string;
  direction: "in" | "out";
  requestId: string | null;
};

export type HotelMailMoveCard = {
  id: string;
  bookingId: string;
  kind: string;
  name: string;
};

export type HotelMailMoveRequest = {
  id: string;
  bookingItemId: string;
  kind: string;
};

export type HotelMailMovePlan = {
  apercu: true;
  ecrit: false;
  email_envoye: false;
  visible_to_client: "inchange";
  de: { carte_id: string; hotel: string };
  vers: { carte_id: string; hotel: string };
  courrier_cible: string | null;
  fil: boolean;
  messages: { id: string; recu_le: string; sujet: string; extrait: string; direction: "in" | "out" }[];
};

function textOf(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function excerpt(body: string) {
  const useful = hotelReplyForDesk(body).replace(/\s+/g, " ").trim();
  if (useful.length <= 180) return useful;
  return `${useful.slice(0, 179).trimEnd()}…`;
}

/**
 * Décide quels messages passent d’une carte hôtel à une autre du même dossier.
 * N’écrit rien. Ne choisit pas visible_to_client.
 */
export function planHotelCourrierMove(input: {
  messages: HotelMailMoveMessage[];
  cards: HotelMailMoveCard[];
  requests: HotelMailMoveRequest[];
  messageId?: string;
  extrait?: string;
  carteCible: string;
  fil?: boolean;
}): HotelMailMovePlan {
  const target = input.cards.find((card) => card.id === input.carteCible);
  if (!target || target.kind !== "hotel") throw new McpWriteError("La carte cible n’est pas un hôtel de ce dossier.");
  const needle = fold(input.extrait || "");
  const messageId = (input.messageId || "").trim();
  let anchor: HotelMailMoveMessage | undefined;
  if (messageId) {
    anchor = input.messages.find((row) => row.id === messageId);
  } else {
    if (needle.length < 12) throw new McpWriteError("Indiquez le message ou un extrait du courrier.");
    const hits = input.messages.filter((row) => fold(row.body).includes(needle));
    if (hits.length > 1) throw new McpWriteError("Plusieurs messages correspondent. Indiquez le message.");
    anchor = hits[0];
  }
  if (!anchor) throw new McpWriteError("Message introuvable sur ce dossier.");
  if (anchor.bookingId !== target.bookingId) throw new McpWriteError("Le courrier reste dans le même dossier.");
  const source = input.cards.find((card) => card.id === anchor.bookingItemId);
  if (!source || source.kind !== "hotel") throw new McpWriteError("Le message n’est pas sur une carte hôtel.");
  if (source.id === target.id) throw new McpWriteError("Ce message est déjà sur cette carte.");

  let rows = [anchor];
  const threadId = (anchor.gmailThreadId || "").trim();
  if (input.fil && threadId) {
    rows = input.messages.filter((row) => row.bookingItemId === source.id && row.gmailThreadId === threadId);
    if (!rows.some((row) => row.id === anchor.id)) rows = [anchor, ...rows];
  }
  rows.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.id.localeCompare(b.id));

  const sourceRequest = anchor.requestId ? input.requests.find((row) => row.id === anchor.requestId) : undefined;
  const sameKind = sourceRequest
    ? input.requests.filter((row) => row.bookingItemId === target.id && row.kind === sourceRequest.kind)
    : [];
  const courrierCible = sameKind.length === 1 ? sameKind[0].id : null;

  return {
    apercu: true,
    ecrit: false,
    email_envoye: false,
    visible_to_client: "inchange",
    de: { carte_id: source.id, hotel: source.name },
    vers: { carte_id: target.id, hotel: target.name },
    courrier_cible: courrierCible,
    fil: Boolean(input.fil && threadId),
    messages: rows.map((row) => ({
      id: row.id,
      recu_le: row.receivedAt,
      sujet: row.subject.replace(/\s+/g, " ").trim().slice(0, 180),
      extrait: excerpt(row.body),
      direction: row.direction,
    })),
  };
}

type DbMessage = {
  id: string;
  booking_id: string;
  booking_item_id: string;
  gmail_thread_id: string | null;
  subject: string | null;
  body: string | null;
  received_at: string;
  direction: string;
  request_id: string | null;
};

function hotelName(row: { title?: string | null; details?: { hotel_name?: unknown } | null }) {
  const named = typeof row.details?.hotel_name === "string" ? row.details.hotel_name : "";
  return noticeHotelName({ hotelName: named, title: row.title });
}

/**
 * Déplace un message, ou son fil Gmail, vers une autre carte hôtel du même dossier.
 * Sans confirmer : aperçu, rien n’est écrit. Aucun e-mail. visible_to_client n’est pas touché.
 */
export async function moveHotelCourrier(
  db: SupabaseClient,
  input: Record<string, unknown>,
  actor: { staffId: string | null; name: string },
  options?: { journal?: boolean; journalPath?: string }
) {
  const bookingId = textOf(input.dossier_id || input.bookingId);
  const reference = textOf(input.reference);
  if (!bookingId && !reference) throw new McpWriteError("Indiquez le dossier.");
  if (bookingId && !UUID.test(bookingId)) throw new McpWriteError("Dossier invalide.");
  const carteCible = textOf(input.carte_cible || input.carteCible);
  if (!carteCible || !UUID.test(carteCible)) throw new McpWriteError("Indiquez la carte hôtel de destination.");
  const messageId = textOf(input.message_id || input.messageId);
  const extrait = textOf(input.extrait);
  if (!messageId && extrait.length < 12) throw new McpWriteError("Indiquez le message ou un extrait du courrier.");
  if (messageId && !UUID.test(messageId)) throw new McpWriteError("Message invalide.");

  let bookingQuery = db.from("crm_bookings").select("id, reference");
  bookingQuery = bookingId ? bookingQuery.eq("id", bookingId) : bookingQuery.eq("reference", reference);
  const bookings = await bookingQuery.limit(2);
  if (bookings.error) throw new McpWriteError("Dossier introuvable.");
  const bookingRows = (bookings.data || []) as { id: string; reference: string | null }[];
  if (!bookingRows.length) throw new McpWriteError("Dossier introuvable.");
  if (bookingRows.length > 1) throw new McpWriteError("Plusieurs dossiers portent cette référence. Indiquez l’identifiant.");
  const booking = bookingRows[0];

  const [items, requests, messages] = await Promise.all([
    db.from("crm_booking_items").select("id, booking_id, kind, title, details").eq("booking_id", booking.id),
    db.from("crm_hotel_requests").select("id, booking_item_id, kind").eq("booking_id", booking.id),
    db
      .from("crm_hotel_thread_messages")
      .select("id, booking_id, booking_item_id, gmail_thread_id, subject, body, received_at, direction, request_id")
      .eq("booking_id", booking.id),
  ]);
  if (items.error || requests.error || messages.error) throw new McpWriteError("Le courrier n’a pas pu être lu.");

  const cards: HotelMailMoveCard[] = ((items.data || []) as {
    id: string;
    booking_id: string;
    kind: string | null;
    title: string | null;
    details: { hotel_name?: unknown } | null;
  }[]).map((row) => ({
    id: row.id,
    bookingId: row.booking_id,
    kind: row.kind || "",
    name: hotelName(row),
  }));
  const plan = planHotelCourrierMove({
    messages: ((messages.data || []) as DbMessage[]).map((row) => ({
      id: row.id,
      bookingId: row.booking_id,
      bookingItemId: row.booking_item_id,
      gmailThreadId: row.gmail_thread_id,
      subject: row.subject || "",
      body: row.body || "",
      receivedAt: row.received_at,
      direction: row.direction === "out" ? "out" : "in",
      requestId: row.request_id,
    })),
    cards,
    requests: ((requests.data || []) as { id: string; booking_item_id: string; kind: string }[]).map((row) => ({
      id: row.id,
      bookingItemId: row.booking_item_id,
      kind: row.kind,
    })),
    messageId,
    extrait,
    carteCible,
    fil: input.fil === true,
  });

  const confirm = input.confirmer === true || input.confirm === true;
  if (!confirm) return plan;

  for (const message of plan.messages) {
    const saved = await db
      .from("crm_hotel_thread_messages")
      .update({ booking_item_id: plan.vers.carte_id, request_id: plan.courrier_cible })
      .eq("id", message.id)
      .eq("booking_id", booking.id);
    if (saved.error) throw new McpWriteError("Le courrier n’a pas pu être déplacé.");
  }

  if (options?.journal !== false) {
    const count = plan.messages.length === 1 ? "1 message" : `${plan.messages.length} messages`;
    await recordAgencyJournal({
      staffId: actor.staffId,
      action: "update",
      entityType: "dossier",
      entityId: booking.id,
      summary: `Courrier hôtel déplacé de ${plan.de.hotel} vers ${plan.vers.hotel} (${count}). Aucun e-mail.`.slice(0, 500),
      path: options?.journalPath || "/api/mcp",
    });
  }

  return { ...plan, apercu: false as const, ecrit: true };
}
