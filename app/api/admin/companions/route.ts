import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => null);
  const customerId = String(body?.customer_id || "");
  const first = String(body?.first_name || "").trim();
  const last = String(body?.last_name || "").trim();
  if (!customerId || !first || !last) return jsonError("Champs requis");
  const { data, error } = await auth.supabase
    .from("crm_travel_companions")
    .insert({
      customer_id: customerId,
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
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonError("Corps de requête invalide");
  }
  const id = String(body?.id || "");
  const customerId = String(body?.customer_id || "");
  if (!id || !customerId) return jsonError("id et customer_id requis");
  const patch: Record<string, unknown> = {};
  for (const key of [
    "first_name",
    "last_name",
    "birth_date",
    "sex",
    "nationality",
    "relationship",
  ]) {
    if (key in body) patch[key] = body[key] || null;
  }
  if ("first_name" in patch && !String(patch.first_name || "").trim()) {
    return jsonError("Prénom requis");
  }
  if ("last_name" in patch && !String(patch.last_name || "").trim()) {
    return jsonError("Nom requis");
  }
  if (!Object.keys(patch).length) return jsonError("Aucune modification");
  const { data, error } = await auth.supabase
    .from("crm_travel_companions")
    .update(patch)
    .eq("id", id)
    .eq("customer_id", customerId)
    .select("*")
    .single();
  if (error) return jsonError(error.message, 400);
  return NextResponse.json({ companion: data });
}

export async function DELETE(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const customerId = url.searchParams.get("customerId");
  if (!id) return jsonError("id requis");
  let query = auth.supabase
    .from("crm_travel_companions")
    .delete()
    .eq("id", id);
  if (customerId) query = query.eq("customer_id", customerId);
  const { error } = await query;
  if (error) return jsonError(error.message, 400);
  return NextResponse.json({ ok: true });
}
