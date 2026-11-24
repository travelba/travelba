import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { toAuditRow } from "./audit-events";
import { boardingPassSignedPath } from "./boarding-pass-link";
import { pieceEstRetiree } from "./dossier-piece";
import { downloadCrmFile } from "./files";
import { freeMessageSignedPath } from "./free-message-link";
import {
  FREE_MESSAGE_TEMPLATE_ENV,
  freeMessageContentVariables,
  freeMessageMediaUrl,
  freeMessageTemplatePreview,
} from "./free-message-whatsapp";
import { pdfPlainText } from "./pdf-raster";
import {
  RAIL_TICKET_TEMPLATE,
  RAIL_TICKET_TEMPLATE_ENV,
  planRailTicketSends,
  railTicketChannel,
  railTicketContentVariables,
  railTicketFields,
  railTicketNoticeText,
  railTicketPreview,
  type RailCardFace,
  type RailDocumentFace,
  type RailTicketSend,
} from "./rail-ticket";
import { timezoneForCity } from "./stay-timezone";
import { resolveContentSid } from "./twilio-content-sid";
import { sendContentTemplate, withConciergeSignature } from "./whatsapp";
import { sessionWindowOpen } from "./whatsapp-inbox";
import { sendWhatsappSession, sessionAddress } from "./whatsapp-session";
import { proactiveWhatsappAllowed } from "./whatsapp-concierge";

const SENT = new Set(["sent", "delivered", "read", "queued"]);
const HOUR = 60 * 60 * 1000;

type ItemRow = {
  id: string;
  booking_id: string;
  title?: string | null;
  supplier?: string | null;
  start_at?: string | null;
  visible_to_client?: boolean | null;
  lifecycle?: string | null;
  details?: Record<string, unknown> | null;
};

type BookingRow = {
  id: string;
  reference?: string | null;
  customer_id?: string | null;
  status?: string | null;
  visible_to_client?: boolean | null;
  archived_at?: string | null;
};

type CustomerRow = {
  id: string;
  first_name?: string | null;
  phone?: string | null;
  whatsapp_opt_in_at?: string | null;
  whatsapp_opt_out_at?: string | null;
};

type DocumentRow = {
  id: string;
  booking_id: string;
  booking_item_id?: string | null;
  kind?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  storage_path?: string | null;
  extracted?: unknown;
};

type MessageRow = {
  id?: string;
  dedupe_key?: string | null;
  status?: string | null;
  created_at?: string | null;
  customer_id?: string | null;
  direction?: string | null;
};

export type RailTicketRunResult = {
  ok: true;
  essai: boolean;
  prevus: number;
  envoyes: number;
  deja: number;
  ignores: number;
  sans_modele: number;
  echecs: number;
  trains: string[];
};

type SendDeps = {
  now: Date;
  dryRun: boolean;
  readText: (storagePath: string) => Promise<string>;
  resolveSid: (envName: string) => Promise<string | null>;
  sendTemplate: (input: { phone: string; contentSid: string; variables: Record<string, string> | null }) => Promise<{ ok: true; sid: string } | { ok: false; detail?: string }>;
  sendSession: (input: { to: string; body: string; mediaUrl: string | null }) => Promise<{ ok: true; sid: string } | { ok: false; detail?: string }>;
  signBoarding: (documentId: string, filename: string) => string | null;
  signFree: (documentId: string, filename: string) => string | null;
};

function quiet(error: { message?: string } | null, label: string) {
  const message = error?.message || label;
  console.error("[billet-train]", message.replace(/https?:\/\/\S+/g, "").replace(/\+?\d{8,}/g, "").slice(0, 160));
}

function asCard(row: ItemRow): RailCardFace {
  const details = row.details || {};
  const lifecycle = row.lifecycle || "";
  return {
    id: row.id,
    title: row.title || "",
    supplier: row.supplier || null,
    startAt: row.start_at || null,
    visible: row.visible_to_client !== false,
    hidden: details.client_hidden === true,
    cancelled: lifecycle === "cancelled" || lifecycle === "superseded",
    details,
  };
}

function storedText(extracted: unknown) {
  if (!extracted || typeof extracted !== "object" || Array.isArray(extracted)) return "";
  const text = (extracted as { text?: unknown }).text;
  return typeof text === "string" ? text : "";
}

async function rowsOf<T>(query: PromiseLike<{ data: T[] | null; error: { message?: string } | null }>) {
  const result = await query;
  if (result.error) {
    quiet(result.error, "lecture");
    return [] as T[];
  }
  return result.data || [];
}

