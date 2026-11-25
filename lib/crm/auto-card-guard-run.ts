import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toAuditRow } from "@/lib/crm/audit-events";
import { extractReferences } from "@/lib/crm/email-match";
import { type BookingExtract } from "@/lib/crm/ingest-types";
import { filterAutomaticExtract, skippedCardSummary, type CancelledReservation } from "@/lib/crm/auto-card-guard";
import { REMOVED_STEP_PREFIX, removedStepsFromJournal, type StepIdentity } from "@/lib/crm/step-journal";

function logGuard(error: { message?: string } | null) {
  if (error) console.error("[auto-carte]", error.message || "lecture impossible");
}

export async function loadRemovedSteps(admin: SupabaseClient, bookingId: string): Promise<StepIdentity[]> {
  const { data, error } = await admin
    .from("crm_agency_journal")
    .select("action, summary, diff")
    .eq("entity_type", "dossier")
    .eq("entity_id", bookingId)
    .eq("action", "delete")
    .like("summary", `${REMOVED_STEP_PREFIX}%`)
    .order("seq", { ascending: false })
    .limit(200);
  if (error) {
    logGuard(error);
    return [];
  }
  return removedStepsFromJournal((data || []) as { action?: string; summary?: string; diff?: unknown }[]);
}

export async function loadCancelledReservations(
  admin: SupabaseClient,
  extract: BookingExtract
): Promise<CancelledReservation[]> {
  const tokens = [...extractReferences(extract)].map((token) => token.replace(/[%_]/g, "")).filter((token) => token.length >= 4);
  if (!tokens.length) return [];
  const { data, error } = await admin
    .from("crm_booking_items")
    .select("confirmation_ref, lifecycle, details, booking_id")
    .or(tokens.map((token) => `confirmation_ref.ilike.%${token}%`).join(","))
    .limit(40);
  if (error) {
    logGuard(error);
    return [];
  }
  const rows = (data || []) as {
    confirmation_ref?: string | null;
    lifecycle?: string | null;
    details?: Record<string, unknown> | null;
    booking_id?: string | null;
  }[];
  const ids = [...new Set(rows.map((row) => row.booking_id).filter((id): id is string => Boolean(id)))];
  const status = new Map<string, string>();
  if (ids.length) {
    const bookings = await admin.from("crm_bookings").select("id, status").in("id", ids);
    if (bookings.error) logGuard(bookings.error);
    for (const booking of bookings.data || []) {
      status.set(String(booking.id), String(booking.status || ""));
    }
  }
  return rows
    .map((row) => ({
      confirmation_ref: row.confirmation_ref || null,
      lifecycle: row.lifecycle || null,
      details: row.details || null,
      booking_status: row.booking_id ? status.get(row.booking_id) || null : null,
    }))
    .filter((row) => row.booking_status === "cancelled" || row.lifecycle === "cancelled");
}

async function noteSkipped(
  admin: SupabaseClient,
  input: { bookingId: string | null; emailIngestId?: string | null; customerId?: string | null },
  skipped: { title: string; reason: "retiree" | "annulee" | "marquee" }[]
) {
  if (!skipped.length) return;
  try {
    const rows = skipped.map((item) =>
      toAuditRow({
        actorKind: "auto",
        action: "auto_carte_ecartee",
        emailIngestId: input.emailIngestId,
        bookingId: input.bookingId,
        customerId: input.customerId,
        summary: skippedCardSummary(item),
        detail: { raison: item.reason, titre: item.title },
      })
    );
    const { error } = await admin.from("crm_audit_events").insert(rows);
    if (error) logGuard(error);
  } catch (err) {
    logGuard(err instanceof Error ? err : { message: "journal" });
  }
}

/**
 * Cartes que le rattachement automatique peut encore écrire.
 * Une carte retirée par l’agence, ou une réservation annulée, ne revient pas en carte active.
 * `null` : il ne reste aucune carte à écrire.
 */
export async function guardAutomaticExtract(
  admin: SupabaseClient,
  input: {
    bookingId: string | null;
    extract: BookingExtract;
    emailIngestId?: string | null;
    customerId?: string | null;
  }
): Promise<BookingExtract | null> {
  const [removed, cancelled] = await Promise.all([
    input.bookingId ? loadRemovedSteps(admin, input.bookingId) : Promise.resolve([]),
    loadCancelledReservations(admin, input.extract),
  ]);
  const filtered = filterAutomaticExtract(input.extract, { removed, cancelled });
  await noteSkipped(admin, input, filtered.skipped);
  const items = filtered.extract.items || [];
  if (!items.length) return null;
  return filtered.extract;
}
