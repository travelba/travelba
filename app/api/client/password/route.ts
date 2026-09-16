import { NextResponse } from "next/server";
import { jsonError } from "@/lib/crm/auth";
import { MIN_PASSWORD_LENGTH } from "@/lib/crm/session";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("Non authentifié", 401);

  const body = await request.json().catch(() => null);
  const password = String(body?.password || "");
  const confirm = String(body?.confirm || "");
  if (password.length < MIN_PASSWORD_LENGTH) {
    return jsonError(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères`);
  }
  if (password !== confirm) return jsonError("Les mots de passe ne correspondent pas");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return jsonError(error.message, 400);

  const admin = createServiceClient();
  const { data: fresh } = await admin.auth.admin.getUserById(user.id);
  const meta = fresh.user?.app_metadata || user.app_metadata || {};
  const { error: metaError } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...meta,
      must_set_password: false,
      password_set_at: new Date().toISOString(),
    },
  });
  if (metaError) return jsonError(metaError.message, 400);

  await supabase.auth.refreshSession();
  return NextResponse.json({ ok: true });
}
