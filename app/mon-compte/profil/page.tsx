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
      <section className="rounded-2xl border border-[#e5e3dc] bg-white p-4 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Vous</p>
        <h1 className="mt-1 truncate font-display text-2xl font-bold tracking-tight text-[var(--admin-navy)]">
          {name}
        </h1>
        <p className="truncate text-sm text-muted">{customer.email}</p>
      </section>

      <ProfileSubnav />

      {!customer.phone ? <PhoneWallBanner /> : null}

      <ProfileForm customer={customer} documents={(documents || []) as CrmTravelDocument[]} />

      <SignOutButton />
    </div>
  );
}
