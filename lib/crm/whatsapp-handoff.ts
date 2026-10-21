import type { SupabaseClient } from "@supabase/supabase-js";
import { knowledgeSeed } from "./concierge-knowledge";
import { planPhase2 } from "./concierge-phase2";
import { isVercelPreview } from "./preview-secrets";
import { buildConciergeDossier } from "./whatsapp-concierge";
import { generateConciergeReply } from "./whatsapp-conversation";
import { conciergeAutoreplyEnabled, createWhatsappSupabaseStore } from "./whatsapp-inbound";
import { sendWhatsappSession, sessionAddress } from "./whatsapp-session";
import {
  HANDOFF_TEMPLATE_KEY,
  beatFromMessage,
  handoffSystemBody,
  inboundAlreadyHandled,
  takeoverIdleDue,
  threadIsPaused,
  type TakeoverBeat,
} from "./whatsapp-takeover";

/** Une pause « jusqu’au matin » est plus longue. En dessous, c’est le verrou de remise. */
const LONG_PAUSE_MS = 10 * 60 * 1000;
const LOCK_MS = 2 * 60 * 1000;
const LOOKBACK_MS = 48 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

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

/** Répond au message client resté sans réponse, avec le même Concierge qu’un message entrant. */
async function answerUnanswered(
  admin: SupabaseClient,
  input: { phone: string; customerId: string | null; text: string; unansweredAt: string[]; now: Date }
) {
  if (!input.text.trim() || isVercelPreview() || !conciergeAutoreplyEnabled()) return;
  const newest = input.unansweredAt.map((at) => new Date(at).getTime()).filter((at) => Number.isFinite(at));
  const lastAt = newest.length ? Math.max(...newest) : input.now.getTime();
  if (input.now.getTime() - lastAt >= DAY_MS) return;
  const to = sessionAddress(input.phone);
  if (!to) return;
  const store = createWhatsappSupabaseStore(admin);
  const customers = await store.customersByPhone(input.phone);
  const customer = input.customerId
    ? customers.find((row) => row.id === input.customerId) || null
    : customers.length === 1
      ? customers[0]
      : null;
  if (!customer) return;
  if (!input.customerId && customers.length > 1) return;
  const raw = await store.loadDossier(customer.id);
  const dossier = buildConciergeDossier({ ...raw, firstName: customer.first_name });
  const history = (await store.conversationHistory?.(customer.id)) || [];
  const skip = new Set(input.unansweredAt);
  const prior = history
    .filter((row) => !skip.has(row.created_at) && !row.body.startsWith("Conversation rendue au Concierge"))
    .slice(-16)
    .map((row) => ({ direction: row.direction, body: row.body, at: row.created_at }));
  const stored = await store.loadKnowledge?.();
  const phase = await planPhase2({
    phone: input.phone,
    message: input.text,
    dossier,
    history: prior,
    brief: (await store.loadBrief?.(input.phone)) || null,
    generate: generateConciergeReply,
    knowledge: stored?.length ? stored : knowledgeSeed(),
    balance: dossier.balances[0]?.balance ?? null,
    currency: dossier.balances[0]?.currency || "EUR",
    now: input.now,
    lastInbound: new Date(lastAt),
  });
  const turn = phase.turn;
  const bubbles = (turn.messages?.length ? turn.messages : [turn.text]).map((line) => line.trim()).filter(Boolean).slice(0, 3);
  for (let index = 0; index < bubbles.length; index += 1) {
    const sent = await sendWhatsappSession({ to, body: bubbles[index] });
    await store.insertMessage({
      customer_id: customer.id,
      booking_id: turn.bookingId,
      direction: "outbound",
      template_key: "chat",
      body: bubbles[index],
      twilio_sid: sent.ok ? sent.sid || null : null,
      status: sent.ok ? "sent" : "failed",
      error: sent.ok ? null : sent.detail || "rejected",
      phone: input.phone,
      tools: index === 0 ? turn.tools || null : null,
    });
    if (!sent.ok) break;
  }
  if (phase.brief) await store.saveBrief?.(phase.brief, customer.id);
  if (phase.proposal) {
    await store.insertProposal?.({
      ...phase.proposal,
      phone: input.phone,
      customerId: customer.id,
      bookingId: turn.bookingId,
    });
  }
  if (turn.handoff) {
    await store.insertRequest({
      customer_id: customer.id,
      phone: input.phone,
      booking_id: turn.bookingId,
      message_id: null,
      kind: turn.handoff,
      body: input.text.slice(0, 500),
      status: "open",
    });
  }
}

