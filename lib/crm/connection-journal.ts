import type { SupabaseClient } from "@supabase/supabase-js";
import { CUSTOMER_NAME_SELECT, type CustomerNameRow } from "@/lib/crm/customer-search";
import { customerFullName } from "@/lib/crm/types";

/** Dernières connexions montrées sur le tableau de bord. */
export const CONNECTION_JOURNAL_LIMIT = 20;

export type JournalLogin = {
  id: string;
  customerId: string;
  method: string;
  at: string;
};

export type JournalAction = {
  id: string;
  customerId: string;
  at: string;
  summary: string;
  detail: string | null;
};

export type ConnectionSession = {
  login: JournalLogin;
  actions: JournalAction[];
};

export type ConnectionSessionView = {
  id: string;
  customerId: string;
  name: string;
  method: string;
  at: string;
  actions: { id: string; at: string; summary: string; detail: string | null }[];
};

/**
 * Chaque geste va à la connexion du même client qui le précède,
 * jusqu’à la connexion suivante. Un geste d’avant la première connexion connue reste dehors.
 */
export function sessionsFromLogins(logins: JournalLogin[], actions: JournalAction[]): ConnectionSession[] {
  const byCustomer = new Map<string, JournalLogin[]>();
  for (const login of logins) {
    const list = byCustomer.get(login.customerId) || [];
    list.push(login);
    byCustomer.set(login.customerId, list);
  }
  for (const list of byCustomer.values()) {
    list.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  }

  const buckets = new Map<string, JournalAction[]>(logins.map((login) => [login.id, []]));
  for (const action of actions) {
    const list = byCustomer.get(action.customerId);
    if (!list?.length) continue;
    let chosen: JournalLogin | null = null;
    for (const login of list) {
      if (login.at <= action.at) chosen = login;
      else break;
    }
    if (!chosen) continue;
    buckets.get(chosen.id)?.push(action);
  }
  for (const list of buckets.values()) {
    list.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  }

  return [...logins]
    .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))
    .map((login) => ({ login, actions: buckets.get(login.id) || [] }));
}

type LoginRow = {
  id: string;
  customer_id: string;
  method: string;
  created_at: string;
};

type ActivityRow = {
  id: string;
  customer_id: string;
  summary: string;
  detail: string | null;
  created_at: string;
};

/** Dernières connexions, avec les gestes de chaque session. Sans e-mail ni numéro. */
export async function loadConnectionJournal(
  supabase: SupabaseClient,
  limit = CONNECTION_JOURNAL_LIMIT
): Promise<ConnectionSessionView[]> {
  const { data: loginRows, error } = await supabase
    .from("crm_customer_logins")
    .select("id, customer_id, method, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !loginRows?.length) return [];

  const logins = (loginRows as LoginRow[]).map((row) => ({
    id: row.id,
    customerId: row.customer_id,
    method: row.method,
    at: row.created_at,
  }));
  const customerIds = [...new Set(logins.map((row) => row.customerId))];
  const earliest = logins.reduce((min, row) => (row.at < min ? row.at : min), logins[0].at);

  const [{ data: customers }, { data: activityRows }] = await Promise.all([
    supabase.from("crm_customers").select(CUSTOMER_NAME_SELECT).in("id", customerIds),
    supabase
      .from("crm_customer_activity")
      .select("id, customer_id, summary, detail, created_at")
      .in("customer_id", customerIds)
      .gte("created_at", earliest)
      .order("created_at", { ascending: true })
      .limit(500),
  ]);

  const names = new Map(
    ((customers || []) as CustomerNameRow[]).map((row) => [row.id, customerFullName(row)])
  );
  const actions = ((activityRows || []) as ActivityRow[]).map((row) => ({
    id: row.id,
    customerId: row.customer_id,
    at: row.created_at,
    summary: row.summary,
    detail: row.detail,
  }));

  return sessionsFromLogins(logins, actions).map((session) => ({
    id: session.login.id,
    customerId: session.login.customerId,
    name: names.get(session.login.customerId) || "Client",
    method: session.login.method,
    at: session.login.at,
    actions: session.actions.map((action) => ({
      id: action.id,
      at: action.at,
      summary: action.summary,
      detail: action.detail,
    })),
  }));
}
