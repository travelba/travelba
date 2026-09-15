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

export async function DELETE(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return jsonError("id requis");
  const { error } = await auth.supabase
    .from("crm_travel_companions")
    .delete()
    .eq("id", id);
  if (error) return jsonError(error.message, 400);
  return NextResponse.json({ ok: true });
}
