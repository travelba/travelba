import { NextResponse } from "next/server";
import { dbError, jsonError } from "@/lib/crm/auth";
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_SETUP_COOKIE,
  destinationAfterPassword,
  pathAfterPassword,
  withOnboardingPending,
} from "@/lib/crm/session";
import { passwordErrorMessage } from "@/lib/crm/db-error";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { appOrigin } from "@/lib/crm/invite";
import { sendSpaceAccessWhatsapp } from "@/lib/crm/space-access";
import { recordCustomerActivity } from "@/lib/crm/customer-activity";

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
  /** Changement depuis Mon compte › Sécurité : ni bienvenue, ni WhatsApp d’accès, ni cookie de première fois. */
  const change = body?.change === true;
  const { data: staffEarly } = await supabase
    .from("crm_staff")
    .select("role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  const partner = staffEarly?.role === "partner" || user.app_metadata?.crm_role === "partner";
  const admin = createServiceClient({ allowPreview: true });
  if (password.length < MIN_PASSWORD_LENGTH) {
    return jsonError(
      partner
        ? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
        : `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères`
    );
  }
  if (password !== confirm) {
    return jsonError(partner ? "The two passwords do not match." : "Les mots de passe ne correspondent pas");
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error("[client/password]", error.code ?? "?", error.message);
    return jsonError(passwordErrorMessage(error, partner ? "en" : "fr"), 400);
  }
  const { data: customerRow } = await admin
    .from("crm_customers")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (customerRow?.id) {
    await recordCustomerActivity({
      customerId: customerRow.id,
      authUserId: user.id,
      action: "password",
      summary: change ? "A changé son mot de passe" : "A enregistré son mot de passe",
    });
  }
  if (change) return NextResponse.json({ ok: true });

  const { data: fresh } = await admin.auth.admin.getUserById(user.id);
  const [{ data: customer }, { data: staffRow }] = await Promise.all([
    admin
      .from("crm_customers")
      .select("id, phone, first_name")
      .eq("auth_user_id", user.id)
      .maybeSingle(),
    admin.from("crm_staff").select("id, role").eq("auth_user_id", user.id).maybeSingle(),
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
  if (metaError) {
    if (staff) {
      const { error: stampError } = await supabase.rpc("crm_finish_staff_password");
      if (stampError) {
        return jsonError(
          partner ? "The password could not be saved. Try again." : "Impossible d’enregistrer le mot de passe. Réessayez.",
          400
        );
      }
    } else {
      return dbError(metaError, 400);
    }
  }

  await supabase.auth.refreshSession();
  if (!staff && customer?.id && user.email) {
    try {
      // L’invitation vient souvent d’envoyer le même « Enchanté ». On saute alors.
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
  const home = pathAfterPassword(customer?.phone, partner ? "partner" : staff ? "staff" : "client");
  const next = staff ? home : destinationAfterPassword(appMeta, customer?.phone);
  const response = NextResponse.json({
    ok: true,
    needsPhone: !staff && home !== "/mon-compte",
    next,
  });
  response.cookies.set(PASSWORD_SETUP_COOKIE, "", {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    maxAge: 0,
  });
  return response;
}
