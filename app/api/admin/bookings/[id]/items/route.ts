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
    })
    .select("*")
    .single();
  if (error) return jsonError(error.message, 400);
  return NextResponse.json({ item: data });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonError("Corps de requête invalide");
  }
  const itemId = String(body?.id || "");
  if (!itemId) return jsonError("id requis");
  const patch: Record<string, unknown> = {};
  for (const key of [
    "kind",
    "title",
    "supplier",
    "confirmation_ref",
    "start_at",
    "end_at",
    "amount",
    "sort_order",
  ]) {
    if (key in body) {
      patch[key] =
        key === "amount"
          ? body[key] === "" || body[key] == null
            ? null
            : Number(body[key])
          : body[key];
    }
  }
  if ("title" in patch && !String(patch.title || "").trim()) {
    return jsonError("Titre requis");
  }
  if (!Object.keys(patch).length) return jsonError("Aucune modification");
  const { data, error } = await auth.supabase
    .from("crm_booking_items")
    .update(patch)
    .eq("id", itemId)
    .eq("booking_id", id)
    .select("*")
    .single();
  if (error) return jsonError(error.message, 400);
  return NextResponse.json({ item: data });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const url = new URL(request.url);
  const itemId = url.searchParams.get("itemId");
  if (!itemId) return jsonError("itemId requis");
  const { error } = await auth.supabase
    .from("crm_booking_items")
    .delete()
    .eq("id", itemId)
    .eq("booking_id", id);
  if (error) return jsonError(error.message, 400);
  return NextResponse.json({ ok: true });
}
