import type { SupabaseClient } from "@supabase/supabase-js";
import { toE164 } from "./phone";
import { uploadCrmFile } from "./files";
import { redactIngestText } from "./ingest-redact";
import { formParams, verifyTwilioSignature } from "./twilio-signature";
import { withConciergeSignature } from "./whatsapp";
import {
  accessLinkReply,
  buildConciergeDossier,
  HANDOFF_SENTENCE,
  isConciergeStop,
  messageLanguage,
  panRefusedReply,
  pieceSavedLine,
  planConciergeTurn,
  UNKNOWN_NUMBER_REPLY,
  type HandoffKind,
} from "./whatsapp-concierge";
import { sessionAddress } from "./whatsapp-session";

export type WhatsappMessageInsert = {
  customer_id: string | null;
  booking_id: string | null;
  direction: "inbound" | "outbound";
  template_key: string | null;
  body: string;
  twilio_sid: string | null;
  status: "received" | "sent" | "failed";
  error: string | null;
};

export type WhatsappRequestInsert = {
  customer_id: string;
  booking_id: string | null;
  message_id: string | null;
  kind: HandoffKind;
  body: string;
};

export type WhatsappCustomer = { id: string; first_name: string | null; email?: string | null };

export type WhatsappPieceResult = "saved" | "pan" | "skipped";

export type WhatsappThreadRow = {
  direction: "inbound" | "outbound";
  body: string;
  twilio_sid: string | null;
  created_at: string;
};

export type WhatsappStore = {
  findBySid(sid: string): Promise<boolean>;
  customersByPhone(e164: string): Promise<WhatsappCustomer[]>;
  loadDossier(customerId: string): Promise<Parameters<typeof buildConciergeDossier>[0]>;
  insertMessage(
    row: WhatsappMessageInsert
  ): Promise<{ id: string } | { duplicate: true }>;
  insertRequest(row: WhatsappRequestInsert): Promise<void>;
  optOut?(customerId: string): Promise<void>;
  savePiece?(input: {
    customerId: string;
    bytes: Uint8Array;
    contentType: string;
  }): Promise<WhatsappPieceResult>;
  recentThread?(customerId: string): Promise<WhatsappThreadRow[]>;
  tagMessage?(id: string, bookingId: string): Promise<void>;
};

const PIECE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

const PIECE_MARK = "Pièce reçue sur WhatsApp.";

function luhnOk(digits: string) {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = digits.charCodeAt(i) - 48;
    if (n < 0 || n > 9) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return digits.length >= 13 && digits.length <= 19 && sum % 10 === 0;
}

/** Vrai si le fichier contient un PAN. Ne journalise pas les chiffres. */
export function bytesContainPan(bytes: Uint8Array) {
  const text = Buffer.from(bytes).toString("latin1");
  const matches = text.match(/(?:\d[ \t.-]?){13,19}/g) || [];
  return matches.some((raw) => luhnOk(raw.replace(/\D/g, "")));
}

export function pieceContentType(value: string | null | undefined) {
  const type = (value || "").split(";")[0].trim().toLowerCase();
  return PIECE_TYPES.has(type) ? type : null;
}

export async function downloadTwilioMedia(input: {
  url: string;
  accountSid: string;
  authToken: string;
  fetchImpl?: typeof fetch;
}) {
  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "api.twilio.com") return null;
  const auth = Buffer.from(`${input.accountSid}:${input.authToken}`).toString("base64");
  const response = await (input.fetchImpl || fetch)(parsed.toString(), {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!response.ok) return null;
  const contentType = pieceContentType(response.headers.get("content-type"));
  if (!contentType) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > 8_000_000) return null;
  return { bytes, contentType };
}

/** Le dernier message du paquet répond, avec le texte des précédents. */
export function burstReply(sid: string, rows: WhatsappThreadRow[]) {
  if (!rows.length) return { send: true as const, text: null as string | null };
  const index = rows.findIndex((row) => row.twilio_sid === sid);
  if (index === -1) return { send: true as const, text: null as string | null };
  if (rows.slice(index + 1).some((row) => row.direction === "inbound")) {
    return { send: false as const, text: null as string | null };
  }
  let start = 0;
  rows.forEach((row, i) => {
    if (row.direction === "outbound" && i < index) start = i + 1;
  });
  const text = rows
    .slice(start, index + 1)
    .filter((row) => row.direction === "inbound")
    .map((row) => row.body.trim())
    .filter(Boolean)
    .join("\n");
  return { send: true as const, text };
}

