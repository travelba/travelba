import "server-only";

import { Resend } from "resend";
import { pliantCardNomination } from "./eta-il-fee";
import { downloadCrmFile, removeCrmFiles, uploadCrmFile } from "./files";
import { agencyCardObjectPath, agencyCardSiblingPaths, clientCardMime, isAgencyCardPath, isSafeCrmPath } from "./files-access";
import { getThread, gmailConfigured, searchInbox } from "./gmail";
import { attachLittleEmperorsCatalog } from "./hotel-catalog-load";
import { holidaysFor } from "./holidays";
import { hotelContact } from "./hotel-contact";
import {
  CHECKIN_CARD_CENTS,
  CHECKIN_CARD_CURRENCY,
  cardCloseDate,
  cardLast4,
  hotelLanguage,
  parisIsoDate,
  principalGuest,
} from "./hotel-arrival";
import {
  HOTEL_DESK_KINDS,
  cleanRecipients,
  containsCardNumber,
  hotelDeskChannel,
  hotelDeskDraft,
  mergeDeskContacts,
  type DeskRosterPerson,
  HOTEL_DESK_FROM,
  appendSentSubject,
  classifyHotelMail,
  gmailAfterDate,
  hotelMailSubjectKey,
  hotelThreadSearchQuery,
  keepAgencyDraft,
  knownHotelRecipients,
  nextDeskMark,
  nextLetterStatus,
  outboundHotelLetter,
  replyWindowStartMs,
  subjectsToFollow,
} from "./hotel-desk";
import { shouldSyncHotelReplies } from "./hotel-reply-notice";
import { precheckParty, selectedPrecheckPieces } from "./hotel-precheck";
import { issuePliantCard, pliantConfigured, readPliantCardSecrets } from "./pliant";
import { agencyCopyCc, tokenMailCc } from "./outbound-mail";
import { cardLinkExpiresAt, cardLinkNote, redactCardLinks } from "./card-link";
import { createCardLink, settleCardLinks } from "./card-link-run";
import { siteConfig } from "../site";
import type {
  CrmBookingItem,
  CrmBookingTraveler,
  CrmHotelMessage,
  CrmHotelRequest,
  CrmHotelThreadMessage,
  CrmTravelDocument,
  HotelDeskKind,
} from "./types";
import type { Db } from "../supabase/db";

type Admin = Db;

const LIVE = ["waiting", "due", "draft", "sent", "follow_up"];

export async function ensureHotelRequests(
  admin: Admin,
  input: {
    bookingId: string;
    reference: string;
    currency: string;
    guest: string;
    items: CrmBookingItem[];
    fetchImpl?: typeof fetch;
  }
) {
  const items = await attachLittleEmperorsCatalog(input.items, admin);
  const hotels = items.filter((item) => item.kind === "hotel");
  if (!hotels.length) return [] as CrmHotelRequest[];
  const { data, error } = await admin.from("crm_hotel_requests").select("*").eq("booking_id", input.bookingId);
  if (error) return [] as CrmHotelRequest[];
  const existing = (data || []) as CrmHotelRequest[];
  const byKey = new Map(existing.map((row) => [`${row.booking_item_id}:${row.kind}`, row]));
  const fetchImpl = input.fetchImpl || fetch;
  const cache = new Map<string, string[]>();
  for (const item of hotels) {
    const contact = hotelContact(item);
    const checkIn = (item.start_at || "").slice(0, 10);
    const holidays = await holidaysFor(contact.country, checkIn, fetchImpl, cache);
    for (const kind of HOTEL_DESK_KINDS) {
      const fresh = hotelDeskDraft({
        kind,
        item,
        items,
        reference: input.reference,
        guest: input.guest,
        currency: input.currency || "EUR",
        holidays,
      });
      const current = byKey.get(`${item.id}:${kind}`);
      if (!current) {
        const { data: inserted } = await admin
          .from("crm_hotel_requests")
          .insert({
            booking_id: input.bookingId,
            booking_item_id: item.id,
            kind,
            status: fresh.status,
            recipients: fresh.recipients,
            subject: fresh.subject,
            body: fresh.body,
            due_on: fresh.dueOn,
            card_choice: fresh.cardChoice,
            attach_passports: fresh.attachPassports,
          })
          .select("*")
          .maybeSingle();
        if (inserted) byKey.set(`${item.id}:${kind}`, inserted as CrmHotelRequest);
        continue;
      }
      const kept = keepAgencyDraft(current, fresh);
      if (
        kept.subject !== current.subject ||
        kept.body !== current.body ||
        kept.recipients.join(",") !== (current.recipients || []).join(",") ||
        (current.due_on || null) !== fresh.dueOn
      ) {
        await admin
          .from("crm_hotel_requests")
          .update({
            subject: kept.subject,
            body: kept.body,
            recipients: kept.recipients,
            due_on: current.edited || current.status !== "waiting" ? current.due_on : fresh.dueOn,
          })
          .eq("id", current.id);
      }
    }
  }
  const { data: freshRows } = await admin.from("crm_hotel_requests").select("*").eq("booking_id", input.bookingId);
  return (freshRows || []) as CrmHotelRequest[];
}

