import Link from "next/link";
import { requireStaffPage } from "@/lib/crm/auth";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { ConciergeKnowledgeDesk } from "@/components/admin/ConciergeKnowledgeDesk";
import { dockDiscussionsHref } from "@/lib/crm/whatsapp-inbox";

export const metadata = { title: "Concierge" };

type Row = { id: string; kind: string; title: string; body: string };

export default async function ConciergeKnowledgePage() {
  const { supabase } = await requireStaffPage();
  const loaded = await supabase
    .from("crm_concierge_knowledge")
    .select("id, kind, title, body")
    .eq("published", true)
    .order("kind")
    .limit(80);
  const pendingMigration = Boolean(loaded.error);
  const rows = (pendingMigration ? [] : loaded.data || []) as Row[];

  return (
    <div className="space-y-6">
      <div>
        <PageEyebrow>Espace agence</PageEyebrow>
        <PageTitle
          title="Savoir du Concierge"
          subtitle="Services, ton, conditions, questions, partenaires, formalités. Les exemples importés règlent la voix, pas les faits."
        />
      </div>
      <p className="text-sm">
        <Link href={dockDiscussionsHref("tous")} className="font-semibold underline-offset-2 hover:underline">
          Ouvrir les discussions
        </Link>
      </p>
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="admin-af-card rounded-3xl px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">
              {row.kind} · {row.title}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--admin-navy)]">{row.body}</p>
          </li>
        ))}
      </ul>
      <ConciergeKnowledgeDesk pendingMigration={pendingMigration} />
    </div>
  );
}
