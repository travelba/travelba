import Link from "next/link";
import { requireStaffPage } from "@/lib/crm/auth";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { formatDateTimeFr } from "@/lib/crm/money";
import { ConciergeProposalDesk } from "@/components/admin/ConciergeProposalDesk";

export const metadata = { title: "Propositions WhatsApp" };

type Row = {
  id: string;
  kind: string;
  phone: string | null;
  draft_body: string;
  amounts: { sell?: number | null; currency?: string; lines?: { title?: string; sell?: number | null; simulated?: boolean }[] };
  simulated: boolean;
  created_at: string;
};

export default async function ConciergeProposalsPage() {
  const { supabase } = await requireStaffPage();
  const loaded = await supabase
    .from("crm_concierge_proposals")
    .select("id, kind, phone, draft_body, amounts, simulated, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(40);
  const pendingMigration = Boolean(loaded.error);
  const rows = (pendingMigration ? [] : loaded.data || []) as Row[];

  return (
    <div className="space-y-6">
      <div>
        <PageEyebrow>Espace agence</PageEyebrow>
        <PageTitle
          title="À approuver"
          subtitle="Le client ne reçoit ce texte qu’après votre accord, et seulement quand l’envoi est armé. Rien n’est réservé ni encaissé ici."
        />
      </div>
      <Link href="/admin/boite?onglet=whatsapp" className="text-sm font-semibold underline-offset-2 hover:underline">
        Retour à la file
      </Link>
      {pendingMigration ? <p className="text-sm text-muted">Les propositions s’affichent après la migration du Concierge.</p> : null}
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="admin-af-card rounded-3xl px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">
              {row.kind}
              {row.simulated ? " · simulation" : ""}
              {row.amounts?.sell ? ` · ${row.amounts.sell} ${row.amounts.currency || "EUR"}` : ""}
            </p>
            <p className="mt-1 text-xs text-muted">{formatDateTimeFr(row.created_at)}</p>
            <ConciergeProposalDesk id={row.id} draft={row.draft_body} />
          </li>
        ))}
      </ul>
      {!pendingMigration && !rows.length ? <p className="text-sm text-muted">Aucune proposition en attente.</p> : null}
    </div>
  );
}