export async function refreshHotelDesk(admin: Admin, deps: { now?: Date; fetchImpl?: typeof fetch } = {}) {
  const now = deps.now || new Date();
  const parisToday = parisIsoDate(now);
  const { data: bookings } = await admin
    .from("crm_bookings")
    .select("id, reference, currency, customer_id")
    .eq("status", "confirmed")
    .or(`end_date.is.null,end_date.gte.${parisToday}`);
  const stays = (bookings || []) as { id: string; reference: string | null; currency: string | null; customer_id: string }[];
  if (!stays.length) return { marked: 0, replied: 0 };
  const ids = stays.map((row) => row.id);
  const [{ data: items }, { data: travelers }] = await Promise.all([
    admin.from("crm_booking_items").select("*").in("booking_id", ids).in("kind", ["hotel", "flight"]),
    admin.from("crm_booking_travelers").select("*").in("booking_id", ids),
  ]);
  const itemRows = (items || []) as CrmBookingItem[];
  const travelerRows = (travelers || []) as CrmBookingTraveler[];
  let marked = 0;
  for (const stay of stays) {
    const stayItems = itemRows.filter((item) => item.booking_id === stay.id);
    if (!stayItems.some((item) => item.kind === "hotel")) continue;
    const guest = principalGuest({
      travelers: travelerRows.filter((row) => row.booking_id === stay.id),
    });
    await ensureHotelRequests(admin, {
      bookingId: stay.id,
      reference: stay.reference || "",
      currency: stay.currency || "EUR",
      guest: `${guest.firstName} ${guest.lastName}`.trim(),
      items: stayItems,
      fetchImpl: deps.fetchImpl,
    });
  }
  const { data: requests } = await admin.from("crm_hotel_requests").select("*").in("booking_id", ids).in("status", LIVE);
  const rows = (requests || []) as CrmHotelRequest[];
  const cache = new Map<string, string[]>();
  const fetchImpl = deps.fetchImpl || fetch;
  for (const row of rows) {
    const item = itemRows.find((entry) => entry.id === row.booking_item_id);
    const holidays = item
      ? await holidaysFor(hotelContact(item).country, (item.start_at || "").slice(0, 10), fetchImpl, cache)
      : [];
    const next = nextDeskMark({
      status: row.status,
      dueOn: row.due_on,
      parisToday,
      sentAtMs: row.sent_at ? Date.parse(row.sent_at) : null,
      followUpCount: row.follow_up_count || 0,
      lastFollowUpAtMs: row.last_follow_up_at ? Date.parse(row.last_follow_up_at) : null,
      nowMs: now.getTime(),
      holidays,
    });
    if (!next || next === row.status) continue;
    await admin.from("crm_hotel_requests").update({ status: next }).eq("id", row.id);
    marked += 1;
  }
  const replied = await syncOpenHotelThreads(admin, ids);
  return { marked, replied };
}

/** Messages libres déjà enregistrés. Le fil Gmail est relu par syncHotelDeskThreads. */
export async function syncHotelMessages(admin: Admin, bookingId: string) {
  const { data, error } = await admin.from("crm_hotel_messages").select("*").eq("booking_id", bookingId);
  if (error) return [] as CrmHotelMessage[];
  return (data || []) as CrmHotelMessage[];
}

type ThreadAnchor = {
  table: "crm_hotel_requests" | "crm_hotel_messages";
  id: string;
  bookingItemId: string;
  subject: string;
  sinceMs: number;
  requestId: string | null;
  messageId: string | null;
};

type GmailHit = {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: string | null;
  autoSubmitted: boolean;
};

const HOTEL_REPLY_SYNC_PROVIDER = "gmail-hotel-replies";

/**
 * Une synchro Gmail légère des dossiers confirmés dont le retour n’est pas passé,
 * au plus une fois toutes les deux minutes, quel que soit le nombre d’onglets.
 */
export async function syncRecentHotelReplies(admin: Admin, nowMs = Date.now()) {
  const { data } = await admin
    .from("crm_email_sync")
    .select("updated_at")
    .eq("provider", HOTEL_REPLY_SYNC_PROVIDER)
    .maybeSingle();
  const stamp = (data as { updated_at?: string } | null)?.updated_at;
  const lastSyncMs = stamp ? Date.parse(stamp) : null;
  if (!shouldSyncHotelReplies(lastSyncMs, nowMs)) return false;
  const { error } = await admin.from("crm_email_sync").upsert(
    { provider: HOTEL_REPLY_SYNC_PROVIDER },
    { onConflict: "provider" }
  );
  if (error) return false;
  const parisToday = parisIsoDate(new Date(nowMs));
  const { data: bookings } = await admin
    .from("crm_bookings")
    .select("id")
    .eq("status", "confirmed")
    .or(`end_date.is.null,end_date.gte.${parisToday}`);
  const ids = ((bookings || []) as { id: string }[]).map((row) => row.id);
  await syncOpenHotelThreads(admin, ids, 12);
  return true;
}

