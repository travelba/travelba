import { NextResponse } from "next/server";
import { dbError, jsonError, requireStaff } from "@/lib/crm/auth";
import { resolveCountryCode } from "@/lib/crm/countries";
import { emptyToNull } from "@/lib/crm/identity";

function companionPatch(body: Record<string, unknown>) {
  const sex = emptyToNull(body.sex);
  return {
    first_name: String(body.first_name || "").trim(),
    last_name: String(body.last_name || "").trim(),
    birth_date: emptyToNull(body.birth_date),
    sex: sex === "M" || sex === "F" || sex === "X" ? sex : null,
    nationality: resolveCountryCode(String(body.nationality || "")) || emptyToNull(body.nationality),
    relationship: emptyToNull(body.relationship),
  };
}

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => null);
  const customerId = String(body?.customer_id || "");
  const patch = companionPatch(body || {});
  if (!customerId || !patch.first_name || !patch.last_name) return jsonError("Champs requis");
  const { data, error } = await auth.supabase
    .from("crm_travel_companions")
    .insert({
      customer_id: customerId,
      ...patch,
    })
    .select("*")
    .single();
  if (error) return dbError(error, 400);
  return NextResponse.json({ companion: data });
}

export async function PATCH(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => null);
  const id = String(body?.id || "");
  const customerId = String(body?.customer_id || "");
  const patch = companionPatch(body || {});
  if (!id || !customerId || !patch.first_name || !patch.last_name) return jsonError("Champs requis");
  const { data, error } = await auth.supabase
    .from("crm_travel_companions")
    .update(patch)
    .eq("id", id)
    .eq("customer_id", customerId)
    .select("*")
    .single();
  if (error) return dbError(error, 400);
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
  if (error) return dbError(error, 400);
  return NextResponse.json({ ok: true });
}
