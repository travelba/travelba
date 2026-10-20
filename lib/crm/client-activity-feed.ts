import type { SupabaseClient } from "@supabase/supabase-js";
import { stayMention } from "./customer-activity";
import { loginMethodLabel } from "./customer-login";
import { addIsoDays } from "./dates";
import { stayToday } from "./stay-moment";
import { customerFullName } from "./types";

/** Aujourd’hui compris, jusqu’à sept jours en arrière (heure de Paris). */
export const CLIENT_ACTIVITY_LOOKBACK_DAYS = 7;

const LOGIN_LIMIT = 400;
const ACTIVITY_LIMIT = 800;

export type ClientActivityEvent = {
  id: string;
  time: string;
  text: string;
  detail: string | null;
};

export type ClientActivityDossier = {
  id: string;
  href: string;
  label: string;
};

export type ClientActivityRow = {
  id: string;
  name: string;
  href: string;
  meta: string;
  dossiers: ClientActivityDossier[];
  events: ClientActivityEvent[];
};

export type ClientActivityGroup = {
  day: string;
  label: string;
  rows: ClientActivityRow[];
};

export type ClientActivityLogin = {
  id: string;
  customer_id: string;
  auth_user_id: string | null;
  method: string;
  staff_id?: string | null;
  created_at: string;
};

export type ClientActivityEventRow = {
  id: string;
  customer_id: string;
  auth_user_id: string | null;
  action: string;
  summary: string;
  detail?: string | null;
  booking_id?: string | null;
  created_at: string;
};

export type ClientActivityCustomer = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  auth_user_id: string | null;
};

export type ClientActivityBooking = {
  id: string;
  reference: string;
  title: string | null;
  destination: string | null;
};

type DbError = { code?: string | null; message?: string | null } | null;

/** Jour civil à Paris, `yyyy-mm-dd`. */
export function parisCalendarDay(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) return "";
  return `${year}-${month}-${day}`;
}

/** Heure de Paris, `14h32`. */
export function parisClock(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/Paris",
  }).formatToParts(date);
  const hour = (parts.find((part) => part.type === "hour")?.value || "").replace(/\D/g, "");
  const minute = (parts.find((part) => part.type === "minute")?.value || "").replace(/\D/g, "");
  if (!hour || !minute) return "";
  return `${hour.padStart(2, "0")}h${minute.padStart(2, "0")}`;
}

export function clientActivityOldestDay(today: string) {
  return addIsoDays(today, -CLIENT_ACTIVITY_LOOKBACK_DAYS);
}

/** Borne UTC large : le jour de Paris commence la veille en UTC. */
export function clientActivitySinceIso(today: string) {
  return `${addIsoDays(clientActivityOldestDay(today), -1)}T00:00:00.000Z`;
}

export function clientActivityDayLabel(day: string, today: string) {
  if (day === today) return "Aujourd’hui";
  if (day === addIsoDays(today, -1)) return "Hier";
  const date = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  const label = date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Paris",
  });
  if (!label) return day;
  return label.charAt(0).toLocaleUpperCase("fr-FR") + label.slice(1);
}

function inWindow(day: string, today: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  return day >= clientActivityOldestDay(today) && day <= today;
}

function staffSet(ids: string[]) {
  return new Set(ids.map((id) => id.trim().toLowerCase()).filter(Boolean));
}

function isStaffAuth(id: string | null | undefined, staff: Set<string>) {
  if (!id) return false;
  return staff.has(id.trim().toLowerCase());
}

function rowMeta(time: string, sessions: number, actions: number) {
  const openSession = sessions === 0 && actions > 0;
  const headline = openSession
    ? time
      ? `Actif à ${time} (session déjà ouverte)`
      : "Session déjà ouverte"
    : time
      ? `Dernière connexion à ${time}`
      : "Connexion";
  const parts = [headline];
  if (sessions > 1) parts.push(`${sessions} connexions`);
  if (actions === 1) parts.push("1 geste");
  else if (actions > 1) parts.push(`${actions} gestes`);
  return parts.join(" · ");
}