/** Relit les titres partis des dossiers ouverts. Les plus anciens d'abord, par paquets. */
export async function syncOpenHotelThreads(admin: Admin, bookingIds: string[], limit = 30) {
  if (!bookingIds.length) return 0;
  const { data } = await admin
    .from("crm_hotel_requests")
    .select("booking_id")
    .in("booking_id", bookingIds)
    .in("status", ["sent", "follow_up", "replied"])
    .order("thread_synced_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  const ids = [...new Set(((data || []) as { booking_id: string }[]).map((row) => row.booking_id))];
  let replied = 0;
  for (const bookingId of ids) replied += await syncHotelDeskThreads(admin, bookingId);
  return replied;
}

/** Tous les messages Gmail qui ont le titre d'un envoi de ce dossier. */
export async function syncHotelDeskThreads(admin: Admin, bookingId: string) {
  try {
    const [{ data: requests }, { data: messages }, { data: stored }] = await Promise.all([
      admin.from("crm_hotel_requests").select("*").eq("booking_id", bookingId),
      admin.from("crm_hotel_messages").select("*").eq("booking_id", bookingId),
      admin.from("crm_hotel_thread_messages").select("*").eq("booking_id", bookingId),
    ]);
    const letters = (requests || []) as CrmHotelRequest[];
    const notes = (messages || []) as CrmHotelMessage[];
    const existing = (stored || []) as CrmHotelThreadMessage[];
    const anchors = threadAnchors(letters, notes);
    for (const anchor of anchors) {
      const knownThreads = existing
        .filter((row) => row.booking_item_id === anchor.bookingItemId && row.subject_key === anchor.subjectKey && row.gmail_thread_id)
        .map((row) => row.gmail_thread_id || "");
      const found = await collectThreadHits(anchor, knownThreads);
      if (found.hits.length) await storeThreadHits(admin, bookingId, anchor, found.hits);
      if (!found.searchFailed) {
        const stamped = new Date().toISOString();
        for (const stamp of anchor.stamps) {
          await admin.from(stamp.table).update({ thread_synced_at: stamped }).eq("id", stamp.id);
        }
      }
    }
    return await mirrorThreadReplies(admin, bookingId, letters, notes);
  } catch {
    return 0;
  }
}

function threadAnchors(letters: CrmHotelRequest[], notes: CrmHotelMessage[]) {
  const jobs = new Map<
    string,
    ThreadAnchor & { subjectKey: string; stamps: { table: ThreadAnchor["table"]; id: string }[] }
  >();
  const add = (anchor: ThreadAnchor) => {
    const subjectKey = hotelMailSubjectKey(anchor.subject);
    if (!subjectKey) return;
    const mapKey = `${anchor.bookingItemId}:${subjectKey}`;
    const stamp = { table: anchor.table, id: anchor.id };
    const current = jobs.get(mapKey);
    if (!current) {
      jobs.set(mapKey, { ...anchor, subjectKey, stamps: [stamp] });
      return;
    }
    current.stamps.push(stamp);
    if (anchor.sinceMs < current.sinceMs) current.sinceMs = anchor.sinceMs;
    if (anchor.requestId) {
      current.requestId = anchor.requestId;
      current.table = "crm_hotel_requests";
      current.id = anchor.id;
    } else if (!current.messageId && anchor.messageId) {
      current.messageId = anchor.messageId;
    }
  };
  for (const row of letters) {
    const sinceMs = anchorSince(row);
    for (const subject of subjectsToFollow(row)) {
      add({
        table: "crm_hotel_requests",
        id: row.id,
        bookingItemId: row.booking_item_id,
        subject,
        sinceMs,
        requestId: row.id,
        messageId: null,
      });
    }
  }
  for (const row of notes) {
    const sinceMs = anchorSince({ ...row, follow_up_count: 0 });
    for (const subject of subjectsToFollow({ ...row, status: row.sent_at ? "sent" : "draft" })) {
      add({
        table: "crm_hotel_messages",
        id: row.id,
        bookingItemId: row.booking_item_id,
        subject,
        sinceMs,
        requestId: null,
        messageId: row.id,
      });
    }
  }
  return [...jobs.values()];
}

function anchorSince(row: { sent_at: string | null; created_at: string; follow_up_count?: number }) {
  const sentAtMs = row.sent_at ? Date.parse(row.sent_at) : Date.now();
  const createdAtMs = Date.parse(row.created_at);
  return replyWindowStartMs({
    sentAtMs: Number.isFinite(sentAtMs) ? sentAtMs : Date.now(),
    createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : null,
    followUpCount: row.follow_up_count || 0,
  });
}

async function collectThreadHits(anchor: ThreadAnchor & { subjectKey: string }, knownThreads: string[]) {
  if (!gmailConfigured()) return { hits: [] as GmailHit[], searchFailed: false };
  const after = gmailAfterDate(anchor.sinceMs);
  const query = hotelThreadSearchQuery(anchor.subject, after);
  const hits: GmailHit[] = [];
  const seen = new Set<string>();
  const push = (message: GmailHit) => {
    if (!message.id || seen.has(message.id)) return;
    seen.add(message.id);
    hits.push(message);
  };
  const threadIds = new Set(knownThreads.filter(Boolean));
  let searchFailed = false;
  try {
    if (query) {
      for (const message of await searchInbox(query, 20)) {
        push(toGmailHit(message));
        if (message.threadId) threadIds.add(message.threadId);
      }
    }
  } catch {
    searchFailed = true;
  }
  for (const threadId of [...threadIds].slice(0, 5)) {
    try {
      for (const message of await getThread(threadId)) push(toGmailHit(message));
    } catch {
      continue;
    }
  }
  return { hits, searchFailed };
}

function toGmailHit(message: {
  id: string;
  threadId: string;
  from: string;
  fromEmail: string;
  subject: string;
  text: string;
  receivedAt: string | null;
  autoSubmitted: boolean;
}): GmailHit {
  return {
    id: message.id,
    threadId: message.threadId,
    from: message.fromEmail || message.from,
    subject: message.subject || "",
    body: message.text || "",
    receivedAt: message.receivedAt,
    autoSubmitted: message.autoSubmitted,
  };
}

async function storeThreadHits(
  admin: Admin,
  bookingId: string,
  anchor: ThreadAnchor & { subjectKey: string },
  hits: GmailHit[]
) {
  const rows = hits.flatMap((hit) => {
    const classified = classifyHotelMail({
      from: hit.from,
      subject: hit.subject,
      body: hit.body,
      keys: [anchor.subject],
      autoSubmitted: hit.autoSubmitted,
    });
    if (!classified.keep || !hit.id) return [];
    const receivedAt = hit.receivedAt && Number.isFinite(Date.parse(hit.receivedAt)) ? hit.receivedAt : new Date().toISOString();
    return [
      {
        booking_id: bookingId,
        booking_item_id: anchor.bookingItemId,
        gmail_message_id: hit.id,
        gmail_thread_id: hit.threadId || null,
        subject_key: classified.subjectKey,
        direction: classified.direction,
        from_email: hit.from.slice(0, 200),
        subject: hit.subject.slice(0, 300),
        body: classified.body,
        link: classified.link,
        received_at: receivedAt,
        counts_as_reply: classified.countsAsReply,
        source: "gmail",
        request_id: anchor.requestId,
        message_id: anchor.requestId ? null : anchor.messageId,
      },
    ];
  });
  if (!rows.length) return;
  const ids = rows.map((row) => row.gmail_message_id);
  const { data } = await admin.from("crm_hotel_thread_messages").select("gmail_message_id, booking_id, booking_item_id").in("gmail_message_id", ids);
  const taken = new Set(
    ((data || []) as { gmail_message_id: string; booking_id: string; booking_item_id: string }[])
      .filter((row) => row.booking_id !== bookingId || row.booking_item_id !== anchor.bookingItemId)
      .map((row) => row.gmail_message_id)
  );
  const owned = rows.filter((row) => !taken.has(row.gmail_message_id));
  if (!owned.length) return;
  await admin.from("crm_hotel_thread_messages").upsert(owned, { onConflict: "gmail_message_id" });
}

async function mirrorThreadReplies(admin: Admin, bookingId: string, letters: CrmHotelRequest[], notes: CrmHotelMessage[]) {
  const { data } = await admin.from("crm_hotel_thread_messages").select("*").eq("booking_id", bookingId);
  const turns = (data || []) as CrmHotelThreadMessage[];
  let replied = 0;
  for (const row of letters) {
    const keys = new Set(subjectsToFollow(row).map((subject) => hotelMailSubjectKey(subject)));
    const matches = turns
      .filter((turn) => turn.booking_item_id === row.booking_item_id && keys.has(turn.subject_key) && turn.counts_as_reply)
      .sort((a, b) => a.received_at.localeCompare(b.received_at));
    if (!matches.length) continue;
    const latest = matches[matches.length - 1];
    const status = nextLetterStatus(row.status, true);
    if (status === "replied" && row.status !== "replied") replied += 1;
    await admin
      .from("crm_hotel_requests")
      .update({
        status,
        replied_at: latest.received_at,
        reply_from: latest.from_email.slice(0, 200),
        reply_subject: latest.subject.slice(0, 300),
        reply_body: latest.body,
        reply_message_id: latest.gmail_message_id,
      })
      .eq("id", row.id);
  }
  for (const row of notes) {
    const keys = new Set(subjectsToFollow({ ...row, status: row.sent_at ? "sent" : "draft" }).map((subject) => hotelMailSubjectKey(subject)));
    const matches = turns
      .filter((turn) => turn.booking_item_id === row.booking_item_id && keys.has(turn.subject_key) && turn.counts_as_reply)
      .sort((a, b) => a.received_at.localeCompare(b.received_at));
    const latest = matches[matches.length - 1];
    if (!latest) continue;
    await admin
      .from("crm_hotel_messages")
      .update({
        replied_at: latest.received_at,
        reply_from: latest.from_email.slice(0, 200),
        reply_subject: latest.subject.slice(0, 300),
        reply_body: latest.body,
        reply_message_id: latest.gmail_message_id,
      })
      .eq("id", row.id);
  }
  return replied;
}

export async function loadHotelThread(admin: Admin, bookingId: string) {
  const { data } = await admin.from("crm_hotel_thread_messages").select("*").eq("booking_id", bookingId).order("received_at", { ascending: true });
  return (data || []) as CrmHotelThreadMessage[];
}

export async function saveHotelRequest(
  admin: Admin,
  input: {
    bookingId: string;
    itemId: string;
    kind: HotelDeskKind;
    subject: string;
    body: string;
    recipients: string[];
    cardChoice: "pliant" | "client" | null;
    contacts?: DeskRosterPerson[];
    identityDocumentIds?: string[];
  }
) {
  if (containsCardNumber(input.body) || containsCardNumber(input.subject)) {
    throw new Error("Le brouillon ne peut pas contenir un numéro de carte.");
  }
  const row = await loadRequest(admin, input.bookingId, input.itemId, input.kind);
  const recipients = cleanRecipients(input.recipients);
  if (input.contacts?.length) {
    const { data: item } = await admin.from("crm_booking_items").select("id, details").eq("id", input.itemId).maybeSingle();
    if (item?.id) {
      const details = { ...((item.details || {}) as Record<string, unknown>) };
      details.hotel_contacts = mergeDeskContacts(details.hotel_contacts, input.contacts);
      await admin.from("crm_booking_items").update({ details }).eq("id", item.id);
    }
  }
  const status = row.status === "waiting" || row.status === "due" ? "draft" : row.status;
  await admin
    .from("crm_hotel_requests")
    .update({
      subject: input.subject.trim(),
      body: input.body,
      recipients,
      card_choice: input.kind === "precheckin" ? input.cardChoice || "pliant" : null,
      ...(input.kind === "precheckin" && input.identityDocumentIds
        ? { identity_document_ids: input.identityDocumentIds, identity_picked: true, attach_passports: input.identityDocumentIds.length > 0 }
        : {}),
      edited: true,
      status,
    })
    .eq("id", row.id);
}

export async function skipHotelRequest(admin: Admin, bookingId: string, itemId: string, kind: HotelDeskKind) {
  const row = await loadRequest(admin, bookingId, itemId, kind);
  await admin.from("crm_hotel_requests").update({ status: "skipped" }).eq("id", row.id);
}

export async function restoreHotelRequest(admin: Admin, bookingId: string, itemId: string, kind: HotelDeskKind) {
  const row = await loadRequest(admin, bookingId, itemId, kind);
  const due = row.due_on && parisIsoDate(new Date()) >= row.due_on;
  await admin.from("crm_hotel_requests").update({ status: due ? "due" : "waiting" }).eq("id", row.id);
}

export async function sendHotelRequest(
  admin: Admin,
  input: {
    bookingId: string;
    itemId: string;
    kind: HotelDeskKind;
    subject: string;
    body: string;
    recipients: string[];
    cardChoice: "pliant" | "client" | null;
    identityDocumentIds?: string[];
    clientCard?: { filename: string; content: Buffer; mime?: string } | null;
    /** Origine du site, pour le lien carte (`/k/CODE`). */
    origin: string;
    /** Agent qui envoie : auteur du lien carte. */
    staffId?: string | null;
  }
) {
  if (containsCardNumber(input.body) || containsCardNumber(input.subject)) {
    throw new Error("Le brouillon ne peut pas contenir un numéro de carte.");
  }
  const recipients = cleanRecipients(input.recipients);
  if (!recipients.length) throw new Error("Choisissez au moins un destinataire.");
  const row = await loadRequest(admin, input.bookingId, input.itemId, input.kind);
  const item = await loadItem(admin, input.bookingId, input.itemId);
  const lang = hotelLanguage(hotelContact(item).country);
  let note = "";
  // La carte ne part jamais en pièce jointe (B-04) : un lien /k/CODE, quelques ouvertures journalisées.
  let cardLinkId: string | null = null;
  const attachments: { filename: string; content: Buffer }[] = [];
  if (input.kind === "precheckin") {
    const choice = input.cardChoice || row.card_choice || "pliant";
    const pieceIds = input.identityDocumentIds ?? (row.identity_picked ? row.identity_document_ids || [] : null);
    attachments.push(...(await identityFiles(admin, input.bookingId, pieceIds)));
    const today = parisIsoDate(new Date());
    const expiresAt = cardLinkExpiresAt(cardCloseDate((item.end_at || item.start_at || today).slice(0, 10)));
    if (choice === "pliant") {
      const card = await ensurePliantCheckinCard(admin, input.bookingId, item);
      const link = await createCardLink(admin, {
        origin: input.origin,
        bookingId: input.bookingId,
        itemId: input.itemId,
        requestId: row.id,
        source: "pliant",
        pliantCardId: card.cardId,
        staffId: input.staffId,
        expiresAt,
      });
      note = cardLinkNote({ choice: "pliant", lang, url: link.url, expiresAt: link.expiresAt });
      cardLinkId = link.id;
    } else {
      const fresh = input.clientCard?.content?.length ? input.clientCard : null;
      const path = fresh
        ? (await storeClientStayCard(admin, input.bookingId, item, fresh)).path
        : await storedClientCardPath(admin, input.bookingId, input.itemId);
      if (!path) throw new Error("Déposez la carte du client.");
      const link = await createCardLink(admin, {
        origin: input.origin,
        bookingId: input.bookingId,
        itemId: input.itemId,
        requestId: row.id,
        source: "client",
        clientCardPath: path,
        staffId: input.staffId,
        expiresAt,
      });
      note = cardLinkNote({ choice: "client", lang, url: link.url, expiresAt: link.expiresAt });
      cardLinkId = link.id;
    }
  }
  const text = outboundHotelLetter(input.body, note);
  try {
    await deliverHotelMail({
      to: recipients,
      subject: input.subject.trim(),
      text,
      attachments,
      carriesCardLink: Boolean(cardLinkId),
    });
  } catch (error) {
    if (cardLinkId) await settleCardLinks(admin, { linkId: cardLinkId, requestId: row.id, sent: false });
    throw error;
  }
  if (cardLinkId) await settleCardLinks(admin, { linkId: cardLinkId, requestId: row.id, sent: true });
  const now = new Date().toISOString();
  const followUp = row.status === "follow_up";
  const subject = input.subject.trim();
  await admin
    .from("crm_hotel_requests")
    .update({
      subject,
      body: input.body,
      recipients,
      sent_subjects: appendSentSubject(row.sent_subjects, subject),
      card_choice: input.kind === "precheckin" ? input.cardChoice || "pliant" : row.card_choice,
      ...(input.kind === "precheckin" && input.identityDocumentIds
        ? { identity_document_ids: input.identityDocumentIds, identity_picked: true, attach_passports: input.identityDocumentIds.length > 0 }
        : {}),
      edited: true,
      status: "sent",
      sent_at: now,
      follow_up_count: followUp ? (row.follow_up_count || 0) + 1 : row.follow_up_count || 0,
      last_follow_up_at: followUp ? now : row.last_follow_up_at,
    })
    .eq("id", row.id);
  await recordCrmTurn(admin, {
    bookingId: input.bookingId,
    itemId: input.itemId,
    scope: "request",
    ownerId: row.id,
    subject,
    // Copie du dossier : le lien carte n’y reste pas (un agent ouvre la carte depuis le suivi, journalisé).
    body: redactCardLinks(text),
    sentAt: now,
  });
}

export async function sendHotelMessage(
  admin: Admin,
  input: { bookingId: string; itemId: string; subject: string; body: string; recipients?: string[] }
) {
  const subject = input.subject.trim().slice(0, 300);
  const text = input.body.trim().slice(0, 8000);
  if (!subject || !text) throw new Error("Écrivez l'objet et le message.");
  if (containsCardNumber(subject) || containsCardNumber(text)) {
    throw new Error("Le message ne peut pas contenir un numéro de carte.");
  }
  const item = await loadItem(admin, input.bookingId, input.itemId);
  const chosen = Array.isArray(input.recipients) ? cleanRecipients(input.recipients) : null;
  let recipients = chosen;
  if (!recipients) {
    const { data: letters } = await admin
      .from("crm_hotel_requests")
      .select("booking_item_id, recipients")
      .eq("booking_id", input.bookingId)
      .eq("booking_item_id", input.itemId);
    recipients = knownHotelRecipients(item, (letters || []) as Pick<CrmHotelRequest, "booking_item_id" | "recipients">[]);
  }
  if (!recipients.length) {
    throw new Error(chosen ? "Choisissez au moins un destinataire." : "Cet hôtel n'a pas d'adresse connue.");
  }
  await deliverHotelMail({ to: recipients, subject, text, attachments: [] });
  const sentAt = new Date().toISOString();
  const { data, error } = await admin
    .from("crm_hotel_messages")
    .insert({
      booking_id: input.bookingId,
      booking_item_id: item.id,
      subject,
      body: text,
      recipients,
      sent_subjects: appendSentSubject([], subject),
      sent_at: sentAt,
    })
    .select("id")
    .maybeSingle();
  if (error || !data?.id) throw new Error("Le message est parti, mais le fil ne l'a pas enregistré.");
  await recordCrmTurn(admin, {
    bookingId: input.bookingId,
    itemId: item.id,
    scope: "message",
    ownerId: data.id,
    subject,
    body: text,
    sentAt,
  });
}

async function loadRequest(admin: Admin, bookingId: string, itemId: string, kind: HotelDeskKind) {
  const { data } = await admin
    .from("crm_hotel_requests")
    .select("*")
    .eq("booking_id", bookingId)
    .eq("booking_item_id", itemId)
    .eq("kind", kind)
    .maybeSingle();
  if (!data) throw new Error("Étape introuvable.");
  return data as CrmHotelRequest;
}

async function loadItem(admin: Admin, bookingId: string, itemId: string) {
  const { data } = await admin.from("crm_booking_items").select("*").eq("booking_id", bookingId).eq("id", itemId).maybeSingle();
  if (!data) throw new Error("Hôtel introuvable.");
  return data as CrmBookingItem;
}

function crmTurnId(scope: "request" | "message", id: string, sentAt: string) {
  return `crm:${scope}:${id}:${sentAt}`;
}

async function recordCrmTurn(
  admin: Admin,
  input: {
    bookingId: string;
    itemId: string;
    scope: "request" | "message";
    ownerId: string;
    subject: string;
    body: string;
    sentAt: string;
  }
) {
  const subjectKey = hotelMailSubjectKey(input.subject);
  if (!subjectKey) return;
  await admin.from("crm_hotel_thread_messages").upsert(
    {
      booking_id: input.bookingId,
      booking_item_id: input.itemId,
      gmail_message_id: crmTurnId(input.scope, input.ownerId, input.sentAt),
      gmail_thread_id: null,
      subject_key: subjectKey,
      direction: "out",
      from_email: HOTEL_DESK_FROM,
      subject: input.subject.slice(0, 300),
      body: input.body.trim().slice(0, 4000),
      link: null,
      received_at: input.sentAt,
      counts_as_reply: false,
      source: "crm",
      request_id: input.scope === "request" ? input.ownerId : null,
      message_id: input.scope === "message" ? input.ownerId : null,
    },
    { onConflict: "gmail_message_id" }
  );
}

async function deliverHotelMail(mail: {
  to: string[];
  subject: string;
  text: string;
  attachments: { filename: string; content: Buffer }[];
  /** Le courrier porte un lien carte : jamais en copie de la boîte partagée de l’agence. */
  carriesCardLink?: boolean;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("L'envoi n'est pas configuré.");
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: `${siteConfig.name} <${HOTEL_DESK_FROM}>`,
    to: mail.to,
    cc: mail.carriesCardLink ? tokenMailCc() : agencyCopyCc(mail.to),
    subject: mail.subject,
    text: mail.text,
    replyTo: HOTEL_DESK_FROM,
    attachments: mail.attachments.map((file) => ({ filename: file.filename, content: file.content })),
  });
  if (error) throw new Error("L'envoi du mail a échoué.");
}

