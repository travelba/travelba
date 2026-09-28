import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clipPortalText, portalEvent, type PortalLogEvent, type PortalLogKind } from "./eta-il-log";
import { redactPassportNumbers } from "./eta-il-session";
import { notifyVisaDeskEvent, redactDeskText } from "./visa-desk-mail";

export async function clearPortalEvents(db: SupabaseClient, bookingId: string) {
  await db.from("crm_visa_portal_events").delete().eq("booking_id", bookingId).eq("country", "IL");
}

export async function writePortalEvent(db: SupabaseClient, bookingId: string, event: PortalLogEvent) {
  const text = clipPortalText(redactDeskText(redactPassportNumbers(event.text, [])));
  if (!text) return;
  await db.from("crm_visa_portal_events").insert({
    booking_id: bookingId,
    country: "IL",
    kind: event.kind,
    body: text,
  });
  let reference = "Dossier";
  try {
    const { data } = await db.from("crm_bookings").select("reference").eq("id", bookingId).maybeSingle();
    const found = (data as { reference?: string } | null)?.reference?.trim();
    if (found) reference = found;
  } catch {
    reference = "Dossier";
  }
  await notifyVisaDeskEvent({ reference, bookingId, kind: event.kind, text });
}

export async function readPortalEvents(db: SupabaseClient, bookingId: string): Promise<PortalLogEvent[]> {
  const { data } = await db
    .from("crm_visa_portal_events")
    .select("kind, body, created_at")
    .eq("booking_id", bookingId)
    .eq("country", "IL")
    .order("created_at", { ascending: true })
    .limit(80);
  return ((data || []) as { kind: PortalLogKind; body: string; created_at: string }[]).map((row) =>
    portalEvent(row.kind, redactPassportNumbers(row.body || "", []), row.created_at)
  );
}
