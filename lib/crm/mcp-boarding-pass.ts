import type { SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { toAuditRow } from "./audit-events";
import {
  BOARDING_PASS_MISSING,
  boardingPassPageTexts,
  boardingPassSendKey,
  overrideBoardingPassengers,
  readBoardingPassPages,
  storedBoardingPassName,
  type BoardingPassPassenger,
} from "./boarding-pass-pdf";
import {
  boardingPassChannelBlock,
  boardingPassContentVariables,
  boardingPassDedupeKey,
  boardingPassFields,
  boardingPassFileName,
  boardingPassJournal,
  boardingPassPreview,
  boardingPassUnapprovedMessage,
  BOARDING_PASS_TEMPLATE_ENV,
  isBoardingPassFile,
  suggestBoardingPass,
} from "./boarding-pass-whatsapp";
import { boardingPassSignedPath } from "./boarding-pass-link";
import { McpWriteError } from "./mcp-write";
import { resolveContentSid, whatsappContentApproved } from "./twilio-content-sid";
import type { CrmBookingItem } from "./types";
import { downloadCrmFile } from "./files";
import { createServiceClient } from "@/lib/supabase/admin";
import { sendContentTemplate, type WhatsappSendResult } from "./whatsapp";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEMPLATE = "carte_embarquement" as const;
const DONE = new Set(["sent", "delivered", "read"]);

type MessageRow = {
  id: string;
  status?: string | null;
  twilio_sid?: string | null;
  dedupe_key?: string | null;
  template_key?: string | null;
  payload?: { document_id?: string; page?: number } | null;
};

export type BoardingPassNotice = {
  document_id: string;
  dossier_id: string;
  reference: string | null;
  notifie: boolean;
  deja_envoye: boolean;
  statut: "envoye" | "deja_envoye" | "en_cours";
  modele: typeof TEMPLATE;
  raison: string | null;
  passagers?: { prenom: string; siege: string; statut: "envoye" | "deja_envoye" | "en_cours" }[];
};

export type BoardingPassNotifyDeps = {
  resolveSid?: (envName: string) => Promise<string>;
  approved?: (sid: string) => Promise<boolean>;
  send?: (input: {
    phone: string | null | undefined;
    contentSid: string;
    variables: Record<string, string> | null;
  }) => Promise<WhatsappSendResult>;
  /** Pages du PDF. Absent en production : le fichier du dossier est lu. */
  readPages?: () => Promise<string[] | null>;
};

function client(admin?: SupabaseClient) {
  if (admin) return admin;
  if (typeof globalThis.WebSocket !== "function") {
    globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
  }
  return createServiceClient();
}

function documentIdOf(value: unknown) {
  const id = typeof value === "string" ? value.trim() : "";
  if (!UUID.test(id)) throw new McpWriteError("Document invalide.");
  return id;
}

function payloadDocument(row: MessageRow) {
  const payload = row.payload;
  if (!payload || typeof payload !== "object") return "";
  return typeof payload.document_id === "string" ? payload.document_id : "";
}

function sameDocument(row: MessageRow, documentId: string) {
  if (row.dedupe_key === boardingPassDedupeKey(documentId)) return true;
  const template = row.template_key || "";
  return payloadDocument(row) === documentId && (template === TEMPLATE || template === "cartes_embarquement");
}

function quiet(documentId: string, dossierId: string, reference: string | null, statut: BoardingPassNotice["statut"], raison: string): BoardingPassNotice {
  return {
    document_id: documentId,
    dossier_id: dossierId,
    reference,
    notifie: false,
    deja_envoye: statut === "deja_envoye",
    statut,
    modele: TEMPLATE,
    raison,
  };
}

/**
 * Envoie au client du dossier le PDF déjà déposé, via le modèle carte_embarquement.
 * Un envoi déjà parti, ou une file encore ouverte pour ce document, ne repart pas.
 */
export async function notifyBoardingPass(
  input: Record<string, unknown>,
  admin?: SupabaseClient,
  deps?: BoardingPassNotifyDeps
): Promise<BoardingPassNotice> {
  const documentId = documentIdOf(input.document_id);
  const db = client(admin);
  const { data: doc, error: docError } = await db
    .from("crm_booking_documents")
    .select("id, booking_id, booking_item_id, kind, mime_type, file_name, storage_path")
    .eq("id", documentId)
    .maybeSingle();
  if (docError) throw new McpWriteError("Document introuvable.");
  if (!doc || !isBoardingPassFile(doc) || !doc.storage_path) {
    throw new McpWriteError("La pièce n’est pas une carte d’embarquement PDF de ce dossier.");
  }
  const bookingId = String(doc.booking_id || "");
  const { data: booking, error: bookingError } = await db
    .from("crm_bookings")
    .select("id, customer_id, reference")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError || !booking) throw new McpWriteError("Dossier introuvable.");
  const customerId = String(booking.customer_id || "");
  const reference = typeof booking.reference === "string" ? booking.reference : null;
  const { data: customer, error: customerError } = await db
    .from("crm_customers")
    .select("id, phone, auth_user_id, whatsapp_opt_in_at, whatsapp_opt_out_at")
    .eq("id", customerId)
    .maybeSingle();
  if (customerError || !customer) throw new McpWriteError("Client introuvable.");
  const block = boardingPassChannelBlock({
    phone: typeof customer.phone === "string" ? customer.phone : null,
    optInAt: typeof customer.whatsapp_opt_in_at === "string" ? customer.whatsapp_opt_in_at : null,
    optOutAt: typeof customer.whatsapp_opt_out_at === "string" ? customer.whatsapp_opt_out_at : null,
  });
  if (block) throw new McpWriteError(block);

  const passengers = await passengersFor(db, input, doc, bookingId, deps);
  const { data: messageRows, error: messageError } = await db
    .from("crm_whatsapp_messages")
    .select("id, status, twilio_sid, dedupe_key, template_key, payload")
    .eq("booking_id", bookingId);
  if (messageError) throw new McpWriteError("Envoi impossible.");
  const same = ((messageRows || []) as MessageRow[]).filter((row) => sameDocument(row, documentId));
  if (same.some((row) => rowDone(row) && pageOfKey(row.dedupe_key, documentId) == null)) {
    return quiet(documentId, bookingId, reference, "deja_envoye", "Cette carte d’embarquement a déjà été envoyée.");
  }
  const outcomes = new Map<number, "envoye" | "deja_envoye" | "en_cours">();
  const pending: BoardingPassPassenger[] = [];
  for (const passenger of passengers) {
    const key = boardingPassSendKey(documentId, passenger.page, passengers.length);
    if (same.some((row) => rowDone(row) && row.dedupe_key === key)) {
      outcomes.set(passenger.page, "deja_envoye");
      continue;
    }
    if (same.some((row) => row.status === "queued" && row.dedupe_key === key)) {
      outcomes.set(passenger.page, "en_cours");
      continue;
    }
    pending.push(passenger);
  }
  if (!pending.length) {
    const waiting = [...outcomes.values()].some((statut) => statut === "en_cours");
    return {
      ...quiet(
        documentId,
        bookingId,
        reference,
        waiting ? "en_cours" : "deja_envoye",
        waiting ? "Un envoi de cette carte est déjà en cours." : "Cette carte d’embarquement a déjà été envoyée."
      ),
      ...(passengers.length > 1 ? { passagers: passengerStates(passengers, outcomes) } : {}),
    };
  }

  const resolveSid = deps?.resolveSid ?? ((envName: string) => resolveContentSid(envName));
  const approved = deps?.approved ?? ((sid: string) => whatsappContentApproved(sid));
  const contentSid = (await resolveSid(BOARDING_PASS_TEMPLATE_ENV.carte_embarquement)).trim();
  if (!contentSid || !(await approved(contentSid))) throw new McpWriteError(boardingPassUnapprovedMessage());

  const send = deps?.send ?? sendContentTemplate;
  const phone = typeof customer.phone === "string" ? customer.phone : null;
  const storedName = typeof doc.file_name === "string" ? doc.file_name : null;
  for (const passenger of pending) {
    const key = boardingPassSendKey(documentId, passenger.page, passengers.length);
    const named = passengerFields(passenger);
    const filename = (passenger.lastName ? boardingPassFileName(named) : null) || storedBoardingPassName(storedName);
    const preview = boardingPassPreview(TEMPLATE, named);
    if (!filename || !preview) throw new McpWriteError("Le nom du fichier PDF n’a pas pu être préparé.");
    const failed = same.find((row) => row.dedupe_key === key && row.status === "failed");
    let messageId = failed?.id || "";
    if (failed) {
      const updated = await db
        .from("crm_whatsapp_messages")
        .update({ status: "queued", error: null, body: preview, template_key: TEMPLATE })
        .eq("id", failed.id);
      if (updated.error) throw new McpWriteError("Envoi impossible.");
    } else {
      const inserted = await db
        .from("crm_whatsapp_messages")
        .insert({
          customer_id: customerId,
          booking_id: bookingId,
          dedupe_key: key,
          direction: "outbound",
          template_key: TEMPLATE,
          body: preview,
          payload: passengers.length > 1 ? { document_id: documentId, page: passenger.page } : { document_id: documentId },
          status: "queued",
        })
        .select("id")
        .single();
      if (inserted.error) {
        if (inserted.error.code === "23505") {
          outcomes.set(passenger.page, "en_cours");
          continue;
        }
        throw new McpWriteError("Envoi impossible.");
      }
      messageId = String(inserted.data?.id || "");
    }
    if (!messageId) throw new McpWriteError("Envoi impossible.");

    const mediaPath = boardingPassSignedPath(documentId, filename);
    const variables = mediaPath ? boardingPassContentVariables(mediaPath, named) : null;
    if (!variables) {
      await db.from("crm_whatsapp_messages").update({ status: "failed", error: "pdf" }).eq("id", messageId);
      throw new McpWriteError("L’adresse du PDF n’a pas pu être signée.");
    }
    const result = await send({ phone, contentSid, variables });
    if (!result.ok) {
      await db
        .from("crm_whatsapp_messages")
        .update({ status: "failed", error: result.reason })
        .eq("id", messageId);
      throw new McpWriteError(result.reason === "rejected" ? "WhatsApp a refusé le message." : "WhatsApp n’est pas configuré.");
    }
    await db
      .from("crm_whatsapp_messages")
      .update({ status: "sent", twilio_sid: result.sid, error: null })
      .eq("id", messageId);
    outcomes.set(passenger.page, "envoye");
    const noted = boardingPassJournal({
      names: [passenger.firstName],
      flight: passenger.flight,
      route: passenger.route,
      count: 1,
    });
    const activity = await db.from("crm_customer_activity").insert({
      customer_id: customerId,
      auth_user_id: typeof customer.auth_user_id === "string" ? customer.auth_user_id : null,
      action: noted.action,
      summary: noted.summary,
      detail: noted.detail,
      booking_id: bookingId,
    });
    if (activity.error) console.error("[carte-embarquement] journal", activity.error.code ?? "?");
    const audit = await db.from("crm_audit_events").insert(
      toAuditRow({
        actorKind: "auto",
        action: noted.action,
        bookingId,
        customerId,
        summary: noted.summary,
        detail: noted.detail ? { route: noted.detail } : {},
      })
    );
    if (audit.error) console.error("[carte-embarquement] audit", audit.error.code ?? "?");
  }

  const sentNow = [...outcomes.values()].some((statut) => statut === "envoye");
  const waiting = [...outcomes.values()].some((statut) => statut === "en_cours");
  if (!sentNow) {
    return {
      ...quiet(
        documentId,
        bookingId,
        reference,
        waiting ? "en_cours" : "deja_envoye",
        waiting ? "Un envoi de cette carte est déjà en cours." : "Cette carte d’embarquement a déjà été envoyée."
      ),
      ...(passengers.length > 1 ? { passagers: passengerStates(passengers, outcomes) } : {}),
    };
  }
  return {
    document_id: documentId,
    dossier_id: bookingId,
    reference,
    notifie: true,
    deja_envoye: false,
    statut: "envoye",
    modele: TEMPLATE,
    raison: null,
    ...(passengers.length > 1 ? { passagers: passengerStates(passengers, outcomes) } : {}),
  };
}

