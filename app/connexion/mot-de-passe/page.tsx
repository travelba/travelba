import { SetPasswordForm } from "@/components/auth/SetPasswordForm";
import { getSessionUser, getStaffForUser } from "@/lib/crm/auth";

export default async function SetPasswordPage() {
  const { user } = await getSessionUser();
  const staff = user ? await getStaffForUser(user.id) : null;
  return <SetPasswordForm desk={staff ? "agence" : "client"} />;
}
