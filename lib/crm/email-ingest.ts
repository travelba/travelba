import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  currentHistoryId,
  gmailConfigured,
  gmailLabelNames,
  getAttachmentBytes,
  getMessage,
  GmailHistoryTooOldError,
  listHistoryMessageIds,
  listMessagesByLabel,
  resolveLabelIds,
} from "@/lib/crm/gmail";
import {
  BILLET_AVION_LABEL,
  BILLET_BACKFILL_DONE,
  gmailLabelMatchKey,
  nextBilletBackfillCursor,
} from "@/lib/crm/gmail-parse";
import {
  extractBookingFromPrepared,
  type PreparedIngestFile,
} from "@/lib/crm/ingest-file";
import { clipEmailBody } from "@/lib/crm/email-source";
import { reopenFalseSupplierCancellation } from "@/lib/crm/ingest-parse";
import {
  aiGatewayConfigured,
  isAllowedIngestType,
  MAX_INGEST_BYTES,
  MAX_INGEST_FILES,
  detectCancellationDocument,
  parseExtractPayloadSafe,
  type BookingExtract,
  type IngestWarning,
} from "@/lib/crm/ingest-types";
import { autoCreateBookingFromIngestId } from "@/lib/crm/email-ingest-create-run";
import { uploadCrmFile, downloadCrmFile, safeFileName } from "@/lib/crm/files";
import {
  extractReferences,
  mergeBookingSuggestions,
  suggestBookingByReference,
  suggestBookingByTripSignals,
  suggestCustomerFromExtract,
} from "@/lib/crm/email-match";
import type {
  CrmBooking,
  CrmBookingItem,
  CrmCustomer,
  CrmEmailIngest,
  EmailIngestAttachment,
  EmailIngestCandidate,
} from "@/lib/crm/types";

export const EMAIL_SYNC_PROVIDER = "gmail";

/** Le webhook peut capturer même sans IA ; le parsing exige l'IA. */
export function emailParsingReady() {
  return gmailConfigured() && aiGatewayConfigured();
}

type Admin = SupabaseClient;

async function getSync(admin: Admin) {
  const { data } = await admin
    .from("crm_email_sync")
    .select("*")
    .eq("provider", EMAIL_SYNC_PROVIDER)
    .maybeSingle();
  return data as
    | { provider: string; history_id: string | null; watch_expiration: string | null }
    | null;
}

export async function setEmailHistoryId(admin: Admin, historyId: string) {
  if (!historyId) return;
  await admin
    .from("crm_email_sync")
    .upsert(
      { provider: EMAIL_SYNC_PROVIDER, history_id: historyId },
      { onConflict: "provider" }
    );
}

export async function setEmailWatch(
  admin: Admin,
  historyId: string,
  expirationMs: string
) {
  const expiration = expirationMs
    ? new Date(Number(expirationMs)).toISOString()
    : null;
  await admin.from("crm_email_sync").upsert(
    {
      provider: EMAIL_SYNC_PROVIDER,
      history_id: historyId || null,
      watch_expiration: expiration,
    },
    { onConflict: "provider" }
  );
}

/**
 * Depuis une notification push (historyId), liste les messages nouveaux ou
 * relabellisés sous les labels ciblés et insère des lignes `received`
 * (idempotent sur gmail_message_id). Traitement lourd délégué au cron.
 */
