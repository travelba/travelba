import type { SupabaseClient } from "@supabase/supabase-js";
import { orSearchFilter, searchPattern } from "./admin-list";
import { addIsoDays } from "./dates";
import { recordCustomerActivity } from "./customer-activity";
import { parisCalendarDay } from "./client-activity-feed";
import {
  describeHotelGesture,
  HOTEL_ACTIVITY_ACTIONS,
  isHotelClientActivity,
  presentHotelActivityLines,
  type HotelActivityMode,
  type HotelGesture,
} from "./hotel-activity";
import { createServiceClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function recordHotelClientActivity(input: {
  customerId: string;
  authUserId: string;
  gesture: HotelGesture;
  mode: HotelActivityMode;
}) {
  const described = describeHotelGesture(input.gesture, input.mode);
  if (!described) return;
  await recordCustomerActivity({
    customerId: input.customerId,
    authUserId: input.authUserId,
    action: described.action,
    summary: described.summary,
    detail: described.detail,
    path: "/mon-compte/hotels",
  });
}

export async function lireRecherchesHotels(
  input: Record<string, unknown>,
  deps: { admin?: SupabaseClient } = {}
) {
  const clientId = text(input.client_id, 80);
  if (clientId && !UUID.test(clientId)) throw new Error("Identifiant invalide.");
  const name = text(input.nom, 80);
  const from = day(input.du);
  const to = day(input.au);
  if (input.du && !from) throw new Error("Date de début invalide.");
  if (input.au && !to) throw new Error("Date de fin invalide.");
  if (from && to && from > to) throw new Error("La date de fin précède le début.");
  const limitRaw = Number(input.limite);
  const limit = Number.isFinite(limitRaw) ? Math.min(80, Math.max(1, Math.floor(limitRaw))) : 40;
  const admin = deps.admin || createServiceClient();
  let customerIds: string[] | null = clientId ? [clientId] : null;
  if (!customerIds && name) {
    const pattern = searchPattern(name);
    if (!pattern) throw new Error("Nom trop court.");
    let query = admin.from("crm_customers").select("id").limit(8);
    query = query.or(orSearchFilter(pattern, ["first_name", "last_name", "usage_name"]));
    const { data, error } = await query;
    if (error) throw new Error("Lecture impossible.");
    customerIds = ((data || []) as { id: string }[]).map((row) => row.id);
    if (!customerIds.length) return { lignes: [] };
  }
  const span = Math.max(limit * 3, 60);
  const since = from ? `${addIsoDays(from, -1)}T00:00:00.000Z` : "";
  const until = to ? `${addIsoDays(to, 2)}T00:00:00.000Z` : "";
  let gestures = admin
    .from("crm_customer_activity")
    .select("id, customer_id, action, summary, detail, path, created_at")
    .in("action", [...HOTEL_ACTIVITY_ACTIONS]);
  let opens = admin
    .from("crm_customer_activity")
    .select("id, customer_id, action, summary, detail, path, created_at")
    .eq("action", "view")
    .eq("path", "/mon-compte/hotels");
  if (customerIds) {
    gestures = gestures.in("customer_id", customerIds);
    opens = opens.in("customer_id", customerIds);
  }
  if (since) {
    gestures = gestures.gte("created_at", since);
    opens = opens.gte("created_at", since);
  }
  if (until) {
    gestures = gestures.lt("created_at", until);
    opens = opens.lt("created_at", until);
  }
  const [gestureRes, openRes] = await Promise.all([
    gestures.order("created_at", { ascending: false }).limit(span),
    opens.order("created_at", { ascending: false }).limit(span),
  ]);
  if (gestureRes.error || openRes.error) throw new Error("Lecture impossible.");
  const rows = ([...(gestureRes.data || []), ...(openRes.data || [])] as {
    id: string;
    customer_id: string;
    action: string;
    summary: string;
    detail?: string | null;
    path?: string | null;
    created_at: string;
  }[]).filter((row) => {
    if (!isHotelClientActivity(row)) return false;
    const dayKey = parisCalendarDay(row.created_at);
    if (from && dayKey < from) return false;
    if (to && dayKey > to) return false;
    return true;
  }).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  const ids = [...new Set(rows.map((row) => row.customer_id))];
  let customers: { id: string; first_name: string | null; last_name: string | null }[] = [];
  if (ids.length) {
    const people = await admin.from("crm_customers").select("id, first_name, last_name").in("id", ids);
    if (people.error) throw new Error("Lecture impossible.");
    customers = (people.data || []) as typeof customers;
  }
  return { lignes: presentHotelActivityLines(rows, customers).slice(0, limit) };
}

function text(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function day(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  return value;
}
