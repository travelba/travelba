import { CompanionsManager } from "@/components/account/CompanionsManager";
import { ProfileSubnav } from "@/components/account/ProfileSubnav";
import { EXAMPLE_BASE } from "@/lib/crm/example-session";
import { readExample } from "@/lib/crm/example-store";

export const dynamic = "force-dynamic";

export default function ExampleCompanionsPage() {
  const session = readExample();
  return (
    <div className="space-y-4 pb-6">
      <ProfileSubnav basePath={EXAMPLE_BASE} />
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Foyer</p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--admin-navy)]">Voyageurs</h1>
      </div>
      <CompanionsManager companions={session.companions} documents={session.documents.filter((doc) => !doc.booking_id)} />
    </div>
  );
}
