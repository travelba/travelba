import { buildConciergeDossier } from "@/lib/crm/whatsapp-concierge";
import { sampleRows, stripReservationIdentity } from "@/lib/crm/concierge-reservation-sim";

type QueryError = { message?: string; code?: string } | null;
type QueryResult = { data: unknown[] | null; error: QueryError };

export type ReservationReader = {
  from(table: string): {
    select(columns: string): {
      limit(count: number): PromiseLike<QueryResult>;
      in(column: string, values: string[]): PromiseLike<QueryResult>;
    };
  };
};

export const RESERVATION_BOOKING_COLUMNS =
  "id, reference, title, destination, start_date, end_date, currency, total_amount, customer_id, visible_to_client, prices_visible, cover_image_path, share_code";

export const RESERVATION_ITEM_COLUMNS = "id, booking_id, kind, title, start_at, end_at, amount, details, visible_to_client";

type RawBooking = {
  id: string;
  reference: string;
  title: string | null;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  currency: string | null;
  total_amount: number | null;
  customer_id: string | null;
  visible_to_client: boolean | null;
  prices_visible: boolean | null;
  cover_image_path: string | null;
  share_code: string | null;
};

type RawItem = {
  id: string;
  booking_id: string;
  kind: string;
  title: string | null;
  start_at: string | null;
  end_at: string | null;
  amount: number | null;
  details: Record<string, unknown> | null;
  visible_to_client: boolean | null;
};

/** Lit des dossiers, sans pièce d’identité. N’écrit rien. */
export async function readReservationCases(
  reader: ReservationReader,
  options: { limit: number; seed?: string }
) {
  const limit = Math.min(Math.max(options.limit, 1), 40);
  const bookings = await reader.from("crm_bookings").select(RESERVATION_BOOKING_COLUMNS).limit(limit * 4);
  if (bookings.error) return { cases: [], error: "lecture" as const };
  const rows = sampleRows((bookings.data || []) as RawBooking[], limit, options.seed || "simulation");
  const ids = rows.map((row) => row.id);
  const items = ids.length
    ? await reader.from("crm_booking_items").select(RESERVATION_ITEM_COLUMNS).in("booking_id", ids)
    : { data: [], error: null };
  if (items.error) return { cases: [], error: "lecture" as const };
  const byBooking = new Map<string, RawItem[]>();
  for (const item of (items.data || []) as RawItem[]) {
    const list = byBooking.get(item.booking_id) || [];
    list.push(stripReservationIdentity(item));
    byBooking.set(item.booking_id, list);
  }
  const cases = rows.map((booking) => ({
    reference: booking.reference,
    dossier: buildConciergeDossier({
      bookings: [
        {
          ...booking,
          title: booking.title || booking.destination || "Séjour",
          currency: booking.currency || "EUR",
          visible_to_client: true,
          prices_visible: false,
          notes_client: null,
        },
      ],
      items: (byBooking.get(booking.id) || []).map((item) => ({
        ...stripReservationIdentity(item),
        title: item.title || "",
        visible_to_client: true,
        supplier: null,
      })),
    } as Parameters<typeof buildConciergeDossier>[0]),
  }));
  return { cases, error: null };
}
