import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { assertStaffPermission, staffAllows } from "@/lib/crm/agency-guard";
import {
  JOURNAL_ACTION_LABELS,
  JOURNAL_ACTIONS,
  JOURNAL_ENTITIES,
  JOURNAL_ENTITY_LABELS,
  journalCsv,
  journalRowsMatch,
  type JournalAction,
  type JournalEntity,
} from "@/lib/crm/agency-journal";
import { recordAgencyJournal } from "@/lib/crm/agency-log";
import { isUuid } from "@/lib/crm/ids";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type JournalDb = {
  seq: number;
  occurred_at: string;
  staff_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  diff: unknown;
  canonical: string;
  prev_hash: string | null;
  row_hash: string;
};

function isAction(value: string | null): value is JournalAction {
  return Boolean(value && (JOURNAL_ACTIONS as readonly string[]).includes(value));
}

function isEntity(value: string | null): value is JournalEntity {
  return Boolean(value && (JOURNAL_ENTITIES as readonly string[]).includes(value));
}

export async function GET(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const url = new URL(request.url);
  const format = url.searchParams.get("format");
  const entity = url.searchParams.get("entity");
  const id = url.searchParams.get("id");
  const scoped = Boolean(entity && id && format !== "csv");

  if (format === "csv") {
    const denied = await assertStaffPermission(auth.staff, "export_data");
    if (denied) return denied;
  } else if (!scoped) {
    const denied = await assertStaffPermission(auth.staff, "view_journal");
    if (denied) return denied;
  } else {
    const allowed = await scopedRead(auth, entity, id);
    if (allowed instanceof NextResponse) return allowed;
  }

  const admin = createServiceClient({ allowPreview: true });
  let query = admin
    .from("crm_agency_journal")
    .select("seq, occurred_at, staff_id, action, entity_type, entity_id, summary, diff, canonical, prev_hash, row_hash")
    .order("seq", { ascending: false })
    .limit(200);

  const agent = url.searchParams.get("agent");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const action = url.searchParams.get("action");
  if (agent && isUuid(agent)) query = query.eq("staff_id", agent);
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) query = query.gte("occurred_at", `${from}T00:00:00.000Z`);
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) query = query.lte("occurred_at", `${to}T23:59:59.999Z`);
  if (isEntity(entity)) query = query.eq("entity_type", entity);
  if (id) query = query.eq("entity_id", id);
  if (isAction(action)) query = query.eq("action", action);

  const { data, error } = await query;
  if (error) {
    if (format === "csv") return new NextResponse("Quand,Qui,Action,Entité,Identifiant,Résumé\n", { status: 200 });
    return NextResponse.json({ rows: [], alerts: [], chainIntact: null });
  }
  const rows = (data || []) as JournalDb[];
  const names = await actorNames(admin, rows.map((row) => row.staff_id));
  const shaped = rows.map((row) => ({
    seq: row.seq,
    occurred_at: row.occurred_at,
    actor: names.get(row.staff_id || "") || "Agence",
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    summary: row.summary,
    diff: scoped || format === "csv" ? undefined : row.diff,
  }));

  if (format === "csv") {
    const csv = journalCsv(
      shaped.map((row) => ({
        occurred_at: row.occurred_at,
        actor: row.actor,
        action: isAction(row.action) ? JOURNAL_ACTION_LABELS[row.action] : row.action,
        entity_type: isEntity(row.entity_type) ? JOURNAL_ENTITY_LABELS[row.entity_type] : row.entity_type,
        entity_id: row.entity_id || "",
        summary: row.summary,
      }))
    );
    await recordAgencyJournal({
      staffId: auth.staff.id,
      action: "export",
      entityType: "setting",
      summary: "Export du journal.",
      sensitive: "export",
      path: "/api/admin/journal",
    });
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": "attachment; filename=\"journal-agence.csv\"",
      },
    });
  }

  const chainIntact = rows.length ? await journalRowsMatch([...rows].reverse()) : null;
  let alerts: { id: string; created_at: string; summary: string; kind: string }[] = [];
  if (!scoped && (await staffAllows(auth.staff, "view_journal"))) {
    const { data: alertRows } = await admin
      .from("crm_agency_alerts")
      .select("id, created_at, summary, kind")
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(20);
    alerts = (alertRows || []) as typeof alerts;
  }
  return NextResponse.json({ rows: shaped, alerts, chainIntact });
}

async function scopedRead(
  auth: Exclude<Awaited<ReturnType<typeof requireStaff>>, NextResponse>,
  entity: string | null,
  id: string | null
) {
  if (!id || !isUuid(id)) return jsonError("Introuvable.", 404);
  if (entity === "user") {
    if (id === auth.staff.id) return null;
    const denied = await assertStaffPermission(auth.staff, "manage_users");
    return denied;
  }
  if (entity === "dossier") {
    const { data, error } = await auth.supabase.from("crm_bookings").select("id").eq("id", id).maybeSingle();
    if (error) return null;
    if (!data) return jsonError("Dossier introuvable.", 404);
    return null;
  }
  if (entity === "client") {
    const { data, error } = await auth.supabase.from("crm_customers").select("id").eq("id", id).maybeSingle();
    if (error) return null;
    if (!data) return jsonError("Client introuvable.", 404);
    return null;
  }
  return jsonError("Introuvable.", 404);
}

async function actorNames(
  admin: ReturnType<typeof createServiceClient>,
  ids: (string | null)[]
) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (!unique.length) return names;
  const { data } = await admin.from("crm_staff").select("id, full_name").in("id", unique);
  for (const row of (data || []) as { id: string; full_name: string | null }[]) {
    names.set(row.id, row.full_name || "Agence");
  }
  return names;
}
