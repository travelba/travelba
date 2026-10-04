import { NextResponse } from "next/server";
import { dbError, jsonError, requireCustomer } from "@/lib/crm/auth";
import { espaceDeviceFromBody } from "@/lib/crm/espace-devices";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => null);
  const parsed = espaceDeviceFromBody(body);
  if ("error" in parsed) return jsonError(parsed.error);
  const { error } = await auth.supabase.from("crm_espace_devices").upsert(
    {
      customer_id: auth.customer.id,
      auth_user_id: auth.user.id,
      platform: parsed.platform,
      token: parsed.token,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "token" }
  );
  if (error) return dbError(error, 400);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  if (!token) return jsonError("Jeton requis");
  const { error } = await auth.supabase
    .from("crm_espace_devices")
    .delete()
    .eq("customer_id", auth.customer.id)
    .eq("token", token);
  if (error) return dbError(error, 400);
  return NextResponse.json({ ok: true });
}
