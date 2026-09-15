import type { SupabaseClient } from "@supabase/supabase-js";
import { sessionTtlMs } from "@/lib/agency/wa-ops-config";

export type WaOpsSessionStatus =
  | "collecting"
  | "ready"
  | "sending"
  | "sent"
  | "cancelled";

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
      updated_at: now,
    })
    .select("*")
    .single();
  if (error || !data) {
    // Unique open-session race → reload
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

export async function wasMessageProcessed(
  supabase: SupabaseClient,
  fromDigits: string,
  messageSid: string
) {
  if (!messageSid) return false;
  const { data } = await supabase
    .from("agency_wa_ops_sessions")
    .select("id")
    .eq("from_digits", fromDigits)
    .eq("last_inbound_sid", messageSid)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}
