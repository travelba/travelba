import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { DESK_COOKIE, deskBypass } from "@/lib/crm/desk-mode";
import type { CrmTravelDocument } from "@/lib/crm/types";
import { PasswordChangeForm } from "@/components/account/PasswordChangeForm";
import { ProfileForm } from "@/components/account/ProfileForm";
import { PhoneWallBanner } from "@/components/crm/ui";
import { SignOutButton } from "@/components/account/SignOutButton";

export default async function ProfilPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");

  const { data: documents } = await supabase
    .from("crm_travel_documents")
    .select("*")
    .eq("customer_id", customer.id)
    .is("companion_id", null);

  const jar = await cookies();
  const desk = deskBypass(jar.get(DESK_COOKIE)?.value, user.id);

  return (
    <div className="space-y-4">
      {!customer.phone && !desk ? <PhoneWallBanner /> : null}

      <ProfileForm key={customer.updated_at} customer={customer} documents={(documents || []) as CrmTravelDocument[]} />

      <PasswordChangeForm />

      <SignOutButton />
    </div>
  );
}
