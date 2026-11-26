import type { SupabaseClient } from "@supabase/supabase-js";
import {
  HANDOFF_TEMPLATE_KEY,
  beatFromMessage,
  handoffSystemBody,
  inboundAlreadyHandled,
  threadIsPaused,
  type TakeoverBeat,
} from "./whatsapp-takeover";

const LOOKBACK_MS = 48 * 60 * 60 * 1000;

type ThreadRow = {
  phone: string;
  customer_id: string | null;
  paused_at: string | null;
  paused_until: string | null;
};

type MessageRow = {
  direction: string;
  template_key: string | null;
  author_staff_id: string | null;
  created_at: string;
  body: string | null;
};

export type TakeoverSettle = { handled: boolean; line?: string };

async function readThread(admin: SupabaseClient, phone: string): Promise<ThreadRow | null> {
  const { data, error } = await admin
    .from("crm_whatsapp_threads")
    .select("phone, customer_id, paused_at, paused_until")
    .eq("phone", phone)
    .maybeSingle();
  if (error || !data) return null;
  return data as ThreadRow;
}

async function readBeats(admin: SupabaseClient, phone: string, customerId: string | null, now: Date): Promise<TakeoverBeat[]> {
  const since = new Date(now.getTime() - LOOKBACK_MS).toISOString();
  const [byPhone, byCustomer] = await Promise.all([
    admin
      .from("crm_whatsapp_messages")
      .select("direction, template_key, author_staff_id, created_at, body")
      .eq("phone", phone)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200),
    customerId
      ? admin
          .from("crm_whatsapp_messages")
          .select("direction, template_key, author_staff_id, created_at, body")
          .eq("customer_id", customerId)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const rows = [...((byPhone.data || []) as MessageRow[]), ...((byCustomer.data || []) as MessageRow[])];
  const seen = new Set<string>();
  const beats: TakeoverBeat[] = [];
  for (const row of rows) {
    const key = `${row.created_at}:${row.direction}:${row.body || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    beats.push(beatFromMessage(row));
  }
  return beats;
}

async function insertHandoffNote(
  admin: SupabaseClient,
  input: { phone: string; customerId: string | null; now: Date }
) {
  const body = handoffSystemBody(input.now);
  const full = {
    customer_id: input.customerId,
    booking_id: null,
    direction: "outbound",
    template_key: HANDOFF_TEMPLATE_KEY,
    body,
    twilio_sid: null,
    status: "sent",
    error: null,
    phone: input.phone,
    dedupe_key: `handoff:${input.phone}:${input.now.toISOString().slice(0, 16)}`,
  };
  let attempt = await admin.from("crm_whatsapp_messages").insert(full);
  if (attempt.error?.code === "23505") return body;
  if (attempt.error && /column|schema cache|dedupe_key/i.test(attempt.error.message || "")) {
    attempt = await admin.from("crm_whatsapp_messages").insert({
      customer_id: input.customerId,
      booking_id: null,
      direction: "outbound",
      template_key: HANDOFF_TEMPLATE_KEY,
      body,
      twilio_sid: null,
      status: "sent",
      error: null,
    });
  }
  if (attempt.error && attempt.error.code !== "23505") {
    console.error("[whatsapp-handoff] systeme", attempt.error.code || "");
  }
  return body;
}

/**
 * Le fil est tenu par l’équipe jusqu’à `paused_until` (12 h par défaut).
 * Le cron ne rend plus le fil au bout de 5 minutes, et ne répond pas à la place de l’agence.
 * `handled` : une réponse est déjà partie après le dernier message client.
 */
export async function settleTakeoverIdle(admin: SupabaseClient, phone: string, now = new Date()): Promise<TakeoverSettle> {
  const trimmed = phone.trim();
  if (!trimmed) return { handled: false };
  const thread = await readThread(admin, trimmed);
  if (thread && threadIsPaused(thread.paused_until, now)) return { handled: false };
  const beats = thread ? await readBeats(admin, trimmed, thread.customer_id, now) : [];
  return { handled: inboundAlreadyHandled(beats) };
}

/** Clic « Rendre au Concierge » : lève la pause et écrit la même ligne système. */
export async function releaseThreadToConcierge(
  admin: SupabaseClient,
  input: { phone: string; customerId: string | null; now?: Date }
) {
  const now = input.now || new Date();
  const cleared = await admin
    .from("crm_whatsapp_threads")
    .update({ paused_at: null, paused_until: null, paused_by: null, updated_at: now.toISOString() })
    .eq("phone", input.phone);
  if (cleared.error) return { ok: false as const };
  const line = await insertHandoffNote(admin, { phone: input.phone, customerId: input.customerId, now });
  return { ok: true as const, status: "robot" as const, at: now.toISOString(), line };
}

/** Le verrou humain expire tout seul. Le cron ne rend plus le fil, et n’envoie rien. */
export async function runTakeoverHandoff(_admin: SupabaseClient, _now = new Date()) {
  return { checked: 0, released: 0 };
}