function passengerFields(passenger: BoardingPassPassenger) {
  return { ...passenger, lastName: passenger.lastName || passenger.firstName };
}

function passengerStates(
  passengers: BoardingPassPassenger[],
  outcomes: Map<number, "envoye" | "deja_envoye" | "en_cours">
) {
  return passengers.map((passenger) => ({
    prenom: passenger.firstName,
    siege: passenger.seat,
    statut: outcomes.get(passenger.page) || "en_cours",
  }));
}

function rowDone(row: MessageRow) {
  return Boolean(row.twilio_sid) || DONE.has(String(row.status || ""));
}

function pageOfKey(key: string | null | undefined, documentId: string) {
  const prefix = `${boardingPassDedupeKey(documentId)}:`;
  if (!key?.startsWith(prefix)) return null;
  const page = Number(key.slice(prefix.length));
  return Number.isInteger(page) && page > 0 ? page : null;
}

async function storedPages(path: string) {
  try {
    const file = await downloadCrmFile(path);
    const pages = await boardingPassPageTexts(file.bytes);
    return pages.some((page) => page.trim()) ? pages : null;
  } catch (err) {
    console.error("[carte-embarquement] lecture", err instanceof Error ? err.message : "error");
    return null;
  }
}

async function passengersFor(
  db: SupabaseClient,
  input: Record<string, unknown>,
  doc: { id: string; booking_item_id?: string | null; kind?: string | null; file_name?: string | null; mime_type?: string | null; storage_path?: string | null },
  bookingId: string,
  deps?: BoardingPassNotifyDeps
) {
  const pages = deps?.readPages ? await deps.readPages() : deps ? null : await storedPages(String(doc.storage_path || ""));
  const read = pages ? readBoardingPassPages(pages) : { recognized: false, passengers: [] as BoardingPassPassenger[] };
  if (read.passengers.length) return read.passengers;
  if (!read.recognized) {
    const { data: itemRows } = await db.from("crm_booking_items").select("*").eq("booking_id", bookingId);
    const { data: travelerRows } = await db
      .from("crm_booking_travelers")
      .select("first_name, last_name")
      .eq("booking_id", bookingId);
    const suggested = boardingPassFields(
      suggestBoardingPass({
        doc: {
          id: doc.id,
          booking_item_id: doc.booking_item_id ?? null,
          kind: doc.kind || "",
          mime_type: doc.mime_type ?? null,
          file_name: doc.file_name ?? null,
        },
        items: (itemRows || []) as CrmBookingItem[],
        travelers: (travelerRows || []) as { first_name?: string | null; last_name?: string | null }[],
      })
    );
    if (suggested) return [{ ...suggested, page: 1 }];
  }
  const override = overrideBoardingPassengers(input);
  if (!override.passengers.length) throw new McpWriteError(BOARDING_PASS_MISSING);
  return override.passengers;
}