export async function saveUploadedClientCard(
  admin: Admin,
  bookingId: string,
  itemId: string,
  file: { filename: string; content: Buffer; mime?: string }
) {
  const item = await loadItem(admin, bookingId, itemId);
  return storeClientStayCard(admin, bookingId, item, file);
}

export async function clearClientStayCard(admin: Admin, bookingId: string, itemId: string) {
  const { data } = await admin
    .from("crm_hotel_arrivals")
    .select("id, client_card_path")
    .eq("booking_id", bookingId)
    .eq("booking_item_id", itemId)
    .maybeSingle();
  const row = data as { id: string; client_card_path: string | null } | null;
  const path = row?.client_card_path || "";
  if (path && isSafeCrmPath(path) && isAgencyCardPath(path)) await removeCrmFiles([path]);
  if (row?.id) {
    await admin.from("crm_hotel_arrivals").update({ client_card_path: null, client_card_name: null }).eq("id", row.id);
  }
}

async function storeClientStayCard(
  admin: Admin,
  bookingId: string,
  item: CrmBookingItem,
  file: { filename: string; content: Buffer; mime?: string }
) {
  const mime = clientCardMime(file.filename, file.mime);
  const path = agencyCardObjectPath(bookingId, item.id, mime);
  if (!path) throw new Error("Déposez une photo ou un PDF de la carte.");
  await uploadCrmFile(path, file.content, mime, { upsert: true });
  await removeCrmFiles(agencyCardSiblingPaths(path));
  const name = file.filename.replace(/\d{6,}/g, "").trim().slice(0, 80) || "carte-client";
  const { data } = await admin
    .from("crm_hotel_arrivals")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("booking_item_id", item.id)
    .maybeSingle();
  const arrival = data as { id: string } | null;
  if (arrival?.id) {
    await admin.from("crm_hotel_arrivals").update({ client_card_path: path, client_card_name: name }).eq("id", arrival.id);
  } else {
    await admin.from("crm_hotel_arrivals").insert({
      booking_id: bookingId,
      booking_item_id: item.id,
      channel: hotelDeskChannel(item),
      client_card_path: path,
      client_card_name: name,
    });
  }
  return { name, path };
}

