/**
 * Flux d’activité de l’agence et résumé d’un agent. Service role : la page est réservée au droit
 * « Voir l’activité de l’agence ». Les lignes sortent telles que le journal les a scellées : quatre chiffres
 * de carte au plus, jamais un numéro complet.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { JournalFeedItem } from "@/components/admin/journal/JournalTimeline";
import {
  activityPeriodStart,
  agentSummary,
  filterJournalRows,
  isActivityPeriod,
  isJournalFamily,
  type ActivityPeriod,
  type JournalFamily,
} from "@/lib/crm/agency-journal-kinds";
import { isUuid } from "@/lib/crm/ids";

const BASE = "seq, occurred_at, staff_id, action, entity_type, entity_id, summary, diff";
const METIER = `${BASE}, kind, booking_id, amount_cents, currency, card_last4, actor_label`;

type Db = {
  seq: number;
  occurred_at: string;
  staff_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  diff: unknown;
  kind?: string | null;
  booking_id?: string | null;
  amount_cents?: number | null;
  currency?: string | null;
  card_last4?: string | null;
  actor_label?: string | null;
};

export type ActivityFilters = {
  period: ActivityPeriod;
  staffId: string | null;
  bookingId: string | null;
  family: JournalFamily | null;
  sensitiveOnly: boolean;
};

export function activityFiltersFromParams(params: Record<string, string | string[] | undefined>): ActivityFilters {
  const pick = (key: string) => {
    const value = params[key];
    return typeof value === "string" ? value : "";
  };
  const period = pick("periode");
  const staff = pick("agent");
  const booking = pick("dossier");
  const family = pick("type");
  return {
    period: isActivityPeriod(period) ? period : "jour",
    staffId: isUuid(staff) ? staff : null,
    bookingId: isUuid(booking) ? booking : null,
    family: isJournalFamily(family) ? family : null,
    sensitiveOnly: pick("sensible") === "1",
  };
}

/** Lien d’un jeu de filtres : les paramètres vides disparaissent. */
export function activityHref(filters: Partial<ActivityFilters>, base = "/admin/activite") {
  const params = new URLSearchParams();
  if (filters.period && filters.period !== "jour") params.set("periode", filters.period);
  if (filters.staffId) params.set("agent", filters.staffId);
  if (filters.bookingId) params.set("dossier", filters.bookingId);
  if (filters.family) params.set("type", filters.family);
  if (filters.sensitiveOnly) params.set("sensible", "1");
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

async function readRows(
  admin: SupabaseClient,
  input: { since: Date | null; staffId: string | null; bookingId: string | null; limit: number }
): Promise<Db[]> {
  const build = (columns: string) => {
    let query = admin.from("crm_agency_journal").select(columns).order("seq", { ascending: false }).limit(input.limit);
    if (input.since) query = query.gte("occurred_at", input.since.toISOString());
    if (input.staffId) query = query.eq("staff_id", input.staffId);
    if (input.bookingId && columns === METIER) {
      query = query.or(`and(entity_type.eq.dossier,entity_id.eq.${input.bookingId}),booking_id.eq.${input.bookingId}`);
    } else if (input.bookingId) {
      query = query.eq("entity_type", "dossier").eq("entity_id", input.bookingId);
    }
    return query;
  };
  let { data, error } = await build(METIER);
  if (error && /column|schema cache/i.test(error.message || "")) ({ data, error } = await build(BASE));
  if (error) return [];
  return (data || []) as unknown as Db[];
}

async function staffNames(admin: SupabaseClient) {
  const { data } = await admin.from("crm_staff").select("id, full_name, role, active").order("full_name");
  const rows = (data || []) as { id: string; full_name: string | null; role: string; active?: boolean | null }[];
  return rows;
}

async function bookingRefs(admin: SupabaseClient, ids: readonly string[]) {
  const unique = [...new Set(ids)];
  const refs = new Map<string, { id: string; reference: string; title: string | null }>();
  if (!unique.length) return refs;
  const { data } = await admin.from("crm_bookings").select("id, reference, title").in("id", unique);
  for (const row of (data || []) as { id: string; reference: string; title: string | null }[]) refs.set(row.id, row);
  return refs;
}

function shape(rows: Db[], names: Map<string, string>, refs: Map<string, { id: string; reference: string; title: string | null }>): JournalFeedItem[] {
  return rows.map((row) => {
    const bookingId = row.booking_id || (row.entity_type === "dossier" ? row.entity_id : null);
    return {
      seq: row.seq,
      occurred_at: row.occurred_at,
      staff_id: row.staff_id,
      actor: names.get(row.staff_id || "") || "Agence",
      actor_label: row.actor_label ?? null,
      action: row.action,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      summary: row.summary,
      kind: row.kind ?? null,
      booking_id: row.booking_id ?? null,
      amount_cents: row.amount_cents ?? null,
      currency: row.currency ?? null,
      card_last4: row.card_last4 ?? null,
      diff: row.diff,
      dossier: bookingId ? refs.get(bookingId) || { id: bookingId, reference: "Dossier" } : null,
    };
  });
}

export type ActivityFeed = {
  items: JournalFeedItem[];
  total: number;
  sensitive: number;
  agents: { id: string; name: string; count: number }[];
  dossiers: { id: string; reference: string; title: string | null; count: number }[];
};

/** Le flux de la période, filtré, avec les collègues et dossiers présents pour les filtres en un clic. */
export async function loadActivityFeed(admin: SupabaseClient, filters: ActivityFilters, now = new Date()): Promise<ActivityFeed> {
  const since = activityPeriodStart(filters.period, now);
  const rows = await readRows(admin, { since, staffId: filters.staffId, bookingId: filters.bookingId, limit: 500 });
  const staff = await staffNames(admin);
  const names = new Map(staff.map((row) => [row.id, row.full_name || "Collègue"]));
  const refs = await bookingRefs(
    admin,
    rows.map((row) => row.booking_id || (row.entity_type === "dossier" ? row.entity_id : null)).filter((id): id is string => Boolean(id))
  );
  const all = shape(rows, names, refs);
  const items = filterJournalRows(all, { family: filters.family, sensitiveOnly: filters.sensitiveOnly });

  const agentCounts = new Map<string, number>();
  const dossierCounts = new Map<string, number>();
  for (const item of all) {
    if (item.staff_id) agentCounts.set(item.staff_id, (agentCounts.get(item.staff_id) || 0) + 1);
    if (item.dossier?.id) dossierCounts.set(item.dossier.id, (dossierCounts.get(item.dossier.id) || 0) + 1);
  }
  const agents = staff
    .filter((row) => row.role !== "partner" && (agentCounts.has(row.id) || row.active !== false))
    .map((row) => ({ id: row.id, name: row.full_name || "Collègue", count: agentCounts.get(row.id) || 0 }));
  const dossiers = [...dossierCounts.entries()]
    .map(([id, count]) => ({ id, reference: refs.get(id)?.reference || "Dossier", title: refs.get(id)?.title ?? null, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
  return {
    items,
    total: all.length,
    sensitive: filterJournalRows(all, { sensitiveOnly: true }).length,
    agents,
    dossiers,
  };
}

export type AgentDigest = {
  ownedCount: number;
  actionsToday: number;
  sensitiveToday: number;
  lastAt: string | null;
  recent: JournalFeedItem[];
};

/** Résumé d’un collègue : dossiers en charge, actions du jour, cartes et paiements du jour, dernières actions. */
export async function loadAgentDigest(admin: SupabaseClient, staffId: string, now = new Date()): Promise<AgentDigest> {
  const [{ count }, rows, staff] = await Promise.all([
    admin
      .from("crm_bookings")
      .select("id", { count: "exact", head: true })
      .eq("owner_staff_id", staffId)
      .neq("status", "cancelled"),
    readRows(admin, { since: activityPeriodStart("mois", now), staffId, bookingId: null, limit: 300 }),
    staffNames(admin),
  ]);
  const names = new Map(staff.map((row) => [row.id, row.full_name || "Collègue"]));
  const refs = await bookingRefs(
    admin,
    rows.map((row) => row.booking_id || (row.entity_type === "dossier" ? row.entity_id : null)).filter((id): id is string => Boolean(id))
  );
  const items = shape(rows, names, refs);
  const summary = agentSummary(items, { staffId, now });
  return {
    ownedCount: count ?? 0,
    actionsToday: summary.actionsToday,
    sensitiveToday: summary.sensitiveToday,
    lastAt: summary.lastAt,
    recent: items.slice(0, 8),
  };
}
