import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { customerPatchFromBody } from "@/lib/crm/customer-patch";

export async function PATCH(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => ({}));
  const { patch, error: patchError } = customerPatchFromBody(body, { strictPhones: true });
  if (patchError) return jsonError(patchError);
  const { data, error } = await auth.supabase
    .from("crm_customers")
    .update(patch)
    .eq("id", auth.customer.id)
    .select("*")
    .single();
  if (error) return jsonError(error.message, 400);
  return NextResponse.json({ customer: data });
}
