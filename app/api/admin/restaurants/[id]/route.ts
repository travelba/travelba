import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { deleteRestaurant, saveRestaurant } from "@/lib/crm/restaurants-db";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("Requête illisible.");
  const saved = await saveRestaurant(auth.supabase, body, id);
  if ("error" in saved) return jsonError(saved.error || "Enregistrement impossible.");
  return NextResponse.json(saved);
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const removed = await deleteRestaurant(auth.supabase, id);
  if ("error" in removed) return jsonError(removed.error || "Retrait impossible.");
  return NextResponse.json(removed);
}
