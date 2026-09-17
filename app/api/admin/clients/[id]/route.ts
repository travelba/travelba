import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { customerPatchFromBody } from "@/lib/crm/customer-patch";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const { data, error } = await auth.supabase
    .from("crm_customers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError("Client introuvable", 404);
  return NextResponse.json({ customer: data });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const { patch, error: patchError } = customerPatchFromBody(body, { allowEmail: true });
  if (patchError) return jsonError(patchError);
  const { data, error } = await auth.supabase
    .from("crm_customers")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return jsonError(error.message, 400);
  return NextResponse.json({ customer: data });
}
