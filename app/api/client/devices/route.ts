import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { isApnsDeviceToken } from "@/lib/crm/apns-token";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function schemaMissing(code: string | undefined) {
  return code === "42P01" || code === "PGRST205";
}

/** Enregistre le jeton APNs de l’appareil du titulaire connecté. */
export async function POST(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const body = (await request.json().catch(() => null)) as { token?: unknown; platform?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token.replace(/\s+/g, "") : "";
  if (body?.platform !== "ios" || !isApnsDeviceToken(token)) {
    return jsonError("Jeton d’appareil invalide.");
  }
  const admin = createServiceClient();
  const { error } = await admin.from("crm_espace_devices").upsert(
    {
      customer_id: auth.customer.id,
      auth_user_id: auth.user.id,
      platform: "ios",
      token,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "token" }
  );
  if (error) {
    if (schemaMissing(error.code)) return jsonError("Les notifications de l’application ne sont pas encore ouvertes.", 503);
    console.error("[devices]", error.code ?? "?");
    return jsonError("L’appareil n’a pas pu être enregistré.");
  }
  return NextResponse.json({ ok: true });
}

/** Retire cet appareil, ou tous les appareils du titulaire. */
export async function DELETE(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const body = (await request.json().catch(() => null)) as { token?: unknown; all?: unknown } | null;
  const admin = createServiceClient();
  if (body?.all === true) {
    const { error } = await admin.from("crm_espace_devices").delete().eq("customer_id", auth.customer.id);
    if (error && !schemaMissing(error.code)) {
      console.error("[devices]", error.code ?? "?");
      return jsonError("L’appareil n’a pas pu être retiré.");
    }
    return NextResponse.json({ ok: true });
  }
  const token = typeof body?.token === "string" ? body.token.replace(/\s+/g, "") : "";
  if (!isApnsDeviceToken(token)) return jsonError("Jeton d’appareil invalide.");
  const { error } = await admin
    .from("crm_espace_devices")
    .delete()
    .eq("customer_id", auth.customer.id)
    .eq("token", token);
  if (error && !schemaMissing(error.code)) {
    console.error("[devices]", error.code ?? "?");
    return jsonError("L’appareil n’a pas pu être retiré.");
  }
  return NextResponse.json({ ok: true });
}
