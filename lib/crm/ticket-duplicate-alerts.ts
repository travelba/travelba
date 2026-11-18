import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TicketDuplicateAlert } from "@/lib/crm/agency-alerts";

/** Alertes « possible doublon de billets » posées sur les cartes vol. Pas de nom de passager. */
export async function loadTicketDuplicateAlerts(admin: SupabaseClient): Promise<TicketDuplicateAlert[]> {
  try {
    const selected = await admin
      .from("crm_booking_items")
      .select("id, booking_id, updated_at, details")
      .eq("kind", "flight")
      .not("details->>ticket_duplicate", "is", null)
      .order("updated_at", { ascending: false })
      .limit(12);
    if (selected.error) return [];
    const rows = (selected.data || []) as {
      id: string;
      booking_id: string;
      updated_at: string | null;
      details?: { ticket_duplicate?: unknown } | null;
    }[];
    const open = rows.filter((row) => row.details?.ticket_duplicate && row.booking_id);
    if (!open.length) return [];
    const ids = [...new Set(open.map((row) => row.booking_id))];
    const bookings = await admin.from("crm_bookings").select("id, reference").in("id", ids);
    const references = new Map(
      ((bookings.data || []) as { id: string; reference: string | null }[]).map((row) => [row.id, row.reference])
    );
    return open.map((row) => ({
      id: row.id,
      at: row.updated_at || new Date(0).toISOString(),
      bookingId: row.booking_id,
      reference: references.get(row.booking_id) || null,
    }));
  } catch {
    return [];
  }
}
