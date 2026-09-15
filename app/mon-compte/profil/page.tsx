import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { customerFullName } from "@/lib/crm/types";
import { ProfileForm } from "@/components/account/ProfileForm";
import { ProfileSubnav } from "@/components/account/ProfileSubnav";
import { ConciergeBanner } from "@/components/crm/ui";
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

  const name = customerFullName(customer);
  const initials =
    [customer.first_name?.[0], customer.last_name?.[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() || "TB";

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-[var(--aura-blue-soft)] via-white to-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--admin-navy)] text-base font-bold text-white ring-4 ring-white">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-xl font-extrabold text-[var(--admin-navy)]">
                {name}
              </h1>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                Vérifié
              </span>
            </div>
            <p className="mt-0.5 truncate text-sm text-muted">{customer.email}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
              N° client · {customer.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-2 rounded-xl bg-[var(--admin-navy)] px-3.5 py-3 text-white">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">
              Statut exclusif
            </p>
            <p className="font-display text-sm font-bold">Explorer VIP</p>
          </div>
          <span className="rounded-full bg-[var(--aura-blue)] px-2.5 py-1 text-[10px] font-bold">
            Concierge 24/7
          </span>
        </div>
      </section>

      <ProfileSubnav />

      <section className="rounded-[1.35rem] bg-white p-1 shadow-[0_8px_24px_rgba(15,23,42,0.05)] sm:p-2">
        <div className="px-4 pt-4 sm:px-5">
          <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">
            Informations personnelles
          </h2>
          <p className="mt-1 text-sm text-muted">
            Coordonnées, fiscalité et préférences — espace {siteConfig.shortName}.
          </p>
        </div>
        <ProfileForm customer={customer} />
      </section>

      <div className="space-y-2">
        <SignOutButton />
        <p className="text-center text-[11px] text-muted">TBA Aura · v1.0</p>
      </div>

      <ConciergeBanner />
    </div>
  );
}
