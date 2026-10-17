import { NextResponse } from "next/server";
import { createBookingSchema, parseBody } from "@/lib/crm/admin-schemas";
import { dbError, jsonError, jsonIssues, requireStaff } from "@/lib/crm/auth";
import { collectManualCreateIssues } from "@/lib/crm/booking-issues";
import { createStaffBooking, StaffWriteError } from "@/lib/crm/booking-create";
import { createServiceClient } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await auth.supabase
    .from("crm_bookings")
    .select("*")
    .order("start_date", { ascending: false, nullsFirst: false });
  if (error) return dbError(error, 500);
  return NextResponse.json({ bookings: data });
}

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const createIssues = collectManualCreateIssues({
    customerId: String(raw?.customer_id || ""),
    title: String(raw?.title || ""),
  });
  if (createIssues.length) return jsonIssues(createIssues);
  const parsed = parseBody(createBookingSchema, raw);
  if (parsed.error !== null) return jsonError(parsed.error, 400);
  try {
    // La RPC n’est plus exécutable par le rôle authenticated (B-14).
    const created = await createStaffBooking(auth.supabase, parsed.data, createServiceClient());
    return NextResponse.json({
      booking: created.booking,
      ...(created.ledgerWarning ? { ledger_warning: created.ledgerWarning } : {}),
    });
  } catch (err) {
    if (err instanceof StaffWriteError) {
      if (err.issues?.length) return jsonIssues(err.issues, err.status);
      return jsonError(err.message, err.status);
    }
    console.error("[bookings]", err);
    return jsonError("Impossible de créer le dossier. Réessayez.", 500);
  }
}
