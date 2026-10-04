import { DocumentsManager } from "@/components/account/DocumentsManager";
import { readExample } from "@/lib/crm/example-store";

export const dynamic = "force-dynamic";

export default function ExampleDocumentsPage() {
  const session = readExample();
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Coffre</p>
        <h2 className="font-display text-2xl font-bold tracking-tight text-[var(--admin-navy)]">Pièces</h2>
      </div>
      <DocumentsManager
        documents={session.documents.filter((doc) => !doc.booking_id)}
        companions={session.companions}
        holder={{ first_name: session.customer.first_name, last_name: session.customer.last_name }}
      />
    </div>
  );
}
