import { NextResponse } from "next/server";
import { dbError, jsonError, requireCustomer } from "@/lib/crm/auth";
import { getStripe } from "@/lib/crm/stripe";

export async function PATCH(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => null);
  const id = String(body?.id || "");
  if (!id) return jsonError("id requis");
  await auth.supabase
    .from("crm_payment_methods")
    .update({ is_default: false })
    .eq("customer_id", auth.customer.id);
  const { data, error } = await auth.supabase
    .from("crm_payment_methods")
    .update({ is_default: true })
    .eq("id", id)
    .eq("customer_id", auth.customer.id)
    .select("*")
    .single();
  if (error) return dbError(error, 400);
  return NextResponse.json({ paymentMethod: data });
}

export async function DELETE(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return jsonError("id requis");
  const { data: pm } = await auth.supabase
    .from("crm_payment_methods")
    .select("*")
    .eq("id", id)
    .eq("customer_id", auth.customer.id)
    .maybeSingle();
  if (!pm) return jsonError("Carte introuvable", 404);
  const stripe = getStripe();
  if (stripe) {
    try {
      await stripe.paymentMethods.detach(pm.stripe_payment_method_id);
    } catch {
      // already detached
    }
  }
  const { error } = await auth.supabase
    .from("crm_payment_methods")
    .delete()
    .eq("id", id);
  if (error) return dbError(error, 400);
  return NextResponse.json({ ok: true });
}
