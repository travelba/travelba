import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const title = String(body?.title || "").trim();
  const kind = String(body?.kind || "fee");
  if (!title) return jsonError("Titre requis");
  const { data, error } = await auth.supabase
    .from("crm_booking_items")
    .insert({
      booking_id: id,
      kind,
      title,
      supplier: body?.supplier || null,
      confirmation_ref: body?.confirmation_ref || null,
      start_at: body?.start_at || null,
      end_at: body?.end_at || null,
      amount: body?.amount == null ? null : Number(body.amount),
      sort_order: Number(body?.sort_order || 0),
      details: body?.details || {},
      visible_to_client: false,
    })
    .select("*")
    .single();
  if (error) return jsonError(error.message, 400);
  return NextResponse.json({ item: data });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  await ctx.params;
  const body = await request.json().catch(() => null);
  const itemId = String(body?.id || "");
  if (!itemId) return jsonError("id requis");
  const { data, error } = await auth.supabase
    .from("crm_booking_items")
    .update({
      kind: body.kind,
      title: body.title,
      supplier: body.supplier,
      confirmation_ref: body.confirmation_ref,
      start_at: body.start_at,
      end_at: body.end_at,
      amount: body.amount == null ? null : Number(body.amount),
      sort_order: body.sort_order,
      details: body.details ?? undefined,
    })
    .eq("id", itemId)
    .select("*")
    .single();
  if (error) return jsonError(error.message, 400);
  return NextResponse.json({ item: data });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  await ctx.params;
  const url = new URL(request.url);
  const itemId = url.searchParams.get("itemId");
  if (!itemId) return jsonError("itemId requis");
  const { error } = await auth.supabase
    .from("crm_booking_items")
    .delete()
    .eq("id", itemId);
  if (error) return jsonError(error.message, 400);
  return NextResponse.json({ ok: true });
}
