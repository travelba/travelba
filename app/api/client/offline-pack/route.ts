import { NextResponse } from "next/server";
import { dbError, requireCustomer } from "@/lib/crm/auth";
import { offlinePack, type OfflineSource } from "@/lib/crm/offline-pack";
import { stayToday } from "@/lib/crm/stay-moment";

export const runtime = "nodejs";

/** Liste des pièces à garder sur l’appareil. Pas de numéro de passeport, pas de visa. */
export async function GET() {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const today = stayToday();
  const { data: bookings, error } = await auth.supabase
    .from("crm_bookings")
    .select("id, reference, start_date, end_date, status, visible_to_client")
    .eq("visible_to_client", true)
    .neq("status", "cancelled")
    .limit(40);
  if (error) return dbError(error);
  const open = (bookings || []) as {
    id: string;
    reference: string;
    start_date: string | null;
    end_date: string | null;
    status: string;
    visible_to_client: boolean;
  }[];
  if (!open.length) return NextResponse.json({ customerId: auth.customer.id, documents: [] });
  const { data: documents, error: docsError } = await auth.supabase
    .from("crm_booking_documents")
    .select("id, booking_id, kind, file_name, mime_type, storage_path, visible_to_client")
    .in(
      "booking_id",
      open.map((row) => row.id)
    )
    .eq("visible_to_client", true)
    .limit(80);
  if (docsError) return dbError(docsError);
  const byBooking = new Map(open.map((row) => [row.id, row]));
  const sources: OfflineSource[] = ((documents || []) as {
    id: string;
    booking_id: string;
    kind: string;
    file_name: string | null;
    mime_type: string | null;
    storage_path: string;
    visible_to_client: boolean;
  }[]).flatMap((doc) => {
    const booking = byBooking.get(doc.booking_id);
    if (!booking) return [];
    return [
      {
        id: doc.id,
        bookingId: doc.booking_id,
        kind: doc.kind,
        fileName: doc.file_name,
        mimeType: doc.mime_type,
        storagePath: doc.storage_path,
        visible: doc.visible_to_client,
        reference: booking.reference,
        endDate: booking.end_date,
        startDate: booking.start_date,
        status: booking.status,
        bookingVisible: booking.visible_to_client,
      },
    ];
  });
  return NextResponse.json({ customerId: auth.customer.id, documents: offlinePack(sources, today) });
}
