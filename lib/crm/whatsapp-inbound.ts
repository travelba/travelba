import type { SupabaseClient } from "@supabase/supabase-js";
import { toE164 } from "./phone";
import { signedCrmUrl } from "./files";
import { siteConfig } from "../site";
import { formParams, verifyTwilioSignature } from "./twilio-signature";
import {
  buildConciergeDossier,
  HANDOFF_SENTENCE,
  conciergeFollowUp,
  planConciergeTurn,
  UNKNOWN_NUMBER_REPLY,
  type ConciergeCover,
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

export type WhatsappCustomer = { id: string; first_name: string | null };

export type WhatsappStore = {
  findBySid(sid: string): Promise<boolean>;
  customersByPhone(e164: string): Promise<WhatsappCustomer[]>;
  loadDossier(customerId: string): Promise<Parameters<typeof buildConciergeDossier>[0]>;
  insertMessage(
    row: WhatsappMessageInsert
  ): Promise<{ id: string } | { duplicate: true }>;
  insertRequest(row: WhatsappRequestInsert): Promise<void>;
};

export function phoneFromWhatsapp(from: string | null | undefined) {
  const raw = (from || "").replace(/^whatsapp:/i, "").trim();
  if (!raw) return null;
  return toE164(raw, "FR");
}

export async function conciergeCoverUrl(cover: ConciergeCover | null) {
  if (!cover) return null;
  if (cover.kind === "catalog") return `${siteConfig.url}/api/covers/${cover.photoId}`;
  try {
    const signed = await signedCrmUrl(cover.path, 600);
    return signed.startsWith("https://") ? signed : null;
  } catch {
    return null;
  }
}

function inboundBody(params: Record<string, string>) {
  const text = (params.Body || "").trim();
  if (text) return text;
  const media = Number(params.NumMedia || "0");
  if (Number.isFinite(media) && media > 0) return "Document reçu sur WhatsApp.";
  return "";
}

function statusCallbackOnly(params: Record<string, string>) {
  return Boolean(params.MessageStatus) && !inboundBody(params);
}

export async function receiveWhatsappWebhook(input: {
  url: string;
  signature: string | null;
  params: URLSearchParams | Record<string, string>;
  authToken: string | null | undefined;
  store: WhatsappStore;
  send(message: { to: string; body: string; mediaUrl?: string | null }): Promise<{
    ok: boolean;
    sid?: string;
    detail?: string;
  }>;
  mediaUrl?(cover: ConciergeCover | null): Promise<string | null>;
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
  const said = inboundBody(params) || "Message vide.";
  if (!to) return { status: 200 };

  const customers = await input.store.customersByPhone(e164!);
  const customer = customers.length === 1 ? customers[0] : null;
  let bookingId: string | null = null;
  let handoff: HandoffKind | null = null;
  let reply = UNKNOWN_NUMBER_REPLY;
  let cover: ConciergeCover | null = null;

  if (customer) {
    const raw = await input.store.loadDossier(customer.id);
    const dossier = buildConciergeDossier({ ...raw, firstName: customer.first_name });
    const turn = planConciergeTurn(said, dossier);
    bookingId = turn.bookingId;
    handoff = turn.handoff;
    reply = turn.text;
    cover = turn.cover;
  } else if (customers.length > 1) {
    reply = conciergeFollowUp(HANDOFF_SENTENCE);
  }

  const mediaOnly = !(params.Body || "").trim() && Number(params.NumMedia || "0") > 0;
  if (mediaOnly && customer) {
    reply = conciergeFollowUp(HANDOFF_SENTENCE);
    handoff = null;
    cover = null;
    bookingId = null;
  }

  const inbound = await input.store.insertMessage({
    customer_id: customer?.id || null,
    booking_id: bookingId,
    direction: "inbound",
    template_key: null,
    body: said,
    twilio_sid: sid,
    status: "received",
    error: null,
  });
  if ("duplicate" in inbound) return { status: 200 };

  const mediaUrl = cover ? await (input.mediaUrl || conciergeCoverUrl)(cover) : null;
  const sent = await input.send({ to, body: reply, mediaUrl });
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
      body: said,
    });
  }
  return { status: 200 };
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
        admin.from("crm_customers").select("id, first_name").eq("phone", e164),
        admin.from("crm_customers").select("id, first_name").eq("phone_secondary", e164),
      ]);
      if (primary.error) throw primary.error;
      if (secondary.error) throw secondary.error;
      const map = new Map<string, WhatsappCustomer>();
      for (const row of [...(primary.data || []), ...(secondary.data || [])]) {
        map.set(row.id, { id: row.id, first_name: row.first_name });
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
  };
}
