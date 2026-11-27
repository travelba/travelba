import type { SupabaseClient } from "@supabase/supabase-js";
import { customerFullName } from "@/lib/crm/types";
import { CUSTOMER_NAME_SELECT, type CustomerNameRow } from "@/lib/crm/customer-search";
import {
  directDeskMoneyActions,
  directStayOnDesk,
  type ClientPhase,
  type DirectStay,
} from "@/lib/crm/hotel-direct";

export type DirectDeskStay = {
  id: string;
  customerId: string;
  phase: ClientPhase;
  payMethod: string;
  trial: boolean;
  hotel: string;
  confirmation: string | null;
  clientName: string | null;
  dossierHref: string | null;
  dossierLabel: string | null;
};

type DeskRow = {
  id: string;
  customer_id: string;
  booking_id: string | null;
  phase: string;
  pay_method: string;
  trial: boolean | null;
  state: Partial<DirectStay> | null;
};

export function toDirectDeskStay(
  row: DeskRow,
  extra: { clientName?: string | null; dossierHref?: string | null; dossierLabel?: string | null } = {}
): DirectDeskStay | null {
  if (!directStayOnDesk({ phase: row.phase, trial: row.trial, state: row.state })) return null;
  if (!directDeskMoneyActions(row.phase)) return null;
  return {
    id: row.id,
    customerId: row.customer_id,
    phase: row.phase as ClientPhase,
    payMethod: row.pay_method,
    trial: row.trial !== false,
    hotel: row.state?.hotelName || "",
    confirmation: row.state?.confirmation || null,
    clientName: extra.clientName || null,
    dossierHref: extra.dossierHref || null,
    dossierLabel: extra.dossierLabel || null,
  };
}

/** File des demandes hôtel encore actionnables. `bookingId` limite au dossier. */
export async function loadHotelDirectDesk(
  admin: SupabaseClient,
  scope: { bookingId?: string; surface?: "file" | "dossier" } = {}
): Promise<DirectDeskStay[]> {
  try {
    let query = admin
      .from("crm_hotel_direct_stays")
      .select("id, customer_id, booking_id, phase, pay_method, trial, state")
      .in("phase", ["transmitted", "confirming", "refunding", "confirmed"])
      .order("created_at", { ascending: false })
      .limit(200);
    if (scope.bookingId) query = query.eq("booking_id", scope.bookingId);
    const { data, error } = await query;
    if (error || !data) return [];
    const rows = (data as DeskRow[]).filter((row) => directStayOnDesk({ phase: row.phase, trial: row.trial, state: row.state }));
    if (!rows.length) return [];
    const surface = scope.surface || "file";
    const names = new Map<string, string>();
    const bookings = new Map<string, string>();
    if (surface === "file") {
      const customerIds = [...new Set(rows.map((row) => row.customer_id))];
      const bookingIds = [...new Set(rows.map((row) => row.booking_id).filter((id): id is string => Boolean(id)))];
      const [customers, dossiers] = await Promise.all([
        admin.from("crm_customers").select(CUSTOMER_NAME_SELECT).in("id", customerIds),
        bookingIds.length
          ? admin.from("crm_bookings").select("id, reference").in("id", bookingIds)
          : Promise.resolve({ data: [] as { id: string; reference: string | null }[] }),
      ]);
      for (const row of (customers.data || []) as CustomerNameRow[]) names.set(row.id, customerFullName(row));
      for (const row of (dossiers.data || []) as { id: string; reference: string | null }[]) {
        if (row.reference) bookings.set(row.id, row.reference);
      }
    }
    return rows.flatMap((row) => {
      const stay = toDirectDeskStay(row, {
        clientName: surface === "file" ? names.get(row.customer_id) || "Client" : null,
        dossierHref: surface === "file" && row.booking_id ? `/admin/reservations/${row.booking_id}` : null,
        dossierLabel: surface === "file" && row.booking_id ? bookings.get(row.booking_id) || null : null,
      });
      return stay ? [stay] : [];
    });
  } catch {
    return [];
  }
}