/** Chemin de la carte du client déjà déposée pour ce séjour, ou null. */
async function storedClientCardPath(admin: Admin, bookingId: string, itemId: string) {
  const { data } = await admin
    .from("crm_hotel_arrivals")
    .select("client_card_path")
    .eq("booking_id", bookingId)
    .eq("booking_item_id", itemId)
    .maybeSingle();
  const path = (data as { client_card_path: string | null } | null)?.client_card_path || "";
  if (!path || !isSafeCrmPath(path) || !isAgencyCardPath(path)) return null;
  return path;
}

export async function issueHotelCheckinCard(admin: Admin, bookingId: string, itemId: string) {
  const item = await loadItem(admin, bookingId, itemId);
  const card = await ensurePliantCheckinCard(admin, bookingId, item);
  // Lecture éphémère pour les 4 derniers chiffres affichés à l’agence ; rien n’est envoyé.
  const secrets = await readPliantCardSecrets(card.cardId);
  const last4 = cardLast4(secrets.pan);
  if (card.arrivalId && last4.length === 4) {
    await admin.from("crm_hotel_arrivals").update({ card_last4: last4, pliant_card_id: card.cardId }).eq("id", card.arrivalId);
  }
  return { last4, holder: await stayHolder(admin, bookingId) };
}