export async function captureGmailHistory(
  notifiedHistoryId: string
): Promise<{ captured: number; historyId: string }> {
  const admin = createServiceClient();
  const sync = await getSync(admin);
  const startHistoryId = sync?.history_id || notifiedHistoryId;
  if (!startHistoryId) {
    // Aucune base : on s'aligne sur la notification pour la prochaine fois.
    await setEmailHistoryId(admin, notifiedHistoryId);
    return { captured: 0, historyId: notifiedHistoryId };
  }

  const labelIds = await resolveLabelIds(gmailLabelNames());
  if (!labelIds.size) {
    await setEmailHistoryId(admin, notifiedHistoryId);
    return { captured: 0, historyId: notifiedHistoryId };
  }

  const perMessageLabel = new Map<string, string>();
  let latest = startHistoryId;
  try {
    for (const [labelName, labelId] of labelIds) {
      const { messageIds, historyId } = await listHistoryMessageIds(
        startHistoryId,
        labelId
      );
      if (Number(historyId) > Number(latest)) latest = historyId;
      for (const id of messageIds) {
        if (!perMessageLabel.has(id)) perMessageLabel.set(id, labelName);
      }
    }
  } catch (err) {
    if (err instanceof GmailHistoryTooOldError) {
      // Curseur trop ancien : re-baseline sur l'historique courant.
      const fresh = await currentHistoryId();
      await setEmailHistoryId(admin, fresh || notifiedHistoryId);
      return { captured: 0, historyId: fresh || notifiedHistoryId };
    }
    throw err;
  }

  let captured = 0;
  for (const [messageId, label] of perMessageLabel) {
    const { error } = await admin
      .from("crm_email_ingest")
      .upsert(
        { gmail_message_id: messageId, label, status: "received" },
        { onConflict: "gmail_message_id", ignoreDuplicates: true }
      );
    if (!error) captured += 1;
  }

  const nextHistory =
    Number(notifiedHistoryId) > Number(latest) ? notifiedHistoryId : latest;
  await setEmailHistoryId(admin, nextHistory);
  return { captured, historyId: nextHistory };
}

/**
 * Rattrapage (cron) : avance le curseur jusqu'à l'historique courant même si
 * aucune notification push n'est arrivée. Sûr et idempotent.
 */
export async function catchUpGmailHistory() {
  const current = await currentHistoryId();
  if (!current) return { captured: 0, historyId: "" };
  return captureGmailHistory(current);
}

const BILLET_BACKFILL_PROVIDER = "gmail-billet-avion";
const BILLET_BACKFILL_PAGE = 40;
const BILLET_BACKFILL_NEW = 15;

/**
 * Importe les confirmations déjà sous `billet-avion`.
 * L'historique Gmail ne voit que les changements après le curseur : sans ce
 * passage, les billets déjà labellisés ne rentrent jamais.
 * Le curseur (page Gmail, puis `done`) vit dans `crm_email_sync`.
 */
export async function backfillBilletAvionMessages(): Promise<{
  captured: number;
  scanned: number;
}> {
  const target = gmailLabelNames().find(
    (name) => gmailLabelMatchKey(name) === BILLET_AVION_LABEL
  );
  if (!target) return { captured: 0, scanned: 0 };

  const labelIds = await resolveLabelIds([target]);
  const labelId = labelIds.get(target);
  if (!labelId) return { captured: 0, scanned: 0 };

  const admin = createServiceClient();
  const { data: sync } = await admin
    .from("crm_email_sync")
    .select("history_id")
    .eq("provider", BILLET_BACKFILL_PROVIDER)
    .maybeSingle();
  const stored = String(sync?.history_id || "").trim();
  const headOnly = stored === BILLET_BACKFILL_DONE;
  let resumeToken = !stored || headOnly ? "" : stored;

  let page: { ids: string[]; nextPageToken?: string };
  try {
    page = await listMessagesByLabel(
      labelId,
      BILLET_BACKFILL_PAGE,
      resumeToken || undefined
    );
  } catch (err) {
    if (!resumeToken) throw err;
    resumeToken = "";
    page = await listMessagesByLabel(labelId, BILLET_BACKFILL_PAGE);
  }

  const known = new Set<string>();
  if (page.ids.length) {
    const { data: existing } = await admin
      .from("crm_email_ingest")
      .select("gmail_message_id")
      .in("gmail_message_id", page.ids);
    for (const row of existing || []) {
      if (row.gmail_message_id) known.add(String(row.gmail_message_id));
    }
  }

  const unseen = page.ids.filter((id) => !known.has(id));
  const { cursor, insertIds } = nextBilletBackfillCursor({
    unseenIds: unseen,
    insertLimit: BILLET_BACKFILL_NEW,
    nextPageToken: page.nextPageToken,
    resumeToken,
    headOnly,
  });

  let captured = 0;
  let failed = false;
  for (const messageId of insertIds) {
    const { error } = await admin.from("crm_email_ingest").upsert(
      { gmail_message_id: messageId, label: target, status: "received" },
      { onConflict: "gmail_message_id", ignoreDuplicates: true }
    );
    if (error) {
      failed = true;
      break;
    }
    captured += 1;
  }

  await admin.from("crm_email_sync").upsert(
    {
      provider: BILLET_BACKFILL_PROVIDER,
      history_id: (failed ? resumeToken : cursor) || null,
    },
    { onConflict: "provider" }
  );

  return { captured, scanned: page.ids.length };
}

