import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { customerFullName, type CrmTravelDocument } from "@/lib/crm/types";
import { ProfileForm } from "@/components/account/ProfileForm";
import { ProfileSubnav } from "@/components/account/ProfileSubnav";
import { ConciergeBanner, PhoneWallBanner } from "@/components/crm/ui";
import { SignOutButton } from "@/components/account/SignOutButton";
import { siteConfig } from "@/lib/site";

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
  const initials =
    [customer.first_name?.[0], customer.last_name?.[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() || "TB";

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-[#e5e3dc] bg-white p-5">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--admin-navy)] text-base font-bold text-white ring-4 ring-white">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-xl font-extrabold text-[var(--admin-navy)]">
                {name}
              </h1>
            </div>
            <p className="mt-0.5 truncate text-sm text-muted">{customer.email}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
              N° client · {customer.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
        </div>
      </section>

      <ProfileSubnav />

      {!customer.phone ? <PhoneWallBanner /> : null}

      <section className="rounded-[1.35rem] bg-white p-1 shadow-[0_8px_24px_rgba(15,23,42,0.05)] sm:p-2">
        <div className="px-4 pt-4 sm:px-5">
          <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">
            Informations personnelles
          </h2>
          <p className="mt-1 text-sm text-muted">
            Coordonnées et préférences — espace {siteConfig.shortName}.
          </p>
        </div>
        <ProfileForm customer={customer} documents={(documents || []) as CrmTravelDocument[]} />
      </section>

      <div className="space-y-2">
        <SignOutButton />
        <p className="text-center text-[11px] text-muted">Travel Business Agency</p>
      </div>

      <ConciergeBanner />
    </div>
  );
}
