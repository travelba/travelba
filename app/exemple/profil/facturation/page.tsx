import { BillingForm } from "@/components/account/BillingForm";
import { ProfileSubnav } from "@/components/account/ProfileSubnav";
import { EXAMPLE_BASE, exampleSession } from "@/lib/crm/example-session";

export default function ExampleBillingPage() {
  const session = exampleSession();
  return (
    <div className="space-y-4 pb-6">
      <ProfileSubnav basePath={EXAMPLE_BASE} />
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Société</p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--admin-navy)]">Facturation</h1>
      </div>
      <BillingForm customer={session.customer} />
    </div>
  );
}
