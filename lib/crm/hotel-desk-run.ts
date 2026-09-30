import "server-only";

import { Resend } from "resend";
import { pliantCardNomination } from "./eta-il-fee";
import { downloadCrmFile, removeCrmFiles, uploadCrmFile } from "./files";
import { agencyCardObjectPath, agencyCardSiblingPaths, clientCardMime, isAgencyCardPath, isSafeCrmPath } from "./files-access";
import { gmailConfigured, searchInbox } from "./gmail";
import { attachLittleEmperorsCatalog } from "./hotel-catalog-load";
import { hotelContact } from "./hotel-contact";
import {
  CHECKIN_CARD_CENTS,
  CHECKIN_CARD_CURRENCY,
  cardCloseDate,
  cardLast4,
  countryIso,
  holidayDatesFromNager,
  hotelLanguage,
  nagerHolidayUrl,
  parisIsoDate,
  principalGuest,
} from "./hotel-arrival";
import {
  HOTEL_DESK_KINDS,
  cardSendNote,
  cleanRecipients,
  containsCardNumber,
  hotelDeskChannel,
  hotelDeskDraft,
  mergeDeskContacts,
  type DeskRosterPerson,
  HOTEL_DESK_FROM,
  hotelReplyForDesk,
  hotelReplySearchQueries,
  gmailAfterDate,
  keepAgencyDraft,
  nextDeskMark,
  outboundHotelLetter,
  replyMatchesRequest,
  replyWindowStartMs,
} from "./hotel-desk";
import { checkinCardPdf, precheckParty, selectedPrecheckPieces } from "./hotel-precheck";
import { issuePliantCard, pliantConfigured, readPliantCardSecrets } from "./pliant";
import { agencyCopyCc } from "./outbound-mail";
import { siteConfig } from "../site";
import type {
  CrmBookingItem,
  CrmBookingTraveler,
  CrmHotelRequest,
  CrmTravelDocument,
  HotelDeskKind,
} from "./types";

type Admin = { from: (table: string) => any };

const OPEN_BOOKING = ["confirmed", "travelling"];
const LIVE = ["waiting", "due", "draft", "sent", "follow_up"];

