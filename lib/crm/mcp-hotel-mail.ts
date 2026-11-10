import type { SupabaseClient } from "@supabase/supabase-js";
import { siteConfig } from "@/lib/site";
import { hotelDeskKindFromLabel } from "@/lib/crm/hotel-courrier-classify";
import {
  HOTEL_DESK_LABELS,
  cleanRecipients,
  companionNames,
  containsCardNumber,
  followUpSubject,
  hotelDeskDraft,
  signHotelLetter,
  type HotelDeskDraftInput,
} from "@/lib/crm/hotel-desk";
import { documentMoney, principalGuest } from "@/lib/crm/hotel-arrival";
import { hotelDisplayName } from "@/lib/crm/carnet";
import { currentMcpAccess } from "@/lib/crm/mcp-auth";
import { McpWriteError } from "@/lib/crm/mcp-write";
import { followUpBody } from "@/lib/crm/mail-followup";
import { replyDraftBody } from "@/lib/crm/mail-reply";
import { HOTEL_DESK_KINDS, type CrmBookingItem, type HotelDeskKind } from "@/lib/crm/types";
import { createServiceClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type HotelMailMode = "envoyer" | "relancer" | "repondre" | "pas_besoin" | "remettre";

export type HotelMailDraft = {
  dossier_id: string;
  reference: string | null;
  carte_id: string;
  hotel: string;
  demande: string;
  kind: HotelDeskKind;
  destinataires: string[];
  copie: string[];
  objet: string;
  corps: string;
  requestId: string | null;
  threadId: string | null;
  cardChoice: "pliant" | "client" | null;
};

export type HotelMailEffects = {
  load: (input: Record<string, unknown>, mode: HotelMailMode) => Promise<HotelMailDraft>;
  sendRequest?: (draft: HotelMailDraft) => Promise<void>;
  sendFollowUp?: (draft: HotelMailDraft) => Promise<void>;
  sendReply?: (draft: HotelMailDraft) => Promise<void>;
  skip?: (draft: HotelMailDraft) => Promise<void>;
  restore?: (draft: HotelMailDraft) => Promise<void>;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function confirmed(input: Record<string, unknown>) {
  if (input.confirmer === true) return true;
  if (input.confirmer == null || input.confirmer === false) return false;
  throw new McpWriteError("confirmer est vrai ou faux.");
}

function emails(value: unknown) {
  if (value == null) return null;
  const list = Array.isArray(value) ? value : String(value).split(/[,;\n]/);
  return cleanRecipients(list.filter((item): item is string => typeof item === "string"));
}

/** Aperçu puis envoi. Sans confirmer, aucun e-mail et aucune écriture. */
export async function runHotelMail(input: Record<string, unknown>, mode: HotelMailMode, effects: HotelMailEffects = liveEffects()) {
  const draft = applyOverrides(await effects.load(input, mode), input);
  if (containsCardNumber(draft.objet) || containsCardNumber(draft.corps)) {
    throw new McpWriteError("Le message ne peut pas contenir un numéro de carte.");
  }
  const preview = {
    envoye: false,
    ecrit: false,
    apercu: true,
    action: mode,
    dossier_id: draft.dossier_id,
    reference: draft.reference,
    carte_id: draft.carte_id,
    hotel: draft.hotel,
    demande: draft.demande,
    destinataires: draft.destinataires,
    copie: draft.copie,
    objet: draft.objet,
    corps: draft.corps,
  };
  if (!confirmed(input)) return preview;
  if ((mode === "envoyer" || mode === "relancer" || mode === "repondre") && !draft.destinataires.length) {
    throw new McpWriteError("Choisissez au moins un destinataire.");
  }
  if (mode === "envoyer") await (effects.sendRequest ?? missing("envoi"))(draft);
  else if (mode === "relancer") await (effects.sendFollowUp ?? missing("relance"))(draft);
  else if (mode === "repondre") await (effects.sendReply ?? missing("réponse"))(draft);
  else if (mode === "pas_besoin") await (effects.skip ?? missing("passage"))(draft);
  else await (effects.restore ?? missing("remise"))(draft);
  return { ...preview, envoye: mode === "envoyer" || mode === "relancer" || mode === "repondre", ecrit: true, apercu: false };
}

function missing(action: string): () => Promise<void> {
  return async () => {
    throw new McpWriteError(`Le ${action} hôtel n’est pas disponible.`);
  };
}

function applyOverrides(draft: HotelMailDraft, input: Record<string, unknown>): HotelMailDraft {
  const destinataires = emails(input.destinataires);
  const copie = emails(input.copie);
  const objet = text(input.objet);
  const corps = text(input.corps);
  return {
    ...draft,
    destinataires: destinataires ?? draft.destinataires,
    copie: copie ?? draft.copie,
    objet: objet || draft.objet,
    corps: corps || draft.corps,
  };
}

function liveEffects(): HotelMailEffects {
  return {
    load: (input, mode) => loadHotelLetter(createServiceClient(), input, mode),
    sendRequest: (draft) => liveSend("envoyer", draft),
    sendFollowUp: (draft) => liveSend("relancer", draft),
    sendReply: (draft) => liveSend("repondre", draft),
    skip: (draft) => liveMark(draft, "pas_besoin"),
    restore: (draft) => liveMark(draft, "remettre"),
  };
}

async function liveSend(mode: "envoyer" | "relancer" | "repondre", draft: HotelMailDraft) {
  const { ensureHotelRequests, sendHotelFollowUp, sendHotelReply, sendHotelRequest } = await import("@/lib/crm/hotel-desk-run");
  const admin = createServiceClient();
  const staff = currentMcpAccess().staff;
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || siteConfig.url).replace(/\/$/, "");
  if (mode === "envoyer") {
    const prepared = await prepareStay(admin, draft.dossier_id);
    await ensureHotelRequests(admin, prepared);
    await sendHotelRequest(admin, {
      bookingId: draft.dossier_id,
      itemId: draft.carte_id,
      kind: draft.kind,
      subject: draft.objet,
      body: draft.corps,
      recipients: draft.destinataires,
      cardChoice: draft.cardChoice,
      origin,
      staffId: staff?.id || null,
    });
    return;
  }
  if (mode === "relancer") {
    await sendHotelFollowUp(admin, {
      bookingId: draft.dossier_id,
      itemId: draft.carte_id,
      requestId: draft.requestId,
      subject: draft.objet,
      body: draft.corps,
      recipients: draft.destinataires,
      cc: draft.copie,
      staffId: staff?.id || null,
    });
    return;
  }
  await sendHotelReply(admin, {
    bookingId: draft.dossier_id,
    itemId: draft.carte_id,
    threadId: draft.threadId,
    requestId: draft.requestId,
    subject: draft.objet,
    body: draft.corps,
    recipients: draft.destinataires,
    cc: draft.copie,
    staffId: staff?.id || null,
  });
}

async function liveMark(draft: HotelMailDraft, mode: "pas_besoin" | "remettre") {
  const { ensureHotelRequests, restoreHotelRequest, skipHotelRequest } = await import("@/lib/crm/hotel-desk-run");
  const admin = createServiceClient();
  const prepared = await prepareStay(admin, draft.dossier_id);
  await ensureHotelRequests(admin, prepared);
  if (mode === "pas_besoin") await skipHotelRequest(admin, draft.dossier_id, draft.carte_id, draft.kind);
  else await restoreHotelRequest(admin, draft.dossier_id, draft.carte_id, draft.kind);
}

async function prepareStay(admin: SupabaseClient, bookingId: string) {
  const booking = await one<{ id: string; reference: string | null; currency: string | null; customer_id: string }>(
    admin,
    "crm_bookings",
    { id: bookingId },
    "id, reference, currency, customer_id"
  );
  if (!booking) throw new McpWriteError("Dossier introuvable.");
  const items = await many<CrmBookingItem>(admin, "crm_booking_items", { booking_id: bookingId }, "*");
  const people = await guestOf(admin, booking.id, booking.customer_id);
  return {
    bookingId: booking.id,
    reference: booking.reference || "",
    currency: booking.currency || "EUR",
    guest: people.guest,
    companions: people.companions,
    signatory: currentMcpAccess().staff?.name || "",
    items,
  };
}

export async function loadHotelLetter(admin: SupabaseClient, input: Record<string, unknown>, mode: HotelMailMode): Promise<HotelMailDraft> {
  const dossierId = text(input.dossier_id);
  const reference = text(input.reference);
  if (dossierId && !UUID.test(dossierId)) throw new McpWriteError("Dossier invalide.");
  if (!dossierId && !reference) throw new McpWriteError("Indiquez le dossier.");
  const bookings = dossierId
    ? await many<{ id: string; reference: string | null; currency: string | null; customer_id: string }>(
        admin,
        "crm_bookings",
        { id: dossierId },
        "id, reference, currency, customer_id"
      )
    : await many<{ id: string; reference: string | null; currency: string | null; customer_id: string }>(
        admin,
        "crm_bookings",
        { reference },
        "id, reference, currency, customer_id"
      );
  if (!bookings.length) throw new McpWriteError("Dossier introuvable.");
  if (bookings.length > 1) throw new McpWriteError("Plusieurs dossiers portent cette référence. Indiquez l’identifiant.");
  const booking = bookings[0];
  const kind = hotelDeskKindFromLabel(text(input.demande));
  if (!kind) {
    throw new McpWriteError(
      `Demande inconnue. ${HOTEL_DESK_KINDS.map((item) => HOTEL_DESK_LABELS[item]).join(", ")}.`
    );
  }
  const items = await many<CrmBookingItem>(admin, "crm_booking_items", { booking_id: booking.id }, "*");
  const hotels = items.filter((item) => item.kind === "hotel");
  const carteId = text(input.carte_id);
  const hotelQuery = text(input.hotel);
  let hotelItems = hotels;
  if (carteId) {
    if (!UUID.test(carteId)) throw new McpWriteError("Carte invalide.");
    hotelItems = hotels.filter((item) => item.id === carteId);
  } else if (hotelQuery) {
    hotelItems = hotels.filter((item) => hotelDisplayName(item).toLocaleLowerCase("fr").includes(hotelQuery.toLocaleLowerCase("fr")));
  }
  if (!hotelItems.length) throw new McpWriteError("Cet hôtel n’est pas sur le dossier.");
  if (hotelItems.length > 1) {
    throw new McpWriteError(`Plusieurs hôtels : ${hotelItems.map((item) => hotelDisplayName(item)).join(", ")}. Indiquez l’hôtel.`);
  }
  const item = hotelItems[0];
  const requests = await many<RequestRow>(admin, "crm_hotel_requests", { booking_id: booking.id, booking_item_id: item.id, kind }, "*");
  const row = requests[0] || null;
  const people = await guestOf(admin, booking.id, booking.customer_id);
  const money = documentMoney((item.details || {}) as Record<string, unknown>);
  const composed = hotelDeskDraft({
    kind,
    item,
    items,
    reference: booking.reference || "",
    guest: people.guest,
    companions: people.companions,
    signatory: currentMcpAccess().staff?.name || "",
    currency: booking.currency || "EUR",
    holidays: [],
    printedAmount: money.cents != null && money.cents > 0 ? { cents: money.cents, currency: money.currency || booking.currency || "EUR" } : null,
    relance: mode === "relancer",
  } satisfies HotelDeskDraftInput);
  let objet = (row?.subject || "").trim() || composed.subject;
  let corps = (row?.body || "").trim() || composed.body;
  let destinataires = cleanRecipients(row?.recipients || composed.recipients);
  let threadId: string | null = null;
  if (mode === "relancer") {
    if (!text(input.objet)) objet = followUpSubject(objet);
    if (!text(input.corps)) corps = followUpBody({ body: row?.body || corps, sentAt: row?.sent_at || null });
  }
  if (mode === "repondre" && !text(input.corps)) {
    const turns = await many<ThreadRow>(admin, "crm_hotel_thread_messages", { booking_id: booking.id, booking_item_id: item.id, direction: "in" }, "id, subject, body, from_email, received_at, direction");
    const latest = turns.sort((a, b) => (a.received_at || "").localeCompare(b.received_at || "")).at(-1);
    if (!latest) throw new McpWriteError("Aucun message de l’hôtel à citer. Écrivez le corps.");
    threadId = latest.id;
    if (!text(input.objet)) objet = followUpSubject(latest.subject || objet);
    corps = replyDraftBody({ body: latest.body || "", at: latest.received_at, speaker: latest.from_email });
    if (!text(input.destinataires) && latest.from_email) destinataires = cleanRecipients([latest.from_email, ...destinataires]);
  }
  const choice = text(input.carte);
  const cardChoice: HotelMailDraft["cardChoice"] = choice === "pliant" || choice === "client" ? choice : row?.card_choice === "client" || row?.card_choice === "pliant" ? row.card_choice : composed.cardChoice;
  return {
    dossier_id: booking.id,
    reference: booking.reference,
    carte_id: item.id,
    hotel: hotelDisplayName(item),
    demande: HOTEL_DESK_LABELS[kind],
    kind,
    destinataires,
    copie: [],
    objet: signSubject(objet),
    corps: signHotelLetter(corps, currentMcpAccess().staff?.name || ""),
    requestId: row?.id || null,
    threadId,
    cardChoice,
  };
}

function signSubject(subject: string) {
  return subject.replace(/\s+/g, " ").trim().slice(0, 300);
}

async function guestOf(admin: SupabaseClient, bookingId: string, customerId: string | null) {
  const travelers = await many<{ first_name: string | null; last_name: string | null; is_account_holder: boolean }>(
    admin,
    "crm_booking_travelers",
    { booking_id: bookingId },
    "first_name, last_name, is_account_holder"
  );
  let holder: { first_name: string; last_name: string } | null = null;
  if (customerId) {
    const customer = await one<{ first_name: string | null; last_name: string | null }>(admin, "crm_customers", { id: customerId }, "first_name, last_name");
    if (customer) holder = { first_name: customer.first_name || "", last_name: customer.last_name || "" };
  }
  const guest = principalGuest({ travelers, holder });
  const name = `${guest.firstName} ${guest.lastName}`.trim();
  return { guest: name, companions: companionNames(travelers, name) };
}

type RequestRow = {
  id: string;
  subject: string | null;
  body: string | null;
  recipients: string[] | null;
  sent_at: string | null;
  card_choice: string | null;
};

type ThreadRow = {
  id: string;
  subject: string | null;
  body: string | null;
  from_email: string | null;
  received_at: string | null;
};

async function many<T>(admin: SupabaseClient, table: string, filters: Record<string, string>, columns: string): Promise<T[]> {
  let query = admin.from(table).select(columns);
  for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
  const { data, error } = await query.limit(40);
  if (error) throw new McpWriteError("Lecture du dossier impossible.");
  return (data || []) as T[];
}

async function one<T>(admin: SupabaseClient, table: string, filters: Record<string, string>, columns: string): Promise<T | null> {
  const rows = await many<T>(admin, table, filters, columns);
  return rows[0] ?? null;
}