function tidyDetail(value: string | null | undefined) {
  const text = (value || "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 400) : null;
}

/**
 * Connexions et visites de l’espace client sur sept jours, groupées par jour de Paris.
 * Une visite sans nouvelle connexion (session déjà ouverte) reste une ligne.
 * Une ouverture par l’agence et un compte staff ou partenaire n’apparaissent pas.
 */
export function buildClientActivityFeed(input: {
  today: string;
  logins: ClientActivityLogin[];
  activity: ClientActivityEventRow[];
  customers: ClientActivityCustomer[];
  bookings: ClientActivityBooking[];
  staffAuthIds: string[];
}): ClientActivityGroup[] {
  const staff = staffSet(input.staffAuthIds);
  const customers = new Map(input.customers.map((row) => [row.id, row]));
  const bookings = new Map(input.bookings.map((row) => [row.id, row]));
  const byDay = new Map<string, Map<string, { logins: ClientActivityLogin[]; activity: ClientActivityEventRow[] }>>();

  function bucket(day: string, customerId: string) {
    let dayMap = byDay.get(day);
    if (!dayMap) {
      dayMap = new Map();
      byDay.set(day, dayMap);
    }
    let row = dayMap.get(customerId);
    if (!row) {
      row = { logins: [], activity: [] };
      dayMap.set(customerId, row);
    }
    return row;
  }

  function keptCustomer(customerId: string) {
    const customer = customers.get(customerId);
    if (!customer) return null;
    if (isStaffAuth(customer.auth_user_id, staff)) return null;
    return customer;
  }

  for (const login of input.logins) {
    if (!login.customer_id || login.method === "desk" || login.staff_id) continue;
    if (isStaffAuth(login.auth_user_id, staff)) continue;
    if (!keptCustomer(login.customer_id)) continue;
    const day = parisCalendarDay(login.created_at);
    if (!inWindow(day, input.today)) continue;
    bucket(day, login.customer_id).logins.push(login);
  }

  for (const event of input.activity) {
    if (!event.customer_id || !event.summary?.trim()) continue;
    if (isStaffAuth(event.auth_user_id, staff)) continue;
    if (!keptCustomer(event.customer_id)) continue;
    const day = parisCalendarDay(event.created_at);
    if (!inWindow(day, input.today)) continue;
    bucket(day, event.customer_id).activity.push(event);
  }

  const groups: ClientActivityGroup[] = [];
  for (const [day, people] of byDay) {
    const built: { lastAt: string; row: ClientActivityRow }[] = [];
    for (const [customerId, bucketRow] of people) {
      if (!bucketRow.logins.length && !bucketRow.activity.length) continue;
      const customer = customers.get(customerId);
      if (!customer) continue;
      const logins = [...bucketRow.logins].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
      const activity = [...bucketRow.activity].sort(
        (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
      );
      const last = logins.at(-1) || activity.at(-1);
      if (!last) continue;
      const dossierIds = new Set<string>();
      for (const event of activity) {
        if (event.booking_id && bookings.has(event.booking_id)) dossierIds.add(event.booking_id);
      }
      const dossiers = [...dossierIds]
        .map((id) => {
          const booking = bookings.get(id);
          if (!booking) return null;
          return {
            id,
            href: `/admin/reservations/${id}`,
            label: stayMention(booking.reference, booking.title, booking.destination),
          };
        })
        .filter((row): row is ClientActivityDossier => Boolean(row))
        .sort((a, b) => a.label.localeCompare(b.label, "fr"));
      const events: ClientActivityEvent[] = [
        ...logins.map((login) => ({
          id: `login-${login.id}`,
          at: login.created_at,
          time: parisClock(login.created_at),
          text: `Connexion · ${loginMethodLabel(login.method)}`,
          detail: null as string | null,
        })),
        ...activity.map((event) => ({
          id: `act-${event.id}`,
          at: event.created_at,
          time: parisClock(event.created_at),
          text: event.summary.replace(/\s+/g, " ").trim(),
          detail: tidyDetail(event.detail),
        })),
      ]
        .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
        .map((event) => ({ id: event.id, time: event.time, text: event.text, detail: event.detail }));

      built.push({
        lastAt: last.created_at,
        row: {
          id: `${customerId}:${day}`,
          name: customerFullName({
            first_name: customer.first_name || "",
            last_name: customer.last_name || "",
          }),
          href: `/admin/clients/${customerId}`,
          meta: rowMeta(parisClock(last.created_at), logins.length, activity.length),
          dossiers,
          events,
        },
      });
    }
    const rows = built
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt) || a.row.name.localeCompare(b.row.name, "fr") || a.row.id.localeCompare(b.row.id))
      .map((entry) => entry.row);
    if (rows.length) groups.push({ day, label: clientActivityDayLabel(day, input.today), rows });
  }
  groups.sort((a, b) => b.day.localeCompare(a.day));
  return groups;
}

