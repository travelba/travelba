import { NextResponse } from "next/server";
import { dbError, jsonError, requireCustomer } from "@/lib/crm/auth";
import { resolveNationality } from "@/lib/crm/countries";
import { emptyToNull } from "@/lib/crm/identity";
import { storedCompanionPhone } from "@/lib/crm/trip-share";
import { deleteTravelDocuments } from "@/lib/crm/travel-document-write";

function phonePatch(body: Record<string, unknown> | null) {
  if (!body || !Object.prototype.hasOwnProperty.call(body, "phone")) return {};
  const stored = storedCompanionPhone(body.phone);
  if (!stored.ok) return null;
  return { phone: stored.phone };
}

export async function GET() {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await auth.supabase
    .from("crm_travel_companions")
    .select("*")
    .eq("customer_id", auth.customer.id)
    .order("last_name");
  if (error) return dbError(error, 500);
  return NextResponse.json({ companions: data });
}

export async function POST(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => null);
  const first = String(body?.first_name || "").trim();
  const last = String(body?.last_name || "").trim();
  if (!first || !last) return jsonError("Nom et prénom requis");
  const phone = phonePatch(body || {});
  if (!phone) return jsonError("Téléphone invalide");
  const { data, error } = await auth.supabase
    .from("crm_travel_companions")
    .insert({
      customer_id: auth.customer.id,
      first_name: first,
      last_name: last,
      usage_name: emptyToNull(body?.usage_name),
      birth_date: emptyToNull(body?.birth_date),
      sex: emptyToNull(body?.sex),
      nationality: resolveNationality(String(body?.nationality || "")),
      relationship: emptyToNull(body?.relationship),
      ...phone,
    })
    .select("*")
    .single();
  if (error) return dbError(error, 400);
  return NextResponse.json({ companion: data });
}

export async function PATCH(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonError("id requis");
  const id = String(body.id || "");
  if (!id) return jsonError("id requis");
  const phone = phonePatch(body);
  if (!phone) return jsonError("Téléphone invalide");
  const { data, error } = await auth.supabase
    .from("crm_travel_companions")
    .update({
      first_name: body.first_name,
      last_name: body.last_name,
      usage_name: emptyToNull(body.usage_name),
      birth_date: emptyToNull(body.birth_date),
      sex: emptyToNull(body.sex),
      nationality: resolveNationality(String(body.nationality || "")),
      relationship: emptyToNull(body.relationship),
      ...phone,
    })
    .eq("id", id)
    .eq("customer_id", auth.customer.id)
    .select("*")
    .single();
  if (error) return dbError(error, 400);
  return NextResponse.json({ companion: data });
}

export async function DELETE(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return jsonError("id requis");
  const docs = await deleteTravelDocuments(auth.supabase, {
    companion_id: id,
    customer_id: auth.customer.id,
  });
  if (docs.error) return dbError(docs.error, 400);
  const { error } = await auth.supabase
    .from("crm_travel_companions")
    .delete()
    .eq("id", id)
    .eq("customer_id", auth.customer.id);
  if (error) return dbError(error, 400);
  return NextResponse.json({ ok: true });
}
