import { ProfileForm } from "@/components/account/ProfileForm";
import { ProfileSubnav } from "@/components/account/ProfileSubnav";
import { EXAMPLE_BASE, exampleSession } from "@/lib/crm/example-session";
import { customerFullName } from "@/lib/crm/types";

export default function ExampleProfilPage() {
  const session = exampleSession();
  const name = customerFullName(session.customer);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-[#e5e3dc] bg-white p-4 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Vous</p>
        <h1 className="mt-1 truncate font-display text-2xl font-bold tracking-tight text-[var(--admin-navy)]">
          {name}
        </h1>
        <p className="truncate text-sm text-muted">{session.customer.email}</p>
      </section>

      <ProfileSubnav basePath={EXAMPLE_BASE} />
      <ProfileForm customer={session.customer} documents={session.holderDocuments} />
    </div>
  );
}