export function phoneFromWhatsapp(from: string | null | undefined) {
  const raw = (from || "").replace(/^whatsapp:/i, "").trim();
  if (!raw) return null;
  return toE164(raw, "FR");
}

function inboundBody(params: Record<string, string>) {
  const text = (params.Body || "").trim();
  if (text) return text;
  const media = Number(params.NumMedia || "0");
  if (Number.isFinite(media) && media > 0) return "Document reçu sur WhatsApp.";
  return "";
}

function prefixSigned(signed: string, line: string) {
  const signature = `\n\n${"Le Concierge"}`;
  const body = signed.endsWith(signature) ? signed.slice(0, -signature.length).trim() : signed.trim();
  return withConciergeSignature(`${line}\n${body}`.trim());
}

function statusCallbackOnly(params: Record<string, string>) {
  return Boolean(params.MessageStatus) && !inboundBody(params);
}

export async function receiveWhatsappWebhook(input: {
  url: string;
  signature: string | null;
  params: URLSearchParams | Record<string, string>;
  authToken: string | null | undefined;
  accountSid?: string | null;
  burstWaitMs?: number;
  fetchImpl?: typeof fetch;
  openAccess?(customer: WhatsappCustomer): Promise<string | null>;
  store: WhatsappStore;
  send(message: { to: string; body: string; mediaUrl?: string | null }): Promise<{
    ok: boolean;
    sid?: string;
    detail?: string;
  }>;
}): Promise<{ status: number }> {
  const token = input.authToken?.trim() || "";
  if (!token) return { status: 503 };
  const params = formParams(input.params);
  if (!verifyTwilioSignature({ authToken: token, url: input.url, params, signature: input.signature })) {
    return { status: 403 };
  }
  if (statusCallbackOnly(params)) return { status: 200 };

  const sid = (params.MessageSid || "").trim();
  if (!sid) return { status: 400 };
  if (await input.store.findBySid(sid)) return { status: 200 };

  const e164 = phoneFromWhatsapp(params.From);
  const to = e164 ? sessionAddress(e164) : null;
  const clientText = redactIngestText(inboundBody(params) || "Message vide.");
  if (!to) return { status: 200 };

  const customers = await input.store.customersByPhone(e164!);
  const customer = customers.length === 1 ? customers[0] : null;
  const mediaCount = Number(params.NumMedia || "0");
  const mediaOnly = !(params.Body || "").trim() && Number.isFinite(mediaCount) && mediaCount > 0;
  let piece: WhatsappPieceResult | null = null;
  if (customer && mediaCount > 0 && input.store.savePiece && input.accountSid && token) {
    piece = await storeInboundPieces({
      params,
      customerId: customer.id,
      accountSid: input.accountSid,
      authToken: token,
      fetchImpl: input.fetchImpl,
      savePiece: input.store.savePiece.bind(input.store),
    });
  }

  let journal = clientText;
  if (mediaOnly && piece === "saved") journal = PIECE_MARK;
  if (piece === "pan") journal = "Numéro de carte non conservé.";

  const inbound = await input.store.insertMessage({
    customer_id: customer?.id || null,
    booking_id: null,
    direction: "inbound",
    template_key: null,
    body: journal,
    twilio_sid: sid,
    status: "received",
    error: null,
  });
  if ("duplicate" in inbound) return { status: 200 };

  let said = journal;
  if (customer && input.store.recentThread) {
    const wait = input.burstWaitMs || 0;
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    const decision = burstReply(sid, await input.store.recentThread(customer.id));
    if (!decision.send) return { status: 200 };
    if (decision.text) said = decision.text;
  }

  let bookingId: string | null = null;
  let handoff: HandoffKind | null = null;
  let reply = UNKNOWN_NUMBER_REPLY;
  const lang = messageLanguage(clientText);

  if (!customer) {
    if (customers.length > 1) reply = withConciergeSignature(HANDOFF_SENTENCE);
  } else if (piece === "pan") {
    reply = panRefusedReply(lang);
  } else {
    const parts = said
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const stopping = parts.some((line) => isConciergeStop(line));
    const hadPiece = piece === "saved" || parts.some((line) => line === PIECE_MARK);
    const content = parts.filter((line) => !isConciergeStop(line) && line !== PIECE_MARK).join("\n");
    const raw = await input.store.loadDossier(customer.id);
    const dossier = buildConciergeDossier({ ...raw, firstName: customer.first_name });
    if (!content && hadPiece && !stopping) {
      reply = withConciergeSignature(pieceSavedLine(lang));
    } else {
      const turn = planConciergeTurn(content || said, dossier);
      bookingId = turn.bookingId;
      handoff = turn.handoff;
      const replyLang = messageLanguage(content || said);
      reply = turn.access ? accessLinkReply(replyLang, (await input.openAccess?.(customer)) || null) : turn.text;
      if (hadPiece && !turn.access) reply = prefixSigned(reply, pieceSavedLine(replyLang));
      if (stopping) {
        await input.store.optOut?.(customer.id);
        if (content && !turn.optOut) {
          const stopLine =
            lang === "en"
              ? "The agency’s proactive messages are stopped."
              : "Les messages de l’agence sont coupés.";
          reply = prefixSigned(reply, stopLine);
        }
      }
    }
    if (mediaOnly && piece === "skipped") {
      reply = withConciergeSignature(
        lang === "en"
          ? "I couldn’t save that document. You can send it again, or I can ask the agency."
          : "Je n’ai pas pu enregistrer cette pièce. Vous pouvez la renvoyer, ou j’en parle à l’agence."
      );
      handoff = null;
    }
  }

  if (customer && bookingId) await input.store.tagMessage?.(inbound.id, bookingId);

  const sent = await input.send({ to, body: reply, mediaUrl: null });
  const outbound = await input.store.insertMessage({
    customer_id: customer?.id || null,
    booking_id: bookingId,
    direction: "outbound",
    template_key: "chat",
    body: reply,
    twilio_sid: sent.ok ? sent.sid || null : null,
    status: sent.ok ? "sent" : "failed",
    error: sent.ok ? null : sent.detail || "rejected",
  });
  if (customer && handoff && !("duplicate" in outbound)) {
    await input.store.insertRequest({
      customer_id: customer.id,
      booking_id: bookingId,
      message_id: inbound.id,
      kind: handoff,
      body: redactIngestText(clientText),
    });
  }
  return { status: 200 };
}

