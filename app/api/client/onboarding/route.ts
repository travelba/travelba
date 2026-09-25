import { NextResponse } from "next/server";
import { dbError, jsonError } from "@/lib/crm/auth";
import { mustSetPassword, pathAfterPassword, withOnboardingDone } from "@/lib/crm/session";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Marque la bienvenue comme vue (Passer ou fin). Une seule fois, dans app_metadata. */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("Non authentifié", 401);
  if (mustSetPassword(user)) return jsonError("Définissez d’abord votre mot de passe", 403);

  const admin = createServiceClient();
  const { data: fresh } = await admin.auth.admin.getUserById(user.id);
  const meta = fresh.user?.app_metadata || user.app_metadata || {};
  const { error: metaError } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: withOnboardingDone(meta),
  });
  if (metaError) return dbError(metaError, 400);

  await supabase.auth.refreshSession();
  const { data: customer } = await admin
    .from("crm_customers")
    .select("phone")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  return NextResponse.json({ ok: true, next: pathAfterPassword(customer?.phone) });
}
