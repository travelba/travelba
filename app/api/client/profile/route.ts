import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";

export async function PATCH(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  for (const key of [
    "first_name",
    "last_name",
    "phone",
    "whatsapp",
    "birth_date",
    "nationality",
    "address_line",
    "postal_code",
    "city",
    "country",
  ]) {
    if (key in body) {
      const value = body[key];
      patch[key] = value === "" || value == null ? null : value;
    }
  }
  const { data, error } = await auth.supabase
    .from("crm_customers")
    .update(patch)
    .eq("id", auth.customer.id)
    .select("*")
    .single();
  if (error) return jsonError(error.message, 400);
  return NextResponse.json({ customer: data });
}