async function storeInboundPieces(input: {
  params: Record<string, string>;
  customerId: string;
  accountSid: string;
  authToken: string;
  fetchImpl?: typeof fetch;
  savePiece: NonNullable<WhatsappStore["savePiece"]>;
}): Promise<WhatsappPieceResult> {
  const count = Math.min(Number(input.params.NumMedia || "0") || 0, 5);
  let result: WhatsappPieceResult = "skipped";
  for (let i = 0; i < count; i += 1) {
    const url = input.params[`MediaUrl${i}`] || "";
    if (!url) continue;
    const file = await downloadTwilioMedia({
      url,
      accountSid: input.accountSid,
      authToken: input.authToken,
      fetchImpl: input.fetchImpl,
    });
    if (!file) continue;
    if (file.contentType === "application/pdf" && bytesContainPan(file.bytes)) return "pan";
    const saved = await input.savePiece({
      customerId: input.customerId,
      bytes: file.bytes,
      contentType: file.contentType,
    });
    if (saved === "pan") return "pan";
    if (saved === "saved") result = "saved";
  }
  return result;
}

export function createWhatsappSupabaseStore(admin: SupabaseClient): WhatsappStore {
  return {
    async findBySid(sid) {
      const { data, error } = await admin
        .from("crm_whatsapp_messages")
        .select("id")
        .eq("twilio_sid", sid)
        .maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
    async customersByPhone(e164) {
      const [primary, secondary] = await Promise.all([
        admin.from("crm_customers").select("id, first_name, email").eq("phone", e164),
        admin.from("crm_customers").select("id, first_name, email").eq("phone_secondary", e164),
      ]);
      if (primary.error) throw primary.error;
      if (secondary.error) throw secondary.error;
      const map = new Map<string, WhatsappCustomer>();
      for (const row of [...(primary.data || []), ...(secondary.data || [])]) {
        map.set(row.id, { id: row.id, first_name: row.first_name, email: row.email });
      }
      return [...map.values()];
    },
    async loadDossier(customerId) {
      const { data: bookings, error: bookingError } = await admin
        .from("crm_bookings")
        .select(
          "id, reference, title, destination, start_date, end_date, currency, total_amount, notes_client, visible_to_client, prices_visible, cover_image_path"
        )
        .eq("customer_id", customerId);
      if (bookingError) throw bookingError;
      const ids = (bookings || []).map((booking) => booking.id);
      const [items, docs, visas, txs, balances, papers] = await Promise.all([
        ids.length
          ? admin
              .from("crm_booking_items")
              .select("id, booking_id, kind, title, start_at, end_at, amount, details, visible_to_client")
              .in("booking_id", ids)
          : Promise.resolve({ data: [], error: null }),
        ids.length
          ? admin
              .from("crm_booking_documents")
              .select("id, booking_id, kind, file_name, visible_to_client")
              .in("booking_id", ids)
          : Promise.resolve({ data: [], error: null }),
        ids.length
          ? admin
              .from("crm_visa_requests")
              .select("booking_id, country, status, step")
              .in("booking_id", ids)
          : Promise.resolve({ data: [], error: null }),
        admin
          .from("crm_transactions")
          .select("booking_id, direction, kind, amount, currency, occurred_on, label, status")
          .eq("customer_id", customerId)
          .eq("status", "posted")
          .order("occurred_on", { ascending: false })
          .limit(12),
        admin.from("crm_customer_balances").select("currency, balance").eq("customer_id", customerId),
        admin
          .from("crm_travel_documents")
          .select("doc_type, first_name, last_name, expires_on")
          .eq("customer_id", customerId),
      ]);
      for (const result of [items, docs, visas, txs, balances, papers]) {
        if (result.error) throw result.error;
      }
      return {
        bookings: bookings || [],
        items: items.data || [],
        bookingDocuments: docs.data || [],
        visaRequests: visas.data || [],
        transactions: txs.data || [],
        balances: balances.data || [],
        travelDocuments: papers.data || [],
      };
    },
    async insertMessage(row) {
      const { data, error } = await admin
        .from("crm_whatsapp_messages")
        .insert(row)
        .select("id")
        .single();
      if (error?.code === "23505") return { duplicate: true };
      if (error || !data) throw error || new Error("journal WhatsApp");
      return { id: data.id as string };
    },
    async insertRequest(row) {
      const { error } = await admin.from("crm_whatsapp_requests").insert(row);
      if (error) throw error;
    },
    async optOut(customerId) {
      const { error } = await admin
        .from("crm_customers")
        .update({ whatsapp_opt_out_at: new Date().toISOString() })
        .eq("id", customerId);
      if (error) throw error;
    },
    async recentThread(customerId) {
      const since = new Date(Date.now() - 60_000).toISOString();
      const { data, error } = await admin
        .from("crm_whatsapp_messages")
        .select("direction, body, twilio_sid, created_at")
        .eq("customer_id", customerId)
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(30);
      if (error) throw error;
      return (data || []) as WhatsappThreadRow[];
    },
    async tagMessage(id, bookingId) {
      const { error } = await admin.from("crm_whatsapp_messages").update({ booking_id: bookingId }).eq("id", id);
      if (error) throw error;
    },
    async savePiece({ customerId, bytes, contentType }) {
      const type = pieceContentType(contentType);
      if (!type) return "skipped";
      if (type === "application/pdf" && bytesContainPan(bytes)) return "pan";
      const ext = type === "application/pdf" ? "pdf" : type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
      const path = `customers/${customerId}/whatsapp/${crypto.randomUUID()}.${ext}`;
      await uploadCrmFile(path, Buffer.from(bytes), type);
      const { error } = await admin.from("crm_travel_documents").insert({
        customer_id: customerId,
        doc_type: "other",
        storage_path: path,
        file_name: `piece-whatsapp.${ext}`,
        mime_type: type,
      });
      if (error) throw error;
      return "saved";
    },
  };
}
