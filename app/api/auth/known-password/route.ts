import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sessionIdFromAccessToken } from "@/lib/crm/agency-access";
import { recordAgencyJournal } from "@/lib/crm/agency-log";
import { DESK_COOKIE, deskBypass } from "@/lib/crm/desk-mode";
import { jsonError } from "@/lib/crm/auth";
import { recordCustomerLogin } from "@/lib/crm/customer-login";
import { PASSWORD_SETUP_COOKIE, withoutMustSetPassword } from "@/lib/crm/session";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Après un signInWithPassword réussi.
 * Le mot de passe n’est pas modifié. Aucun e-mail ni WhatsApp.
 * On retire seulement le drapeau qui renvoyait vers « définir un mot de passe ».
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("Non authentifié", 401);

  const staff = await readActiveStaff(user.id);
  if (staff && staff.active === false) return jsonError("Cet accès est désactivé.", 403);
  if (staff) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const sessionId = sessionIdFromAccessToken(session?.access_token);
    if (sessionId) {
      try {
        const admin = createServiceClient({ allowPreview: true });
        await admin.from("crm_staff_sessions").upsert(
          {
            staff_id: staff.id,
            session_id: sessionId,
            last_seen_at: new Date().toISOString(),
            user_agent: null,
          },
          { onConflict: "staff_id,session_id" }
        );
      } catch {
        /* Table absente : la connexion continue. */
      }
    }
    await recordAgencyJournal({
      staffId: staff.id,
      action: "login",
      entityType: "session",
      summary: "Connexion à l’espace agence.",
      path: "/api/auth/known-password",
    });
  }

  const jar = await cookies();
  if (deskBypass(jar.get(DESK_COOKIE)?.value, user.id)) {
    // Mode desk : pas de drapeau à retirer, mais la connexion reste journalisée.
    await recordCustomerLogin(user.id, "desk");
    return NextResponse.json({ ok: true });
  }

  if (user.app_metadata?.must_set_password === true) {
    try {
      const admin = createServiceClient();
      const { data: fresh } = await admin.auth.admin.getUserById(user.id);
      const meta = withoutMustSetPassword(fresh.user?.app_metadata || user.app_metadata || {});
      const { error } = await admin.auth.admin.updateUserById(user.id, {
        app_metadata: meta,
      });
      if (error) {
        console.error("[auth/known-password] drapeau");
        return jsonError("Connexion impossible", 500);
      }
      await supabase.auth.refreshSession();
    } catch {
      console.error("[auth/known-password] indisponible");
      return jsonError("Connexion impossible", 500);
    }
  }

  await recordCustomerLogin(user.id, "password");

  const response = NextResponse.json({ ok: true });
  response.cookies.set(PASSWORD_SETUP_COOKIE, "", {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    maxAge: 0,
  });
  return response;
}

async function readActiveStaff(userId: string): Promise<{ id: string; active: boolean } | null> {
  try {
    const admin = createServiceClient({ allowPreview: true });
    const first = await admin.from("crm_staff").select("id, active").eq("auth_user_id", userId).maybeSingle();
    if (!first.error && first.data) {
      const row = first.data as { id: string; active?: boolean };
      return { id: row.id, active: row.active !== false };
    }
    const second = await admin.from("crm_staff").select("id").eq("auth_user_id", userId).maybeSingle();
    if (second.error || !second.data) return null;
    return { id: (second.data as { id: string }).id, active: true };
  } catch {
    return null;
  }
}
