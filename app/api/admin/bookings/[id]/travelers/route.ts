import { NextResponse } from "next/server";
import { dbError, jsonError, jsonIssues, requireStaff } from "@/lib/crm/auth";
import { refreshTicketingFee } from "@/lib/crm/bookings";
import { reconcileCustomerParty } from "@/lib/crm/reconcile-party";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const companionId = String(body?.companion_id || "").trim();
  const isHolder = Boolean(body?.is_account_holder);
  if (!companionId && !isHolder) {
    return jsonIssues([
      {
        field: "companion_id",
        message: "Choisissez un voyageur du foyer (titulaire ou accompagnateur).",
      },
    ]);
  }
  const { data: booking } = await auth.supabase
    .from("crm_bookings")
    .select("customer_id")
    .eq("id", id)
    .maybeSingle();
  if (!booking) return jsonError("Réservation introuvable", 404);
  let firstName = String(body?.first_name || "").trim() || null;
  let lastName = String(body?.last_name || "").trim() || null;
  if (isHolder) {
    const { data: holder } = await auth.supabase
      .from("crm_customers")
      .select("first_name, last_name")
      .eq("id", booking.customer_id)
      .maybeSingle();
    firstName = holder?.first_name || firstName;
    lastName = holder?.last_name || lastName;
  } else {
    const { data: companion } = await auth.supabase
      .from("crm_travel_companions")
      .select("first_name, last_name")
      .eq("id", companionId)
      .eq("customer_id", booking.customer_id)
      .maybeSingle();
    if (!companion) {
      return jsonIssues([{ field: "companion_id", message: "Ce voyageur n’est pas sur le compte client." }]);
    }
    firstName = companion.first_name;
    lastName = companion.last_name;
  }
  const { data, error } = await auth.supabase
    .from("crm_booking_travelers")
    .insert({
      booking_id: id,
      companion_id: isHolder ? null : companionId,
      is_account_holder: isHolder,
      first_name: firstName,
      last_name: lastName,
    })
    .select("*")
    .single();
  if (error) return dbError(error, 400);
  await reconcileCustomerParty(booking.customer_id, auth.supabase);
  await refreshTicketingFee(auth.supabase, id);
  return NextResponse.json({ traveler: data });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const travelerId = new URL(request.url).searchParams.get("travelerId");
  if (!travelerId) return jsonError("travelerId requis");
  const { error } = await auth.supabase
    .from("crm_booking_travelers")
    .delete()
    .eq("id", travelerId)
    .eq("booking_id", id);
  if (error) return dbError(error, 400);
  await refreshTicketingFee(auth.supabase, id);
  return NextResponse.json({ ok: true });
}