async function identityFiles(admin: Admin, bookingId: string, ids: string[] | null) {
  const { data: booking } = await admin.from("crm_bookings").select("customer_id").eq("id", bookingId).maybeSingle();
  const customerId = (booking as { customer_id?: string } | null)?.customer_id || "";
  if (!customerId) return [];
  const [{ data: travelers }, { data: documents }, { data: customer }] = await Promise.all([
    admin.from("crm_booking_travelers").select("*").eq("booking_id", bookingId),
    admin.from("crm_travel_documents").select("*").eq("customer_id", customerId),
    admin.from("crm_customers").select("first_name, last_name").eq("id", customerId).maybeSingle(),
  ]);
  const holder = customer as { first_name?: string | null; last_name?: string | null } | null;
  const party = precheckParty((travelers || []) as CrmBookingTraveler[], (documents || []) as CrmTravelDocument[], {
    first_name: holder?.first_name || "",
    last_name: holder?.last_name || "",
  });
  const chosen = ids ? selectedPrecheckPieces(party, ids) : party.flatMap((traveler) => traveler.pieces.map((piece) => ({ ...piece, traveler: traveler.name })));
  const attachments: { filename: string; content: Buffer }[] = [];
  for (const file of chosen) {
    try {
      const downloaded = await downloadCrmFile(file.path);
      const ext = (file.fileName.split(".").pop() || "pdf").replace(/[^\w]/g, "").slice(0, 4) || "pdf";
      attachments.push({
        filename: `${file.traveler} ${file.label}.${ext}`.replace(/[^\w.\- ]+/g, "").slice(0, 80),
        content: Buffer.from(downloaded.bytes),
      });
    } catch {
      attachments.push(...[]);
    }
  }
  return attachments;
}

