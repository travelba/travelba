import { NextResponse } from "next/server";
import { dbError, jsonError, requireStaff } from "@/lib/crm/auth";
import { billingParentError } from "@/lib/crm/company-role";
import { customerPatchFromBody } from "@/lib/crm/customer-patch";
import { CustomerDeleteError, deleteCustomerById } from "@/lib/crm/delete-customer";
import type { CompanyRole } from "@/lib/crm/types";

export const runtime = "nodejs";

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
  if (error) return dbError(error, 500);
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

  const { data: current } = await auth.supabase
    .from("crm_customers")
    .select("company_role, billing_parent_id")
    .eq("id", id)
    .maybeSingle();
  if (!current) return jsonError("Client introuvable", 404);

  const nextRole =
    "company_role" in patch ? (patch.company_role as string | null) : current.company_role;
  const nextParent =
    "billing_parent_id" in patch
      ? (patch.billing_parent_id as string | null)
      : current.billing_parent_id;
  let parentRole: CompanyRole | null | undefined;
  let parentFound: boolean | undefined;
  if (nextParent) {
    const { data: parent } = await auth.supabase
      .from("crm_customers")
      .select("id, company_role")
      .eq("id", nextParent)
      .maybeSingle();
    parentFound = Boolean(parent);
    parentRole = (parent?.company_role as CompanyRole | null) || null;
  }
  const parentError = billingParentError({
    selfId: id,
    role: nextRole as CompanyRole | null,
    parentId: nextParent,
    parentFound,
    parentRole,
  });
  if (parentError) return jsonError(parentError);

  const { data, error } = await auth.supabase
    .from("crm_customers")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return dbError(error, 400);
  return NextResponse.json({ customer: data });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  try {
    const result = await deleteCustomerById(id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Suppression impossible";
    const status = err instanceof CustomerDeleteError ? err.status : 400;
    return jsonError(message, status);
  }
}
