import { CompanionsManager } from "@/components/account/CompanionsManager";
import { readExample } from "@/lib/crm/example-store";

export const dynamic = "force-dynamic";

export default function ExampleCompanionsPage() {
  const session = readExample();
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Foyer</p>
        <h2 className="font-display text-2xl font-bold tracking-tight text-[var(--admin-navy)]">Voyageurs</h2>
      </div>
      <CompanionsManager companions={session.companions} documents={session.documents.filter((doc) => !doc.booking_id)} />
    </div>
  );
}