async function computeSuggestions(admin: Admin, extract: BookingExtract) {
  const { data: customers } = await admin
    .from("crm_customers")
    .select("id, first_name, last_name, usage_name, company_name, email");
  const people = (customers || []) as (Pick<
    CrmCustomer,
    "id" | "first_name" | "last_name" | "company_name" | "email"
  > & { usage_name?: string | null })[];
  const { autoCustomerId, candidates } = suggestCustomerFromExtract(people, extract);

  const { data: bookings } = await admin
    .from("crm_bookings")
    .select("id, customer_id, reference, title, destination, start_date, end_date, status")
    .neq("status", "cancelled")
    .is("archived_at", null);
  const bookingList = (bookings || []) as (Pick<
    CrmBooking,
    "id" | "reference" | "title" | "destination" | "start_date" | "end_date" | "status"
  > & { customer_id: string })[];
  const ids = bookingList.map((b) => b.id);
  const itemsByBooking = new Map<string, Pick<CrmBookingItem, "confirmation_ref">[]>();
  if (ids.length && extractReferences(extract).size) {
    const { data: items } = await admin
      .from("crm_booking_items")
      .select("booking_id, confirmation_ref")
      .in("booking_id", ids);
    for (const item of (items || []) as { booking_id: string; confirmation_ref: string | null }[]) {
      const arr = itemsByBooking.get(item.booking_id) || [];
      arr.push({ confirmation_ref: item.confirmation_ref });
      itemsByBooking.set(item.booking_id, arr);
    }
  }

  const booking = mergeBookingSuggestions(
    suggestBookingByReference(extract, bookingList, itemsByBooking),
    suggestBookingByTripSignals(extract, bookingList, people)
  );

  const merged: EmailIngestCandidate[] = [...candidates];
  for (const cand of booking.candidates) {
    const customerId = cand.customer_id || autoCustomerId;
    if (!customerId) continue;
    merged.push({
      customer_id: customerId,
      booking_id: cand.booking_id,
      label: cand.label,
      reason: cand.reason,
      score: cand.score,
    });
  }

  const suggestedBookingId = booking.autoBookingId;
  const bookingCustomerId = suggestedBookingId
    ? booking.candidates.find((row) => row.booking_id === suggestedBookingId)?.customer_id
    : null;

  return {
    suggested_customer_id: bookingCustomerId || autoCustomerId,
    suggested_booking_id: suggestedBookingId,
    candidates: merged.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, "fr")),
  };
}

/**
 * Enregistre l’extract et les suggestions. Ne rattache pas, ne crée pas,
 * n’annule pas. La création automatique suit uniquement dans
 * processEmailIngestRow.
 */
