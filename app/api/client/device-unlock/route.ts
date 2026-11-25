import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { createUnlockToken, nextUnlockExpiry } from "@/lib/crm/device-unlock";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function schemaMissing(code: string | undefined) {
  return code === "42P01" || code === "PGRST205";
}

/** Pose un jeton de déverrouillage. Le clair n’est renvoyé qu’une fois, pour le trousseau. */
export async function POST() {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const admin = createServiceClient();
  const now = new Date();
  const { token, hash } = createUnlockToken();
  const { error } = await admin.from("crm_device_unlocks").insert({
    customer_id: auth.customer.id,
    token_hash: hash,
    expires_at: nextUnlockExpiry(now),
  });
  if (error) {
    if (schemaMissing(error.code)) return jsonError("Le déverrouillage n’est pas encore ouvert.", 503);
    console.error("[unlock]", error.code ?? "?");
    return jsonError("Le déverrouillage n’a pas pu être activé.");
  }
  return NextResponse.json({ token });
}

/** Révoque les jetons de cet espace. L’appareil efface aussi le trousseau. */
export async function DELETE() {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const admin = createServiceClient();
  const { error } = await admin
    .from("crm_device_unlocks")
    .update({ revoked_at: new Date().toISOString() })
    .eq("customer_id", auth.customer.id)
    .is("revoked_at", null);
  if (error && !schemaMissing(error.code)) {
    console.error("[unlock]", error.code ?? "?");
    return jsonError("Le déverrouillage n’a pas pu être retiré.");
  }
  return NextResponse.json({ ok: true });
}