/** Carte Pliant du séjour : celle de l’hôtel, sinon une du dossier, sinon une carte de 500 € émise. */
async function ensurePliantCheckinCard(admin: Admin, bookingId: string, item: CrmBookingItem) {
  const { data } = await admin
    .from("crm_hotel_arrivals")
    .select("id, pliant_card_id")
    .eq("booking_id", bookingId)
    .eq("booking_item_id", item.id)
    .maybeSingle();
  const arrival = data as { id: string; pliant_card_id: string | null } | null;
  let cardId = arrival?.pliant_card_id || "";
  if (!cardId) {
    const { data: siblings } = await admin
      .from("crm_hotel_arrivals")
      .select("pliant_card_id")
      .eq("booking_id", bookingId);
    cardId =
      ((siblings || []) as { pliant_card_id?: string | null }[]).find((row) => row.pliant_card_id)?.pliant_card_id ||
      "";
  }
  if (!cardId) {
    if (!pliantConfigured()) throw new Error("Pliant n'est pas branché. Choisissez la carte du client, ou ouvrez le dossier pour créer la carte hôtel.");
    const { data: booking } = await admin.from("crm_bookings").select("customer_id").eq("id", bookingId).maybeSingle();
    const customerId = (booking as { customer_id?: string } | null)?.customer_id || "";
    const [{ data: travelers }, { data: customer }] = await Promise.all([
      admin.from("crm_booking_travelers").select("*").eq("booking_id", bookingId),
      customerId
        ? admin.from("crm_customers").select("first_name, last_name").eq("id", customerId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const guest = principalGuest({
      travelers: (travelers || []) as CrmBookingTraveler[],
      holder: customer as { first_name: string; last_name: string } | null,
    });
    const name = pliantCardNomination({ firstName: guest.firstName, lastName: guest.lastName });
    const today = parisIsoDate(new Date());
    const validTo = cardCloseDate((item.end_at || item.start_at || today).slice(0, 10));
    const money = { value: CHECKIN_CARD_CENTS, currency: CHECKIN_CARD_CURRENCY };
    const issued = await issuePliantCard(process.env.PLIANT_CARDHOLDER_ID || "", {
      organizationId: process.env.PLIANT_ORGANIZATION_ID || "",
      cardConfig: "PLIANT_VIRTUAL_TRAVEL",
      label: name.label,
      customFirstName: name.customFirstName,
      customLastName: name.customLastName,
      limit: money,
      transactionLimit: money,
      limitRenewFrequency: "TOTAL",
      maxTransactionCount: 20,
      validFrom: today,
      validTo,
      validTimezone: "Europe/Paris",
    });
    if (!issued.cardId) throw new Error("Pliant n'a pas créé la carte.");
    cardId = issued.cardId;
    if (arrival?.id) {
      await admin.from("crm_hotel_arrivals").update({ pliant_card_id: cardId, card_limit_cents: CHECKIN_CARD_CENTS }).eq("id", arrival.id);
    } else {
      await admin.from("crm_hotel_arrivals").insert({
        booking_id: bookingId,
        booking_item_id: item.id,
        channel: hotelDeskChannel(item),
        pliant_card_id: cardId,
        card_limit_cents: CHECKIN_CARD_CENTS,
      });
    }
  }
  if (cardId && arrival?.id && arrival.pliant_card_id !== cardId) {
    await admin.from("crm_hotel_arrivals").update({ pliant_card_id: cardId }).eq("id", arrival.id);
  }
  return { cardId, arrivalId: arrival?.id || null };
}

async function stayHolder(admin: Admin, bookingId: string) {
  const { data: travelers } = await admin.from("crm_booking_travelers").select("*").eq("booking_id", bookingId);
  const guest = principalGuest({ travelers: (travelers || []) as CrmBookingTraveler[] });
  return `${guest.firstName} ${guest.lastName}`.trim();
}