export async function matchAndStoreExtract(
  admin: Admin,
  rowId: string,
  extract: BookingExtract,
  warnings: IngestWarning[],
  attachments: EmailIngestAttachment[]
) {
  const suggestions = await computeSuggestions(admin, extract);
  await admin
    .from("crm_email_ingest")
    .update({
      extract,
      warnings,
      attachments,
      candidates: suggestions.candidates,
      suggested_customer_id: suggestions.suggested_customer_id,
      suggested_booking_id: suggestions.suggested_booking_id,
      status: suggestions.suggested_customer_id ? "matched" : "parsed",
      error: null,
    })
    .eq("id", rowId);
  return suggestions;
}

/** Relance les suggestions sur un extract déjà stocké, sans rattacher. */
export async function rematchEmailIngestRow(row: CrmEmailIngest) {
  if (!row.extract) throw new Error("Extract introuvable");
  const extract = reopenFalseSupplierCancellation(
    parseExtractPayloadSafe(row.extract),
    row.subject || ""
  );
  if (
    extract.document_status !== "identity" &&
    detectCancellationDocument(`${row.subject || ""}\n${extract.title || ""}\n${extract.notes_client || ""}`)
  ) {
    extract.document_status = "cancelled";
  }
  const admin = createServiceClient();
  return matchAndStoreExtract(
    admin,
    row.id,
    extract,
    row.warnings || [],
    row.attachments || []
  );
}

/** Rattrapage cron : rafraîchit les suggestions, sans rattacher. */
export async function rematchStoredEmailIngest(limit = 20) {
  const admin = createServiceClient();
  const { data } = await admin
    .from("crm_email_ingest")
    .select("*")
    .in("status", ["parsed", "matched"])
    .not("extract", "is", null)
    .is("created_booking_id", null)
    .order("received_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true })
    .limit(limit);
  const rows = (data || []) as CrmEmailIngest[];
  let rematched = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await rematchEmailIngestRow(row);
      rematched += 1;
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : "Rapprochement impossible";
      await admin
        .from("crm_email_ingest")
        .update({ error: message })
        .eq("id", row.id);
    }
  }
  return { scanned: rows.length, rematched, failed };
}

async function storeAttachment(
  rowId: string,
  name: string,
  mime: string,
  bytes: Uint8Array
): Promise<EmailIngestAttachment> {
  const path = `email-ingest/${rowId}/${Date.now()}-${safeFileName(name)}`;
  await uploadCrmFile(path, Buffer.from(bytes), mime, { upsert: true });
  return { name, path, mime_type: mime };
}

/** Traite une ligne `received` : télécharge le mail, extrait, rapproche, crée le dossier si besoin. */
export async function processEmailIngestRow(row: CrmEmailIngest) {
  const admin = createServiceClient();
  const message = await getMessage(row.gmail_message_id);

  const prepared: PreparedIngestFile[] = [];
  const stored: EmailIngestAttachment[] = [];
  let count = 0;
  for (const att of message.attachments) {
    if (count >= MAX_INGEST_FILES) break;
    if (!isAllowedIngestType(att.mimeType, att.filename)) continue;
    if (att.size && att.size > MAX_INGEST_BYTES) continue;
    const bytes = await getAttachmentBytes(row.gmail_message_id, att.attachmentId);
    if (!bytes.byteLength) continue;
    const saved = await storeAttachment(row.id, att.filename, att.mimeType, bytes);
    stored.push(saved);
    prepared.push({ name: att.filename, type: att.mimeType, bytes });
    count += 1;
  }

  const body = (message.text || "").trim();
  const headed = [message.subject ? `Objet : ${message.subject}` : "", body]
    .filter(Boolean)
    .join("\n");
  if (headed) {
    prepared.push({ name: "corps-email.txt", type: "text/plain", text: headed });
  }

  const basePatch = {
    gmail_thread_id: message.threadId || row.gmail_thread_id,
    from_email: message.fromEmail || row.from_email,
    subject: message.subject || row.subject,
    received_at: message.receivedAt || row.received_at,
    body_text: clipEmailBody(body),
    body_html: clipEmailBody(message.html),
    attachments: stored,
  };

  if (!prepared.length) {
    await admin
      .from("crm_email_ingest")
      .update({
        ...basePatch,
        status: "parsed",
        warnings: [{ file: "email", message: "Aucun contenu exploitable." }],
      })
      .eq("id", row.id);
    return;
  }

  const { extract, warnings } = await extractBookingFromPrepared(prepared);
  if (
    extract.document_status !== "identity" &&
    detectCancellationDocument(`${message.subject || ""}\n${body}`)
  ) {
    extract.document_status = "cancelled";
  }
  await admin.from("crm_email_ingest").update(basePatch).eq("id", row.id);
  await matchAndStoreExtract(admin, row.id, extract, warnings, stored);
  await autoCreateBookingFromIngestId(row.id);
}

