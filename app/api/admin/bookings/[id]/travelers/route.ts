import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const { data, error } = await auth.supabase
    .from("crm_booking_travelers")
    .insert({
      booking_id: id,
      companion_id: body?.companion_id || null,
      is_account_holder: Boolean(body?.is_account_holder),
      first_name: body?.first_name || null,
      last_name: body?.last_name || null,
    })
    .select("*")
    .single();
  if (error) return jsonError(error.message, 400);
  return NextResponse.json({ traveler: data });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  await ctx.params;
  const travelerId = new URL(request.url).searchParams.get("travelerId");
  if (!travelerId) return jsonError("travelerId requis");
  const { error } = await auth.supabase
    .from("crm_booking_travelers")
    .delete()
    .eq("id", travelerId);
  if (error) return jsonError(error.message, 400);
  return NextResponse.json({ ok: true });
}
