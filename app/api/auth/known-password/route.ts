import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { DESK_COOKIE, deskBypass } from "@/lib/crm/admin-client-login";
import { jsonError } from "@/lib/crm/auth";
import { withoutMustSetPassword } from "@/lib/crm/session";
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

  const jar = await cookies();
  if (deskBypass(jar.get(DESK_COOKIE)?.value, user.id)) {
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

  return NextResponse.json({ ok: true });
}
