import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";

export async function GET() {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await auth.supabase
    .from("crm_travel_companions")
    .select("*")
    .eq("customer_id", auth.customer.id)
    .order("last_name");
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ companions: data });
}

export async function POST(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => null);
  const first = String(body?.first_name || "").trim();
  const last = String(body?.last_name || "").trim();
  if (!first || !last) return jsonError("Nom et prénom requis");
  const { data, error } = await auth.supabase
    .from("crm_travel_companions")
    .insert({
      customer_id: auth.customer.id,
      first_name: first,
      last_name: last,
      birth_date: body?.birth_date || null,
      sex: body?.sex || null,
      nationality: body?.nationality || null,
      relationship: body?.relationship || null,
    })
    .select("*")
    .single();
  if (error) return jsonError(error.message, 400);
  return NextResponse.json({ companion: data });
}

export async function PATCH(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => null);
  const id = String(body?.id || "");
  if (!id) return jsonError("id requis");
  const first = String(body?.first_name || "").trim();
  const last = String(body?.last_name || "").trim();
  if (!first || !last) return jsonError("Nom et prénom requis");
  const { data, error } = await auth.supabase
    .from("crm_travel_companions")
    .update({
      first_name: first,
      last_name: last,
      birth_date: body.birth_date || null,
      sex: body.sex || null,
      nationality: body.nationality || null,
      relationship: body.relationship || null,
    })
    .eq("id", id)
    .eq("customer_id", auth.customer.id)
    .select("*")
    .maybeSingle();
  if (error) return jsonError(error.message, 400);
  if (!data) return jsonError("Compagnon introuvable", 404);
  return NextResponse.json({ companion: data });
}

export async function DELETE(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return jsonError("id requis");
  const { data, error } = await auth.supabase
    .from("crm_travel_companions")
    .delete()
    .eq("id", id)
    .eq("customer_id", auth.customer.id)
    .select("id")
    .maybeSingle();
  if (error) return jsonError(error.message, 400);
  if (!data) return jsonError("Compagnon introuvable", 404);
  return NextResponse.json({ ok: true });
}
