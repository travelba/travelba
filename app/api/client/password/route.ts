import { NextResponse } from "next/server";
import { dbError, jsonError } from "@/lib/crm/auth";
import {
  MIN_PASSWORD_LENGTH,
  destinationAfterPassword,
  pathAfterPassword,
  withOnboardingPending,
} from "@/lib/crm/session";
import { passwordErrorMessage } from "@/lib/crm/db-error";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { appOrigin } from "@/lib/crm/invite";
import { sendSpaceAccessWhatsapp } from "@/lib/crm/space-access";

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
  if (error) {
    console.error("[client/password]", error.code ?? "?", error.message);
    return jsonError(passwordErrorMessage(error), 400);
  }

  const admin = createServiceClient();
  const { data: fresh } = await admin.auth.admin.getUserById(user.id);
  const [{ data: customer }, { data: staffRow }] = await Promise.all([
    admin
      .from("crm_customers")
      .select("id, phone, first_name")
      .eq("auth_user_id", user.id)
      .maybeSingle(),
    admin.from("crm_staff").select("id").eq("auth_user_id", user.id).maybeSingle(),
  ]);
  const staff = Boolean(staffRow);
  const meta = fresh.user?.app_metadata || user.app_metadata || {};
  const stamped = {
    ...meta,
    must_set_password: false,
    password_set_at: new Date().toISOString(),
  };
  const appMeta = staff ? { ...stamped, client_onboarding_pending: false } : withOnboardingPending(stamped);
  const { error: metaError } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: appMeta,
  });
  if (metaError) return dbError(metaError, 400);

  await supabase.auth.refreshSession();
  if (!staff && customer?.id && user.email) {
    try {
      await sendSpaceAccessWhatsapp({
        customerId: customer.id,
        email: user.email,
        phone: customer.phone,
        firstName: customer.first_name,
        origin: appOrigin(request),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "échec";
      console.error("[client/password] whatsapp:", message.replace(/https?:\/\/\S+/g, ""));
    }
  }
  const home = pathAfterPassword(customer?.phone, staff ? "staff" : "client");
  const next = staff ? home : destinationAfterPassword(appMeta, customer?.phone);
  return NextResponse.json({
    ok: true,
    needsPhone: !staff && home !== "/mon-compte",
    next,
  });
}