/**
 * Si le fil est tenu par un humain et que le délai de 5 minutes est passé,
 * le rend au Concierge (ligne système, puis réponse au message en attente).
 * `handled` : l’appelant ne doit pas répondre une seconde fois.
 */
export async function settleTakeoverIdle(admin: SupabaseClient, phone: string, now = new Date()): Promise<TakeoverSettle> {
  const trimmed = phone.trim();
  if (!trimmed) return { handled: false };
  const thread = await readThread(admin, trimmed);
  if (!thread || !threadIsPaused(thread.paused_until, now)) {
    const beats = thread ? await readBeats(admin, trimmed, thread.customer_id, now) : [];
    return { handled: inboundAlreadyHandled(beats) };
  }
  const untilMs = new Date(thread.paused_until || "").getTime();
  if (!Number.isFinite(untilMs) || untilMs - now.getTime() < LONG_PAUSE_MS) return { handled: false };
  const beats = await readBeats(admin, trimmed, thread.customer_id, now);
  const decision = takeoverIdleDue({
    pausedUntil: thread.paused_until,
    pausedAt: thread.paused_at,
    beats,
    now,
  });
  if (!decision.due) return { handled: false };
  const lockUntil = new Date(now.getTime() + LOCK_MS).toISOString();
  const claim = await admin
    .from("crm_whatsapp_threads")
    .update({ paused_until: lockUntil, updated_at: now.toISOString() })
    .eq("phone", trimmed)
    .eq("paused_until", thread.paused_until)
    .select("phone");
  if (claim.error || !claim.data?.length) return { handled: false };
  const line = await insertHandoffNote(admin, { phone: trimmed, customerId: thread.customer_id, now });
  try {
    if (decision.unansweredText) {
      await answerUnanswered(admin, {
        phone: trimmed,
        customerId: thread.customer_id,
        text: decision.unansweredText,
        unansweredAt: decision.unansweredAt,
        now,
      });
    }
  } catch {
    console.error("[whatsapp-handoff] reponse");
  }
  const cleared = await admin
    .from("crm_whatsapp_threads")
    .update({ paused_at: null, paused_until: null, paused_by: null, updated_at: new Date().toISOString() })
    .eq("phone", trimmed)
    .eq("paused_until", lockUntil);
  if (cleared.error) console.error("[whatsapp-handoff] pause", cleared.error.code || "");
  return { handled: true, line };
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

/** Cron : les fils tenus jusqu’au matin, pas les verrous de deux minutes. */
export async function runTakeoverHandoff(admin: SupabaseClient, now = new Date()) {
  const horizon = new Date(now.getTime() + LONG_PAUSE_MS).toISOString();
  const { data, error } = await admin.from("crm_whatsapp_threads").select("phone").gt("paused_until", horizon).limit(40);
  if (error) {
    console.error("[whatsapp-handoff] lecture", error.code || "");
    return { checked: 0, released: 0 };
  }
  const phones = ((data || []) as { phone: string }[]).map((row) => row.phone).filter(Boolean);
  let released = 0;
  for (const phone of phones) {
    const result = await settleTakeoverIdle(admin, phone, now);
    if (result.handled && result.line) released += 1;
  }
  return { checked: phones.length, released };
}
