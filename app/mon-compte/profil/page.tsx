import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { readVerifiedUser } from "@/lib/crm/verified-user";
import { DESK_COOKIE, deskBypass } from "@/lib/crm/desk-mode";
import type { CrmTravelDocument } from "@/lib/crm/types";
import { PasswordChangeForm } from "@/components/account/PasswordChangeForm";
import { ProfileForm } from "@/components/account/ProfileForm";
import { PhoneWallBanner } from "@/components/crm/ui";
import { SignOutButton } from "@/components/account/SignOutButton";
import { AccountPage } from "@/components/account/AccountPage";
import { PhoneVerifyForm } from "@/components/account/PhoneVerifyForm";
import { SignupCard } from "@/components/account/SignupCard";
import { isSelfServiceOrigin } from "@/lib/crm/self-signup";
import { createServiceClient } from "@/lib/supabase/admin";

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
  if (isSelfServiceOrigin(customer.account_origin)) {
    const { data: cards } = await createServiceClient()
      .from("crm_payment_methods")
      .select("last4")
      .eq("customer_id", customer.id)
      .order("is_default", { ascending: false })
      .limit(1);
    const last4 = (cards?.[0] as { last4?: string | null } | undefined)?.last4;
    return (
      <AccountPage motion="fade">
        <div className="space-y-4">
          {customer.phone_verified_at ? (
            <p className="text-sm text-[var(--admin-navy)]">Téléphone vérifié.</p>
          ) : (
            <PhoneVerifyForm initialPhone={customer.phone || ""} />
          )}
          <p className="text-sm text-[var(--admin-navy)]">{last4 ? `Carte •••• ${last4}` : "Aucune carte enregistrée."}</p>
          <SignupCard onSaved={() => {}} />
          <PasswordChangeForm />
          <SignOutButton />
        </div>
      </AccountPage>
    );
  }

  return (
    <AccountPage motion="fade">
    <div className="space-y-4">
      {!customer.phone && !desk ? <PhoneWallBanner /> : null}

      <ProfileForm key={customer.updated_at} customer={customer} documents={(documents || []) as CrmTravelDocument[]} />

      <PasswordChangeForm />

      <SignOutButton />
    </div>
    </AccountPage>
  );
}
