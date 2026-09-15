import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { getStripe } from "@/lib/crm/stripe";
import { createServiceClient } from "@/lib/supabase/admin";

export async function PATCH(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => null);
  const id = String(body?.id || "");
  if (!id) return jsonError("id requis");
  const admin = createServiceClient();
  const { data: selected } = await admin
    .from("crm_payment_methods")
    .select("*")
    .eq("id", id)
    .eq("customer_id", auth.customer.id)
    .maybeSingle();
  if (!selected) return jsonError("Carte introuvable", 404);

  const stripe = getStripe();
  if (stripe && auth.customer.stripe_customer_id) {
    await stripe.customers.update(auth.customer.stripe_customer_id, {
      invoice_settings: {
        default_payment_method: selected.stripe_payment_method_id,
      },
    });
  }

  const { error: clearError } = await admin
    .from("crm_payment_methods")
    .update({ is_default: false })
    .eq("customer_id", auth.customer.id);
  if (clearError) return jsonError(clearError.message, 500);
  const { data, error } = await admin
    .from("crm_payment_methods")
    .update({ is_default: true })
    .eq("id", id)
    .eq("customer_id", auth.customer.id)
    .select("*")
    .single();
  if (error) return jsonError(error.message, 400);
  return NextResponse.json({ paymentMethod: data });
}

export async function DELETE(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return jsonError("id requis");
  const admin = createServiceClient();
  const { data: pm } = await admin
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
  const { error } = await admin
    .from("crm_payment_methods")
    .delete()
    .eq("id", id)
    .eq("customer_id", auth.customer.id);
  if (error) return jsonError(error.message, 400);

  if (pm.is_default) {
    const { data: replacement } = await admin
      .from("crm_payment_methods")
      .select("*")
      .eq("customer_id", auth.customer.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (replacement) {
      await admin
        .from("crm_payment_methods")
        .update({ is_default: true })
        .eq("id", replacement.id);
      if (stripe && auth.customer.stripe_customer_id) {
        await stripe.customers.update(auth.customer.stripe_customer_id, {
          invoice_settings: {
            default_payment_method: replacement.stripe_payment_method_id,
          },
        });
      }
    }
  }
  return NextResponse.json({ ok: true });
}