async function holidaysFor(country: string, checkIn: string, fetchImpl: typeof fetch, cache: Map<string, string[]>) {
  const iso = countryIso(country);
  if (!iso || !checkIn) return [];
  const year = Number(checkIn.slice(0, 4));
  const key = `${iso}:${year}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const dates: string[] = [];
  for (const current of [year - 1, year]) {
    try {
      const res = await fetchImpl(nagerHolidayUrl(current, iso), { signal: AbortSignal.timeout(4000) });
      if (!res.ok) continue;
      dates.push(...holidayDatesFromNager(await res.json()));
    } catch {
      continue;
    }
  }
  cache.set(key, dates);
  return dates;
}

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
  const rows = (freshRows || []) as CrmHotelRequest[];
  const waitingReply = rows.filter((row) => (row.status === "sent" || row.status === "follow_up") && !row.reply_body);
  if (waitingReply.length) {
    try {
      await attachHotelReplies(admin, waitingReply);
    } catch {
      return rows;
    }
    const { data: withReplies } = await admin.from("crm_hotel_requests").select("*").eq("booking_id", input.bookingId);
    return (withReplies || rows) as CrmHotelRequest[];
  }
  return rows;
}

export async function refreshHotelDesk(admin: Admin, deps: { now?: Date; fetchImpl?: typeof fetch } = {}) {
  const now = deps.now || new Date();
  const parisToday = parisIsoDate(now);
  const { data: bookings } = await admin
    .from("crm_bookings")
    .select("id, reference, currency, customer_id")
    .in("status", OPEN_BOOKING);
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
  const replied = await attachHotelReplies(admin, rows.filter((row) => row.status === "sent" || row.status === "follow_up").slice(0, 25));
  return { marked, replied };
}

async function attachHotelReplies(admin: Admin, rows: CrmHotelRequest[]) {
  let replied = 0;
  for (const row of rows) {
    if (!row.sent_at || !row.subject.trim()) continue;
    const sentAtMs = Date.parse(row.sent_at);
    if (!Number.isFinite(sentAtMs)) continue;
    const createdAtMs = row.created_at ? Date.parse(row.created_at) : null;
    const sinceMs = replyWindowStartMs({
      sentAtMs,
      createdAtMs: createdAtMs != null && Number.isFinite(createdAtMs) ? createdAtMs : null,
      followUpCount: row.follow_up_count || 0,
    });
    const hits = await findHotelReplies(admin, {
      emails: row.recipients,
      sinceMs,
      subject: row.subject,
    });
    const match = hits
      .filter((hit) =>
        replyMatchesRequest({
          from: hit.from,
          subject: hit.subject,
          receivedAtMs: hit.receivedAtMs,
          sentAtMs,
          createdAtMs,
          followUpCount: row.follow_up_count || 0,
          requestSubject: row.subject,
        })
      )
      .sort((a, b) => a.receivedAtMs - b.receivedAtMs)[0];
    if (!match) continue;
    const replyBody = hotelReplyForDesk(match.body);
    if (!replyBody) continue;
    await admin
      .from("crm_hotel_requests")
      .update({
        status: "replied",
        replied_at: new Date(match.receivedAtMs).toISOString(),
        reply_from: match.from.slice(0, 200),
        reply_subject: match.subject.slice(0, 300),
        reply_body: replyBody,
        reply_message_id: match.id || null,
      })
      .eq("id", row.id);
    replied += 1;
  }
  return replied;
}

type HotelReplyHit = { id: string; from: string; subject: string; body: string; receivedAtMs: number };

async function findHotelReplies(
  admin: Admin,
  input: { emails: string[]; sinceMs: number; subject: string }
) {
  const replies: HotelReplyHit[] = [];
  const seen = new Set<string>();
  const push = (hit: HotelReplyHit) => {
    const key = hit.id || `${hit.from}|${hit.subject}|${hit.receivedAtMs}`;
    if (seen.has(key)) return;
    seen.add(key);
    replies.push(hit);
  };
  const after = gmailAfterDate(input.sinceMs);
  if (gmailConfigured() && after) {
    for (const query of hotelReplySearchQueries({ subject: input.subject, emails: input.emails, after })) {
      try {
        const messages = await searchInbox(query, 10);
        for (const message of messages) {
          const receivedAtMs = message.receivedAt ? Date.parse(message.receivedAt) : input.sinceMs;
          push({
            id: message.id,
            from: message.fromEmail || message.from,
            subject: message.subject || "",
            body: message.text || "",
            receivedAtMs: Number.isFinite(receivedAtMs) ? receivedAtMs : input.sinceMs,
          });
        }
      } catch {
        continue;
      }
    }
  }
  const { data } = await admin
    .from("crm_email_ingest")
    .select("id, from_email, subject, received_at, body_text")
    .gte("received_at", new Date(input.sinceMs).toISOString())
    .order("received_at", { ascending: false })
    .limit(40);
  for (const row of (data || []) as {
    id?: string;
    from_email?: string | null;
    subject?: string | null;
    received_at?: string | null;
    body_text?: string | null;
  }[]) {
    const body = row.body_text || "";
    if (!body.trim()) continue;
    push({
      id: row.id || "",
      from: row.from_email || "",
      subject: row.subject || "",
      body,
      receivedAtMs: row.received_at ? Date.parse(row.received_at) : input.sinceMs,
    });
  }
  return replies;
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
  }
) {
  if (containsCardNumber(input.body) || containsCardNumber(input.subject)) {
    throw new Error("Le brouillon ne peut pas contenir un numéro de carte.");
  }
  const recipients = cleanRecipients(input.recipients);
  if (!recipients.length) throw new Error("Ajoutez au moins un e-mail d'hôtel.");
  const row = await loadRequest(admin, input.bookingId, input.itemId, input.kind);
  const item = await loadItem(admin, input.bookingId, input.itemId);
  const lang = hotelLanguage(hotelContact(item).country);
  let note = "";
  const attachments: { filename: string; content: Buffer }[] = [];
  if (input.kind === "precheckin") {
    const choice = input.cardChoice || row.card_choice || "pliant";
    const pieceIds = input.identityDocumentIds ?? (row.identity_picked ? row.identity_document_ids || [] : null);
    attachments.push(...(await identityFiles(admin, input.bookingId, pieceIds)));
    if (choice === "pliant") {
      const card = await pliantForSend(admin, input.bookingId, item);
      note = cardSendNote("pliant", lang);
      attachments.push({
        filename: lang === "fr" ? "carte-enregistrement.pdf" : "check-in-card.pdf",
        content: checkinCardPdf({ holder: card.holder, pan: card.pan, expiry: card.expiry, cvc: card.cvc, lang }),
      });
    } else {
      note = cardSendNote("client", lang);
      let attachment = input.clientCard?.content?.length ? input.clientCard : null;
      if (attachment) {
        await storeClientStayCard(admin, input.bookingId, item, attachment);
      } else {
        attachment = await readStoredClientCard(admin, input.bookingId, input.itemId);
      }
      if (!attachment?.content?.length) throw new Error("Déposez la carte du client.");
      attachments.push({ filename: attachment.filename, content: attachment.content });
    }
  }
  const text = outboundHotelLetter(input.body, note);
  await deliverHotelMail({ to: recipients, subject: input.subject.trim(), text, attachments });
  const now = new Date().toISOString();
  const followUp = row.status === "follow_up";
  await admin
    .from("crm_hotel_requests")
    .update({
      subject: input.subject.trim(),
      body: input.body,
      recipients,
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

async function deliverHotelMail(mail: {
  to: string[];
  subject: string;
  text: string;
  attachments: { filename: string; content: Buffer }[];
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("L'envoi n'est pas configuré.");
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: `${siteConfig.name} <${HOTEL_DESK_FROM}>`,
    to: mail.to,
    cc: agencyCopyCc(mail.to),
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
  return { name };
}

async function readStoredClientCard(admin: Admin, bookingId: string, itemId: string) {
  const { data } = await admin
    .from("crm_hotel_arrivals")
    .select("client_card_path, client_card_name")
    .eq("booking_id", bookingId)
    .eq("booking_item_id", itemId)
    .maybeSingle();
  const row = data as { client_card_path: string | null; client_card_name: string | null } | null;
  const path = row?.client_card_path || "";
  if (!path || !isSafeCrmPath(path) || !isAgencyCardPath(path)) return null;
  const downloaded = await downloadCrmFile(path);
  const filename = (row?.client_card_name || "carte-client").replace(/\d{6,}/g, "").trim().slice(0, 80) || "carte-client";
  return { filename, content: Buffer.from(downloaded.bytes) };
}

export async function issueHotelCheckinCard(admin: Admin, bookingId: string, itemId: string) {
  const item = await loadItem(admin, bookingId, itemId);
  const card = await pliantForSend(admin, bookingId, item);
  return { last4: cardLast4(card.pan), holder: card.holder };
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

async function pliantForSend(admin: Admin, bookingId: string, item: CrmBookingItem) {
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
  const secrets = await readPliantCardSecrets(cardId);
  const last4 = cardLast4(secrets.pan);
  if (arrival?.id && last4.length === 4) {
    await admin.from("crm_hotel_arrivals").update({ card_last4: last4, pliant_card_id: cardId }).eq("id", arrival.id);
  }
  const named = await stayHolder(admin, bookingId);
  return { holder: named, pan: secrets.pan, expiry: secrets.expiry, cvc: secrets.cvc };
}

async function stayHolder(admin: Admin, bookingId: string) {
  const { data: travelers } = await admin.from("crm_booking_travelers").select("*").eq("booking_id", bookingId);
  const guest = principalGuest({ travelers: (travelers || []) as CrmBookingTraveler[] });
  return `${guest.firstName} ${guest.lastName}`.trim();
}