function defaultDeps(now: Date, dryRun: boolean): SendDeps {
  return {
    now,
    dryRun,
    readText: async (storagePath) => {
      const file = await downloadCrmFile(storagePath);
      const text = await pdfPlainText(file.bytes);
      return text.text || "";
    },
    resolveSid: (envName) => resolveContentSid(envName),
    sendTemplate: (input) => sendContentTemplate(input),
    sendSession: (input) => sendWhatsappSession(input),
    signBoarding: (documentId, filename) => boardingPassSignedPath(documentId, filename),
    signFree: (documentId, filename) => freeMessageSignedPath(documentId, filename),
  };
}

async function remember(
  admin: SupabaseClient,
  input: {
    customerId: string;
    bookingId: string;
    phone: string | null;
    key: string;
    status: string;
    templateKey: string;
    body: string;
    sid: string | null;
    documentId: string;
    itemId: string;
    error?: string | null;
  }
) {
  const existing = await admin
    .from("crm_whatsapp_messages")
    .select("id, status")
    .eq("dedupe_key", input.key)
    .maybeSingle();
  const row = {
    customer_id: input.customerId,
    booking_id: input.bookingId,
    direction: "outbound",
    template_key: input.templateKey,
    body: input.body,
    twilio_sid: input.sid,
    status: input.status,
    phone: input.phone,
    error: input.error || null,
    dedupe_key: input.key,
    payload: { document_id: input.documentId, booking_item_id: input.itemId },
  };
  const prior = existing.data as { id?: string; status?: string } | null;
  if (prior?.id && SENT.has(String(prior.status || "")) && prior.status !== "queued") return "deja" as const;
  const write = prior?.id
    ? await admin.from("crm_whatsapp_messages").update(row).eq("id", prior.id)
    : await admin.from("crm_whatsapp_messages").insert(row);
  if (write.error) {
    if (write.error.code === "23505") return "deja" as const;
    quiet(write.error, "journal");
    return "echec" as const;
  }
  return "ecrit" as const;
}

