import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { customerFullName, type CrmTravelDocument } from "@/lib/crm/types";
import { ProfileForm } from "@/components/account/ProfileForm";
import { ProfileSubnav } from "@/components/account/ProfileSubnav";
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

  const name = customerFullName(customer);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="truncate font-display text-xl font-semibold text-[var(--admin-navy)]">{name}</h1>
        <p className="truncate text-sm text-muted">{customer.email}</p>
      </div>

      <ProfileSubnav />

      {!customer.phone ? <PhoneWallBanner /> : null}

      <ProfileForm customer={customer} documents={(documents || []) as CrmTravelDocument[]} />

      <SignOutButton />
    </div>
  );
}
