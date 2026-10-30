/** Index des envois du CRM. La table peut manquer : rien ne bloque l’envoi ni l’import. */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  emptySentMailIndex,
  normalizeRfcMessageId,
  type SentMailIndex,
} from "./email-reply-gate";
import { hotelMailSubjectKey } from "./hotel-desk";
import { createServiceClient } from "@/lib/supabase/admin";

type SubjectRow = { subject?: string | null; sent_subjects?: string[] | null };
type ThreadRow = { subject?: string | null; gmail_thread_id?: string | null };
type SentRow = { subject_key?: string | null; rfc_message_id?: string | null; gmail_thread_id?: string | null };

function addSubject(index: SentMailIndex, subject: string | null | undefined) {
  const key = hotelMailSubjectKey(subject || "");
  if (key) index.subjectKeys.add(key);
}

function addThread(index: SentMailIndex, threadId: string | null | undefined) {
  const id = (threadId || "").trim();
  if (id) index.threadIds.add(id);
}

function addRfc(index: SentMailIndex, value: string | null | undefined) {
  const id = normalizeRfcMessageId(value);
  if (id) index.rfcIds.add(id);
}

async function rowsOf<T>(query: PromiseLike<{ data: T[] | null; error: { message?: string } | null }>) {
  try {
    const { data, error } = await query;
    if (error || !data) return [] as T[];
    return data;
  } catch {
    return [] as T[];
  }
}

/** Objets, fils et identifiants déjà partis. Sert au filtre de la boîte ouverte. */
export async function loadSentMailIndex(admin: SupabaseClient): Promise<SentMailIndex> {
  const index = emptySentMailIndex();
  const [requests, messages, threads, sent] = await Promise.all([
    rowsOf<SubjectRow>(
      admin.from("crm_hotel_requests").select("subject, sent_subjects").not("sent_at", "is", null).limit(2000)
    ),
    rowsOf<SubjectRow>(
      admin.from("crm_hotel_messages").select("subject, sent_subjects").not("sent_at", "is", null).limit(2000)
    ),
    rowsOf<ThreadRow>(
      admin.from("crm_hotel_thread_messages").select("subject, gmail_thread_id").eq("direction", "out").limit(2000)
    ),
    rowsOf<SentRow>(admin.from("crm_sent_mail").select("subject_key, rfc_message_id, gmail_thread_id").limit(5000)),
  ]);
  for (const row of [...requests, ...messages]) {
    addSubject(index, row.subject);
    for (const subject of row.sent_subjects || []) addSubject(index, subject);
  }
  for (const row of threads) {
    addSubject(index, row.subject);
    addThread(index, row.gmail_thread_id);
  }
  for (const row of sent) {
    addSubject(index, row.subject_key);
    addRfc(index, row.rfc_message_id);
    addThread(index, row.gmail_thread_id);
  }
  return index;
}

/** Note un envoi. N’échoue jamais : l’e-mail est déjà parti, ou la table n’est pas encore là. */
export async function rememberSentMail(
  input: {
    subject?: string | null;
    rfcMessageId?: string | null;
    resendId?: string | null;
    gmailThreadId?: string | null;
    source?: string | null;
  },
  admin?: SupabaseClient
) {
  try {
    const subject = (input.subject || "").trim().slice(0, 300);
    const subjectKey = hotelMailSubjectKey(subject);
    const rfc = normalizeRfcMessageId(input.rfcMessageId);
    const threadId = (input.gmailThreadId || "").trim().slice(0, 200);
    const resendId = (input.resendId || "").trim().slice(0, 200);
    if (!subjectKey && !rfc && !threadId) return;
    const client = admin || createServiceClient();
    const row = {
      rfc_message_id: rfc || null,
      resend_id: resendId || null,
      gmail_thread_id: threadId || null,
      subject: subject || null,
      subject_key: subjectKey || null,
      source: (input.source || "crm").slice(0, 40),
    };
    const result = rfc
      ? await client.from("crm_sent_mail").upsert(row, { onConflict: "rfc_message_id" })
      : await client.from("crm_sent_mail").insert(row);
    if (result.error) return;
  } catch {
    return;
  }
}
