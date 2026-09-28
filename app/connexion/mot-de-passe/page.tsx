import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SetPasswordForm } from "@/components/auth/SetPasswordForm";
import { getSessionUser, getStaffForUser } from "@/lib/crm/auth";
import {
  ONBOARDING_PATH,
  PASSWORD_SETUP_COOKIE,
  hasChosenPassword,
  mayShowPasswordSetup,
  mustSetPassword,
  needsClientOnboarding,
  withoutMustSetPassword,
} from "@/lib/crm/session";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export default async function SetPasswordPage() {
  const { user } = await getSessionUser();
  if (!user) redirect("/connexion");
  const staff = await getStaffForUser(user.id);
  if (hasChosenPassword(user) && mustSetPassword(user)) {
    await clearStalePasswordFlag(user.id);
  }
  const jar = await cookies();
  const allowed = mayShowPasswordSetup({
    mustSetPassword: mustSetPassword(user),
    hasPassword: hasChosenPassword(user),
    staff: Boolean(staff),
    setupCookie: jar.get(PASSWORD_SETUP_COOKIE)?.value === "1",
  });
  if (!allowed) {
    if (staff) redirect("/admin");
    if (!mustSetPassword(user) || hasChosenPassword(user)) {
      redirect(needsClientOnboarding(user) ? ONBOARDING_PATH : "/mon-compte");
    }
    redirect("/connexion");
  }
  return <SetPasswordForm desk={staff ? "agence" : "client"} />;
}

async function clearStalePasswordFlag(userId: string) {
  try {
    const admin = createServiceClient();
    const { data } = await admin.auth.admin.getUserById(userId);
    const current = data.user?.app_metadata || {};
    if (current.must_set_password !== true) return;
    await admin.auth.admin.updateUserById(userId, {
      app_metadata: withoutMustSetPassword(current),
    });
    const supabase = await createClient();
    await supabase.auth.refreshSession();
  } catch {
    console.error("[mot-de-passe] drapeau");
  }
}
