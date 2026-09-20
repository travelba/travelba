import { NextResponse } from "next/server";
import { dbError, jsonError, requireCustomer } from "@/lib/crm/auth";
import { customerPatchFromBody } from "@/lib/crm/customer-patch";

export async function PATCH(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => ({}));
  const { patch, error: patchError } = customerPatchFromBody(body, {
    strictPhones: true,
    requirePhone: true,
  });
  if (patchError) return jsonError(patchError);
  const { data, error } = await auth.supabase
    .from("crm_customers")
    .update(patch)
    .eq("id", auth.customer.id)
    .select("*")
    .single();
  if (error) return dbError(error, 400);
  return NextResponse.json({ customer: data });
}
