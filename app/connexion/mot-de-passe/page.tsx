import { redirect } from "next/navigation";
import { SetPasswordForm } from "@/components/auth/SetPasswordForm";
import { getSessionUser, getStaffForUser } from "@/lib/crm/auth";
import { mustSetPassword, needsClientOnboarding, ONBOARDING_PATH } from "@/lib/crm/session";

export default async function SetPasswordPage() {
  const { user } = await getSessionUser();
  const staff = user ? await getStaffForUser(user.id) : null;
  if (user && !mustSetPassword(user)) {
    if (staff) redirect("/admin");
    redirect(needsClientOnboarding(user) ? ONBOARDING_PATH : "/mon-compte");
  }
  return <SetPasswordForm desk={staff ? "agence" : "client"} />;
}