/** Traite en lot les lignes `received` (appelé par le cron / après capture). */
export async function processReceivedEmailIngest(limit = 10) {
  const admin = createServiceClient();
  const { data } = await admin
    .from("crm_email_ingest")
    .select("*")
    .eq("status", "received")
    .order("received_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true })
    .limit(limit);
  const rows = (data || []) as CrmEmailIngest[];
  let processed = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await processEmailIngestRow(row);
      processed += 1;
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : "Traitement impossible";
      await admin
        .from("crm_email_ingest")
        .update({ status: "error", error: message })
        .eq("id", row.id);
    }
  }
  return { scanned: rows.length, processed, failed };
}

/** Reconstruit des File[] à partir des pièces jointes stockées (pour rattachement). */
export async function loadEmailIngestFiles(
  row: Pick<CrmEmailIngest, "attachments">
): Promise<File[]> {
  const files: File[] = [];
  for (const att of row.attachments || []) {
    try {
      const { bytes, contentType } = await downloadCrmFile(att.path);
      files.push(
        new File([Buffer.from(bytes)], att.name, {
          type: att.mime_type || contentType,
        })
      );
    } catch {
      /* pièce jointe absente : ignorer */
    }
  }
  return files;
}

/** Relit Gmail pour les lignes de revue dont le corps n’a pas encore été conservé. */
export async function backfillEmailBodies(rows: CrmEmailIngest[]): Promise<CrmEmailIngest[]> {
  if (!gmailConfigured()) return rows;
  const admin = createServiceClient();
  const out: CrmEmailIngest[] = [];
  for (const row of rows) {
    if ((row.body_text || "").trim() || (row.body_html || "").trim()) {
      out.push(row);
      continue;
    }
    if (!row.gmail_message_id || row.gmail_message_id.startsWith("sim-")) {
      out.push(row);
      continue;
    }
    try {
      const message = await getMessage(row.gmail_message_id);
      const body_text = clipEmailBody(message.text);
      const body_html = clipEmailBody(message.html);
      if (!body_text && !body_html) {
        out.push(row);
        continue;
      }
      await admin.from("crm_email_ingest").update({ body_text, body_html }).eq("id", row.id);
      out.push({ ...row, body_text, body_html });
    } catch {
      out.push(row);
    }
  }
  return out;
}

/** Insère une ligne simulée déjà parsée (tests / démo, sans dépendre de Gmail). */
export async function seedSimulatedEmailIngest(input: {
  subject: string;
  from_email: string;
  label?: string;
  extract: unknown;
}) {
  const admin = createServiceClient();
  const extract = parseExtractPayloadSafe(input.extract);
  const { data, error } = await admin
    .from("crm_email_ingest")
    .insert({
      gmail_message_id: `sim-${crypto.randomUUID()}`,
      label: input.label || "little-emperors",
      from_email: input.from_email,
      subject: input.subject,
      received_at: new Date().toISOString(),
      status: "parsed",
    })
    .select("*")
    .single();
  if (error || !data) throw error || new Error("Insertion simulée impossible");
  await matchAndStoreExtract(admin, data.id, extract, [], []);
  return data.id as string;
}
