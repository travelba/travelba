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
      <section className="relative overflow-hidden rounded-xl border border-[#e3e2e0]/70 bg-white p-4 shadow-[0_8px_24px_-4px_rgba(11,25,44,0.08)]">
        <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-[var(--admin-gold)]/15 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-[var(--admin-navy)]/5 blur-xl" />
        <div className="relative flex items-center gap-4">
          <span className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--admin-navy)] text-base font-bold text-white ring-2 ring-[var(--admin-gold)]/40">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-xl font-semibold text-[var(--admin-navy)]">
              {name}
            </h1>
            <p className="mt-0.5 truncate text-[13px] text-muted">{customer.email}</p>
            {customer.phone ? (
              <p className="text-[13px] text-muted">{customer.phone}</p>
            ) : null}
          </div>
        </div>
        <div className="relative mt-4 grid grid-cols-2 gap-2">
          <div className="flex flex-col rounded-lg border border-[#e3e2e0]/60 bg-[#f4f3f0] p-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
              Téléphone
            </span>
            <span className="mt-0.5 text-[16px] font-semibold text-[var(--admin-navy)]">
              {customer.phone || "À renseigner"}
            </span>
          </div>
          <div className="flex flex-col rounded-lg border border-[#e3e2e0]/60 bg-[#f4f3f0] p-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
              N° client
            </span>
            <span className="mt-0.5 text-[16px] font-semibold text-[#997b52]">
              {customer.id.slice(0, 8).toUpperCase()}
            </span>
          </div>
        </div>
      </section>

      <ProfileSubnav />

      {!customer.phone ? <PhoneWallBanner /> : null}

      <section className="rounded-xl border border-[#e3e2e0]/70 bg-white p-4 shadow-[0_8px_24px_-4px_rgba(11,25,44,0.05)]">
        <h2 className="font-display text-base font-semibold text-[var(--admin-navy)]">
          Informations personnelles
        </h2>
        <p className="mt-1 text-sm text-muted">
          Coordonnées et préférences — espace {siteConfig.shortName}.
        </p>
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