/** Cron. Visible seulement, opt-in, sans changer la visibilité des pièces. */
export async function runRailTickets(
  admin: SupabaseClient,
  options?: Partial<SendDeps> & { now?: Date; dryRun?: boolean }
): Promise<RailTicketRunResult> {
  const now = options?.now || new Date();
  const deps = { ...defaultDeps(now, options?.dryRun === true), ...options, now, dryRun: options?.dryRun === true };
  const empty: RailTicketRunResult = {
    ok: true,
    essai: deps.dryRun,
    prevus: 0,
    envoyes: 0,
    deja: 0,
    ignores: 0,
    sans_modele: 0,
    echecs: 0,
    trains: [],
  };
  const from = new Date(now.getTime() - 36 * HOUR).toISOString();
  const to = new Date(now.getTime() + 36 * HOUR).toISOString();
  const items = await rowsOf<ItemRow>(
    admin
      .from("crm_booking_items")
      .select("id, booking_id, title, supplier, start_at, visible_to_client, lifecycle, details")
      .eq("kind", "rail")
      .gte("start_at", from)
      .lte("start_at", to)
      .limit(400)
  );
  if (!items.length) return empty;
  const bookingIds = [...new Set(items.map((row) => row.booking_id))];
  const bookings = await rowsOf<BookingRow>(
    admin
      .from("crm_bookings")
      .select("id, reference, customer_id, status, visible_to_client, archived_at")
      .in("id", bookingIds)
      .eq("visible_to_client", true)
      .neq("status", "cancelled")
      .is("archived_at", null)
  );
  const openBookings = bookings.filter((row) => row.visible_to_client && !row.archived_at && row.status !== "cancelled");
  if (!openBookings.length) return empty;
  const openIds = new Set(openBookings.map((row) => row.id));
  const cardsByBooking = new Map<string, RailCardFace[]>();
  for (const item of items) {
    if (!openIds.has(item.booking_id)) continue;
    const list = cardsByBooking.get(item.booking_id) || [];
    list.push(asCard(item));
    cardsByBooking.set(item.booking_id, list);
  }
  const customerIds = [...new Set(openBookings.map((row) => row.customer_id).filter((id): id is string => Boolean(id)))];
  const customers = await rowsOf<CustomerRow>(
    admin
      .from("crm_customers")
      .select("id, first_name, phone, whatsapp_opt_in_at, whatsapp_opt_out_at")
      .in("id", customerIds)
  );
  const customerById = new Map(customers.map((row) => [row.id, row]));
  const readyBookings = openBookings.filter((booking) => {
    const customer = customerById.get(booking.customer_id || "");
    return Boolean(
      customer &&
        proactiveWhatsappAllowed(customer) &&
        customer.phone?.trim()
    );
  });
  if (!readyBookings.length) return { ...empty, ignores: openBookings.length };

  const documents = await rowsOf<DocumentRow>(
    admin
      .from("crm_booking_documents")
      .select("id, booking_id, booking_item_id, kind, file_name, mime_type, storage_path, extracted")
      .in("booking_id", readyBookings.map((row) => row.id))
      .limit(400)
  );
  const texts = new Map<string, string>();
  let reads = 0;
  for (const doc of documents) {
    if (reads >= 40) break;
    if (pieceEstRetiree(doc.extracted)) continue;
    const cached = storedText(doc.extracted);
    if (cached.trim()) {
      texts.set(doc.id, cached);
      continue;
    }
    if (!doc.storage_path) continue;
    const mime = (doc.mime_type || "").toLowerCase();
    const name = (doc.file_name || "").toLowerCase();
    if (!mime.includes("pdf") && !name.endsWith(".pdf")) continue;
    reads += 1;
    try {
      texts.set(doc.id, await deps.readText(doc.storage_path));
    } catch {
      texts.set(doc.id, "");
    }
  }

  const inbound = await rowsOf<MessageRow>(
    admin
      .from("crm_whatsapp_messages")
      .select("customer_id, created_at, direction")
      .in("customer_id", readyBookings.map((row) => row.customer_id).filter((id): id is string => Boolean(id)))
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(200)
  );
  const lastInbound = new Map<string, string>();
  for (const row of inbound) {
    if (row.customer_id && row.created_at && !lastInbound.has(row.customer_id)) lastInbound.set(row.customer_id, row.created_at);
  }

  const [dedicatedSid, freeSid] = await Promise.all([
    deps.resolveSid(RAIL_TICKET_TEMPLATE_ENV),
    deps.resolveSid(FREE_MESSAGE_TEMPLATE_ENV.message_libre_document),
  ]);

  const planned: {
    booking: BookingRow;
    customer: CustomerRow;
    send: RailTicketSend;
  }[] = [];
  for (const booking of readyBookings) {
    const customer = customerById.get(booking.customer_id || "");
    if (!customer) continue;
    const docs: RailDocumentFace[] = documents
      .filter((doc) => doc.booking_id === booking.id)
      .map((doc) => ({
        id: doc.id,
        itemId: doc.booking_item_id || null,
        linkedKind: null,
        kind: doc.kind || null,
        fileName: doc.file_name || null,
        mime: doc.mime_type || null,
        text: texts.get(doc.id) ?? storedText(doc.extracted),
        retired: pieceEstRetiree(doc.extracted),
      }));
    const sends = planRailTicketSends({
      now: now.getTime(),
      bookingVisible: true,
      customerReady: true,
      cards: cardsByBooking.get(booking.id) || [],
      documents: docs,
      resolveCity: (city) => timezoneForCity(city),
    });
    for (const send of sends) planned.push({ booking, customer, send });
  }
  planned.sort((a, b) => a.send.instant - b.send.instant || a.send.documentId.localeCompare(b.send.documentId));

  const result: RailTicketRunResult = { ...empty, prevus: planned.length };
  const trains = new Set<string>();
  let delivered = 0;
  for (const row of planned) {
    if (delivered >= 24 && !deps.dryRun) break;
    const reference = row.booking.reference || "";
    trains.add([reference, row.send.train].filter(Boolean).join(" · "));
    const windowOpen = sessionWindowOpen(lastInbound.get(row.customer.id) || null, now);
    const channel = railTicketChannel({
      dedicatedSid,
      freeDocumentSid: freeSid,
      windowOpen,
      boardingPassKind: row.send.boardingPassKind,
    });
    if (!channel) {
      result.sans_modele += 1;
      continue;
    }
    const fields = railTicketFields({
      firstName: row.customer.first_name || "",
      train: row.send.train,
      route: row.send.route,
      when: row.send.when,
      place: row.send.place,
    });
    if (!fields) {
      result.ignores += 1;
      continue;
    }
    const prior = await admin
      .from("crm_whatsapp_messages")
      .select("id, status, created_at")
      .eq("dedupe_key", row.send.dedupeKey)
      .maybeSingle();
    const priorRow = prior.data as MessageRow | null;
    if (priorRow && SENT.has(String(priorRow.status || "")) && priorRow.status !== "queued") {
      result.deja += 1;
      continue;
    }
    if (priorRow?.status === "queued") {
      const at = new Date(priorRow.created_at || 0).getTime();
      if (Number.isFinite(at) && now.getTime() - at < 15 * 60 * 1000) {
        result.deja += 1;
        continue;
      }
    }
    if (deps.dryRun) continue;

    const notice = railTicketNoticeText(fields);
    const preview =
      channel === "billet_train"
        ? railTicketPreview(fields)
        : channel === "message_libre_document"
          ? freeMessageTemplatePreview("message_libre_document", fields.firstName, notice || "")
          : notice
            ? withConciergeSignature(notice)
            : null;
    if (!preview || !notice) {
      result.ignores += 1;
      continue;
    }
    const mediaPath =
      channel === "billet_train"
        ? deps.signBoarding(row.send.documentId, row.send.filename)
        : deps.signFree(row.send.documentId, row.send.filename);
    if (!mediaPath) {
      result.echecs += 1;
      continue;
    }
    const claimed = await remember(admin, {
      customerId: row.customer.id,
      bookingId: row.booking.id,
      phone: row.customer.phone || null,
      key: row.send.dedupeKey,
      status: "queued",
      templateKey: channel === "billet_train" ? RAIL_TICKET_TEMPLATE : channel,
      body: preview,
      sid: null,
      documentId: row.send.documentId,
      itemId: row.send.itemId,
    });
    if (claimed === "deja") {
      result.deja += 1;
      continue;
    }
    if (claimed === "echec") {
      result.echecs += 1;
      continue;
    }

    let sent: { ok: true; sid: string } | { ok: false; detail?: string };
    if (channel === "session") {
      const address = sessionAddress(row.customer.phone || "");
      const mediaUrl = freeMessageMediaUrl(mediaPath);
      sent = address ? await deps.sendSession({ to: address, body: preview, mediaUrl }) : { ok: false, detail: "telephone" };
    } else {
      const variables =
        channel === "billet_train"
          ? railTicketContentVariables(mediaPath, fields)
          : freeMessageContentVariables("message_libre_document", {
              mediaPath,
              firstName: fields.firstName,
              text: notice,
            });
      const contentSid = channel === "billet_train" ? dedicatedSid : freeSid;
      sent = contentSid
        ? await deps.sendTemplate({ phone: row.customer.phone || "", contentSid, variables })
        : { ok: false, detail: "modele" };
    }
    if (!sent.ok) {
      await remember(admin, {
        customerId: row.customer.id,
        bookingId: row.booking.id,
        phone: row.customer.phone || null,
        key: row.send.dedupeKey,
        status: "failed",
        templateKey: channel === "billet_train" ? RAIL_TICKET_TEMPLATE : channel,
        body: preview,
        sid: null,
        documentId: row.send.documentId,
        itemId: row.send.itemId,
        error: (sent.detail || "echec").slice(0, 160),
      });
      result.echecs += 1;
      continue;
    }
    await remember(admin, {
      customerId: row.customer.id,
      bookingId: row.booking.id,
      phone: row.customer.phone || null,
      key: row.send.dedupeKey,
      status: "sent",
      templateKey: channel === "billet_train" ? RAIL_TICKET_TEMPLATE : channel,
      body: preview,
      sid: sent.sid,
      documentId: row.send.documentId,
      itemId: row.send.itemId,
    });
    const activity = await admin.from("crm_customer_activity").insert({
      customer_id: row.customer.id,
      auth_user_id: null,
      action: "whatsapp_billet_train",
      summary: `WhatsApp · billet de train · ${fields.train}`.slice(0, 180),
      detail: fields.route,
      booking_id: row.booking.id,
    });
    if (activity.error) quiet(activity.error, "activite");
    const audit = await admin.from("crm_audit_events").insert(
      toAuditRow({
        actorKind: "auto",
        action: "whatsapp_billet_train",
        bookingId: row.booking.id,
        customerId: row.customer.id,
        summary: `Billet de train envoyé · ${fields.train}`,
        detail: { trajet: fields.route, depart: fields.when, document_id: row.send.documentId },
        source: "billet_train",
      })
    );
    if (audit.error) quiet(audit.error, "audit");
    result.envoyes += 1;
    delivered += 1;
  }
  result.trains = [...trains];
  return result;
}
