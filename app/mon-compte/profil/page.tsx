import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { readVerifiedUser } from "@/lib/crm/verified-user";
import { DESK_COOKIE, deskBypass } from "@/lib/crm/desk-mode";
import type { CrmTravelDocument } from "@/lib/crm/types";
import { AccountDeletion } from "@/components/account/AccountDeletion";
import { ReferralShare } from "@/components/account/ReferralShare";
import { PasswordChangeForm } from "@/components/account/PasswordChangeForm";
import { PushPreferences } from "@/components/account/PushPreferences";
import { ProfileForm } from "@/components/account/ProfileForm";
import { PhoneWallBanner } from "@/components/crm/ui";
import { SignOutButton } from "@/components/account/SignOutButton";
import { AccountPage } from "@/components/account/AccountPage";
import { referralShareForCustomer } from "@/lib/crm/signup-run";
import { siteConfig } from "@/lib/site";

export default async function ProfilPage() {
  const supabase = await createClient();
  const user = await readVerifiedUser(supabase);
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
  const share = await referralShareForCustomer(customer.id, siteConfig.url);

  return (
    <AccountPage motion="fade">
    <div className="space-y-4">
      {!customer.phone && !desk ? <PhoneWallBanner /> : null}

      <ProfileForm key={customer.updated_at} customer={customer} documents={(documents || []) as CrmTravelDocument[]} />

      {share ? (
        <ReferralShare
          code={share.code}
          link={share.link}
          remaining={share.remaining}
          cap={share.cap}
          firstName={share.firstName}
        />
      ) : null}

      <PushPreferences />

      <PasswordChangeForm />

      <AccountDeletion />

      <SignOutButton />
    </div>
    </AccountPage>
  );
}
