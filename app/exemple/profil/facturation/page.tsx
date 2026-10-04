import { BillingForm } from "@/components/account/BillingForm";
import { readExample } from "@/lib/crm/example-store";

export const dynamic = "force-dynamic";

export default function ExampleBillingPage() {
  const session = readExample();
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Société</p>
        <h2 className="font-display text-2xl font-bold tracking-tight text-[var(--admin-navy)]">Facturation</h2>
      </div>
      <BillingForm customer={session.customer} />
    </div>
  );
}
