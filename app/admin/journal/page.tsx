import { JournalDesk, type JournalAlert, type JournalRow } from "@/components/admin/JournalDesk";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { staffAllows, requirePermissionPage } from "@/lib/crm/agency-guard";
import {
  JOURNAL_ACTIONS,
  JOURNAL_ENTITIES,
  journalRowsMatch,
  type JournalAction,
  type JournalEntity,
} from "@/lib/crm/agency-journal";
import { isUuid } from "@/lib/crm/ids";
import { createServiceClient } from "@/lib/supabase/admin";

export const metadata = { title: "Journal" };

function pick(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return typeof value === "string" ? value : "";
}

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { staff } = await requirePermissionPage("view_journal");
  const params = await searchParams;
  const filters = {
    agent: pick(params, "agent"),
    from: pick(params, "from"),
    to: pick(params, "to"),
    entity: pick(params, "entity"),
    action: pick(params, "action"),
  };
  const admin = createServiceClient({ allowPreview: true });
  const { data: people } = await admin.from("crm_staff").select("id, full_name").order("full_name");
  const agents = ((people || []) as { id: string; full_name: string | null }[]).map((row) => ({
    id: row.id,
    name: row.full_name || "Agence",
  }));
  const names = new Map(agents.map((agent) => [agent.id, agent.name]));

  let query = admin
    .from("crm_agency_journal")
    .select("seq, occurred_at, staff_id, action, entity_type, entity_id, summary, canonical, prev_hash, row_hash")
    .order("seq", { ascending: false })
    .limit(200);
  if (filters.agent && isUuid(filters.agent)) query = query.eq("staff_id", filters.agent);
  if (/^\d{4}-\d{2}-\d{2}$/.test(filters.from)) query = query.gte("occurred_at", `${filters.from}T00:00:00.000Z`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(filters.to)) query = query.lte("occurred_at", `${filters.to}T23:59:59.999Z`);
  if ((JOURNAL_ENTITIES as readonly string[]).includes(filters.entity)) query = query.eq("entity_type", filters.entity);
  if ((JOURNAL_ACTIONS as readonly string[]).includes(filters.action)) query = query.eq("action", filters.action);

  const { data, error } = await query;
  const stored = error
    ? []
    : ((data || []) as {
        seq: number;
        occurred_at: string;
        staff_id: string | null;
        action: JournalAction;
        entity_type: JournalEntity;
        entity_id: string | null;
        summary: string;
        canonical: string;
        prev_hash: string | null;
        row_hash: string;
      }[]);
  const rows: JournalRow[] = stored.map((row) => ({
    seq: row.seq,
    occurred_at: row.occurred_at,
    actor: names.get(row.staff_id || "") || "Agence",
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    summary: row.summary,
  }));
  const chainIntact = stored.length ? await journalRowsMatch([...stored].reverse()) : null;
  let alerts: JournalAlert[] = [];
  if (!error) {
    const { data: alertRows } = await admin
      .from("crm_agency_alerts")
      .select("id, created_at, summary, kind")
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(20);
    alerts = (alertRows || []) as JournalAlert[];
  }

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle title="Journal" subtitle="Qui a fait quoi. Les numéros de pièce et de carte n’y figurent pas." />
      <JournalDesk
        rows={rows}
        alerts={alerts}
        agents={agents}
        filters={filters}
        canExport={await staffAllows(staff, "export_data")}
        chainIntact={chainIntact}
      />
    </div>
  );
}
