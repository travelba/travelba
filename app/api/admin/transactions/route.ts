import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";

export async function GET() {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await auth.supabase
    .from("crm_transactions")
    .select("*")
    .order("occurred_on", { ascending: false })
    .limit(500);
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ transactions: data });
}

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => null);
  const customerId = String(body?.customer_id || "");
  const amount = Number(body?.amount || 0);
  if (!customerId || !(amount > 0)) return jsonError("Client et montant requis");
  const kind = String(body?.kind || "adjustment");
  const bookingId = body?.booking_id ? String(body.booking_id) : null;
  if (kind === "booking" && !bookingId) return jsonError("Un dossier est requis pour une écriture de réservation");
  if (bookingId) {
    const { data: booking } = await auth.supabase
      .from("crm_bookings")
      .select("id")
      .eq("id", bookingId)
      .eq("customer_id", customerId)
      .maybeSingle();
    if (!booking) return jsonError("Le dossier n’appartient pas au client", 400);
  }
  const { data, error } = await auth.supabase
    .from("crm_transactions")
    .insert({
      customer_id: customerId,
      booking_id: bookingId,
      direction: body?.direction === "credit" ? "credit" : "debit",
      kind,
      amount,
      currency: body?.currency || "EUR",
      occurred_on: body?.occurred_on || undefined,
      label: String(body?.label || "").trim() || "Écriture manuelle",
      source: "manual",
      status: "posted",
    })
    .select("*")
    .single();
  if (error) return jsonError(error.message, 400);
  return NextResponse.json({ transaction: data });
}
