import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const companionId = body?.companion_id ? String(body.companion_id) : null;
  if (companionId) {
    const [{ data: booking }, { data: companion }] = await Promise.all([
      auth.supabase
        .from("crm_bookings")
        .select("customer_id")
        .eq("id", id)
        .maybeSingle(),
      auth.supabase
        .from("crm_travel_companions")
        .select("customer_id")
        .eq("id", companionId)
        .maybeSingle(),
    ]);
    if (!booking || !companion || booking.customer_id !== companion.customer_id) {
      return jsonError("Le compagnon n’appartient pas au client de cette réservation.");
    }
  }
  const { data, error } = await auth.supabase
    .from("crm_booking_travelers")
    .insert({
      booking_id: id,
      companion_id: companionId,
      is_account_holder: Boolean(body?.is_account_holder),
      first_name: body?.first_name || null,
      last_name: body?.last_name || null,
    })
    .select("*")
    .single();
  if (error) return jsonError(error.message, 400);
  return NextResponse.json({ traveler: data });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const travelerId = String(body?.id || "");
  if (!travelerId) return jsonError("id requis");

  const firstName = String(body?.first_name || "").trim();
  const lastName = String(body?.last_name || "").trim();
  if (!firstName || !lastName) return jsonError("Nom et prénom requis");

  const { data, error } = await auth.supabase
    .from("crm_booking_travelers")
    .update({
      first_name: firstName,
      last_name: lastName,
      is_account_holder: Boolean(body?.is_account_holder),
    })
    .eq("id", travelerId)
    .eq("booking_id", id)
    .select("*")
    .maybeSingle();
  if (error) return jsonError(error.message, 400);
  if (!data) return jsonError("Voyageur introuvable", 404);
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
  if (error) return jsonError(error.message, 400);
  return NextResponse.json({ ok: true });
}