function missingRelation(error: DbError) {
  if (!error) return false;
  const message = error.message || "";
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(message);
}

function missingColumn(error: DbError, column: string) {
  if (!error) return false;
  const message = error.message || "";
  if (error.code === "42703" || error.code === "PGRST204") return message.length === 0 || message.includes(column);
  return message.includes(column);
}

async function readLogins(supabase: SupabaseClient, since: string): Promise<ClientActivityLogin[] | null> {
  const first = await supabase
    .from("crm_customer_logins")
    .select("id, customer_id, auth_user_id, method, staff_id, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(LOGIN_LIMIT);
  if (!first.error) return (first.data || []) as ClientActivityLogin[];
  if (missingRelation(first.error)) return null;
  if (missingColumn(first.error, "staff_id")) {
    const second = await supabase
      .from("crm_customer_logins")
      .select("id, customer_id, auth_user_id, method, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(LOGIN_LIMIT);
    if (second.error) {
      console.error("[client-activity] lecture impossible", second.error.code || "");
      return null;
    }
    return ((second.data || []) as ClientActivityLogin[]).map((row) => ({ ...row, staff_id: null }));
  }
  console.error("[client-activity] lecture impossible", first.error.code || "");
  return null;
}

async function readActivity(supabase: SupabaseClient, since: string): Promise<ClientActivityEventRow[]> {
  const first = await supabase
    .from("crm_customer_activity")
    .select("id, customer_id, auth_user_id, action, summary, detail, booking_id, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(ACTIVITY_LIMIT);
  if (!first.error) return (first.data || []) as ClientActivityEventRow[];
  if (missingRelation(first.error)) return [];
  if (missingColumn(first.error, "detail")) {
    const second = await supabase
      .from("crm_customer_activity")
      .select("id, customer_id, auth_user_id, action, summary, booking_id, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(ACTIVITY_LIMIT);
    if (second.error) {
      console.error("[client-activity] lecture impossible", second.error.code || "");
      return [];
    }
    return (second.data || []) as ClientActivityEventRow[];
  }
  console.error("[client-activity] lecture impossible", first.error.code || "");
  return [];
}

/** Lecture agence. Table absente ou illisible : liste vide, le tableau de bord reste ouvert. */
export async function loadClientActivityFeed(
  supabase: SupabaseClient,
  today = stayToday()
): Promise<ClientActivityGroup[]> {
  try {
    const since = clientActivitySinceIso(today);
    const [loginRows, activity] = await Promise.all([readLogins(supabase, since), readActivity(supabase, since)]);
    const logins = loginRows ?? [];
    if (!logins.length && !activity.length) return [];
    const customerIds = [
      ...new Set([...logins, ...activity].map((row) => row.customer_id).filter(Boolean)),
    ];
    if (!customerIds.length) return [];
    const [staffRes, customersRes] = await Promise.all([
      supabase.from("crm_staff").select("auth_user_id").limit(200),
      supabase.from("crm_customers").select("id, first_name, last_name, auth_user_id").in("id", customerIds),
    ]);
    if (staffRes.error || customersRes.error) {
      console.error("[client-activity] lecture impossible", staffRes.error?.code || customersRes.error?.code || "");
      return [];
    }
    const bookingIds = [...new Set(activity.map((row) => row.booking_id).filter((id): id is string => Boolean(id)))];
    let bookings: ClientActivityBooking[] = [];
    if (bookingIds.length) {
      const bookingRes = await supabase
        .from("crm_bookings")
        .select("id, reference, title, destination")
        .in("id", bookingIds);
      if (!bookingRes.error) bookings = (bookingRes.data || []) as ClientActivityBooking[];
    }
    const staffAuthIds = ((staffRes.data || []) as { auth_user_id: string | null }[])
      .map((row) => row.auth_user_id)
      .filter((id): id is string => Boolean(id));
    return buildClientActivityFeed({
      today,
      logins,
      activity,
      customers: (customersRes.data || []) as ClientActivityCustomer[],
      bookings,
      staffAuthIds,
    });
  } catch {
    console.error("[client-activity] lecture impossible");
    return [];
  }
}
