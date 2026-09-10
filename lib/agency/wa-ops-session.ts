import type { SupabaseClient } from "@supabase/supabase-js";
import type { TwilioInboundMedia } from "@/lib/agency/twilio-inbound";
import { sessionTtlMs } from "@/lib/agency/wa-ops-config";

export type WaOpsSessionStatus =
  | "collecting"
  | "ready"
  | "sending"
  | "sent"
  | "cancelled";

export type WaOpsAwaiting = "contact" | "send_confirm" | "new_or_same" | null;

export type WaOpsHistoryTurn = {
  role: "staff" | "agent";
  text: string;
  at: string;
};

export type WaOpsPendingInbound = {
  sid: string;
  body: string;
  buttonPayload: string | null;
  media: TwilioInboundMedia[];
  at: string;
};

export type WaOpsContact = { phone?: string; email?: string };

export type WaOpsSessionNotes = {
  awaiting: WaOpsAwaiting;
  history: WaOpsHistoryTurn[];
  pending: WaOpsPendingInbound[];
  seenSids: string[];
  contact: WaOpsContact;
  ackedBatchAt?: string | null;
};

export type WaOpsSession = {
  id: string;
  from_digits: string;
  guide_id: string | null;
  owner_user_id: string;
  status: WaOpsSessionStatus;
  last_message_at: string;
  last_inbound_sid: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const emptyNotes = (): WaOpsSessionNotes => ({
  awaiting: null,
  history: [],
  pending: [],
  seenSids: [],
  contact: {},
  ackedBatchAt: null,
});

export function parseSessionNotes(raw: string | null | undefined): WaOpsSessionNotes {
  const base = emptyNotes();
  if (!raw?.trim()) return base;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return base;

    const legacyPhone =
      typeof parsed.phone === "string" ? parsed.phone : undefined;
    const legacyEmail =
      typeof parsed.email === "string" ? parsed.email : undefined;
    const contactObj =
      parsed.contact && typeof parsed.contact === "object"
        ? (parsed.contact as WaOpsContact)
        : {};

    const awaiting = parsed.awaiting;
    const awaitingOk: WaOpsAwaiting =
      awaiting === "contact" ||
      awaiting === "send_confirm" ||
      awaiting === "new_or_same"
        ? awaiting
        : null;

    return {
      awaiting: awaitingOk,
      history: Array.isArray(parsed.history)
        ? (parsed.history as WaOpsHistoryTurn[]).slice(-8)
        : [],
      pending: Array.isArray(parsed.pending)
        ? (parsed.pending as WaOpsPendingInbound[])
        : [],
      seenSids: Array.isArray(parsed.seenSids)
        ? (parsed.seenSids as string[]).slice(-80)
        : [],
      contact: {
        phone: contactObj.phone || legacyPhone,
        email: contactObj.email || legacyEmail,
      },
      ackedBatchAt:
        typeof parsed.ackedBatchAt === "string" ? parsed.ackedBatchAt : null,
    };
  } catch {
    return base;
  }
}

export function stringifySessionNotes(notes: WaOpsSessionNotes): string {
  const compact: WaOpsSessionNotes = {
    awaiting: notes.awaiting,
    history: (notes.history || []).slice(-8).map((t) => ({
      ...t,
      text: (t.text || "").slice(0, 400),
    })),
    pending: notes.pending || [],
    seenSids: (notes.seenSids || []).slice(-80),
    contact: notes.contact || {},
    ackedBatchAt: notes.ackedBatchAt || null,
  };
  return JSON.stringify(compact);
}

export async function findOpenSession(
  supabase: SupabaseClient,
  fromDigits: string
): Promise<WaOpsSession | null> {
  const { data, error } = await supabase
    .from("agency_wa_ops_sessions")
    .select("*")
    .eq("from_digits", fromDigits)
    .in("status", ["collecting", "ready", "sending"])
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const session = data as WaOpsSession;
  const age = Date.now() - new Date(session.last_message_at).getTime();
  if (age > sessionTtlMs()) {
    await updateSession(supabase, session.id, { status: "cancelled" });
    return null;
  }
  return session;
}

export async function createSession(
  supabase: SupabaseClient,
  input: {
    fromDigits: string;
    ownerUserId: string;
    guideId: string | null;
    inboundSid?: string | null;
    notes?: WaOpsSessionNotes | null;
  }
): Promise<WaOpsSession> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("agency_wa_ops_sessions")
    .insert({
      from_digits: input.fromDigits,
      owner_user_id: input.ownerUserId,
      guide_id: input.guideId,
      status: "collecting",
      last_message_at: now,
      last_inbound_sid: input.inboundSid || null,
      notes: input.notes ? stringifySessionNotes(input.notes) : null,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error || !data) {
    const existing = await findOpenSession(supabase, input.fromDigits);
    if (existing) return existing;
    throw new Error(error?.message || "Session WhatsApp impossible");
  }
  return data as WaOpsSession;
}

export async function updateSession(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<
    Pick<
      WaOpsSession,
      "guide_id" | "status" | "last_inbound_sid" | "notes" | "last_message_at"
    >
  >
): Promise<WaOpsSession> {
  const { data, error } = await supabase
    .from("agency_wa_ops_sessions")
    .update({
      ...patch,
      last_message_at: patch.last_message_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message || "MAJ session impossible");
  return data as WaOpsSession;
}

export async function saveSessionNotes(
  supabase: SupabaseClient,
  session: WaOpsSession,
  notes: WaOpsSessionNotes,
  extra?: Partial<Pick<WaOpsSession, "status" | "guide_id" | "last_inbound_sid">>
): Promise<WaOpsSession> {
  return updateSession(supabase, session.id, {
    notes: stringifySessionNotes(notes),
    ...extra,
  });
}

export async function wasMessageProcessed(
  supabase: SupabaseClient,
  fromDigits: string,
  messageSid: string
) {
  if (!messageSid) return false;
  const { data } = await supabase
    .from("agency_wa_ops_sessions")
    .select("id, last_inbound_sid, notes")
    .eq("from_digits", fromDigits)
    .order("updated_at", { ascending: false })
    .limit(3);
  const rows = (data || []) as Array<{
    last_inbound_sid: string | null;
    notes: string | null;
  }>;
  return rows.some((row) => {
    if (row.last_inbound_sid === messageSid) return true;
    const notes = parseSessionNotes(row.notes);
    return (
      notes.seenSids.includes(messageSid) ||
      notes.pending.some((p) => p.sid === messageSid)
    );
  });
}
