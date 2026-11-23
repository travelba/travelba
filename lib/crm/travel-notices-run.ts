import "server-only";

import { readFlightWatch } from "@/lib/crm/flight-watch";
import { sendCustomerPush } from "@/lib/crm/push-notices";
import { planTravelNotices, type TravelBalance, type TravelFlight, type TravelPrefs, type TravelTransfer } from "@/lib/crm/travel-notices";
import { createServiceClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

type BookingRow = {
  id: string;
  reference: string;
  customer_id: string;
  billing_customer_id?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
  visible_to_client?: boolean | null;
  archived_at?: string | null;
};

type ItemRow = {
  id: string;
  booking_id: string;
  kind: string;
  title?: string | null;
  start_at?: string | null;
  details?: Record<string, unknown> | null;
};

function text(details: Record<string, unknown> | null | undefined, key: string) {
  const value = details?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function quiet(error: { message?: string } | null) {
  const message = error?.message || "lecture";
  console.error("[travel-notices]", message.replace(/https?:\/\/\S+/g, "").slice(0, 160));
}

function shiftDay(day: string, delta: number) {
  const match = day.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return day;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + delta));
  return date.toISOString().slice(0, 10);
}

async function rowsOf<T>(query: PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>) {
  const result = await query;
  if (result.error) {
    quiet(result.error);
    return [] as T[];
  }
  return result.data || [];
}

/** Cron horaire. Rien n’est envoyé deux fois : la clé est dans crm_notifications. */
export async function runTravelNotices(admin: SupabaseClient = createServiceClient(), now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(now);
  const from = shiftDay(today, -2);
  const { data: bookingData, error } = await admin
    .from("crm_bookings")
    .select("id, reference, customer_id, billing_customer_id, start_date, end_date, status, visible_to_client, archived_at")
    .eq("visible_to_client", true)
    .neq("status", "cancelled")
    .is("archived_at", null)
    .or(`end_date.gte.${from},start_date.gte.${from}`)
    .limit(300);
  if (error) {
    quiet(error);
    return { ok: false as const, reason: "bookings", sent: 0 };
  }
  const bookings = ((bookingData || []) as BookingRow[]).filter((row) => row.visible_to_client && !row.archived_at);
  if (!bookings.length) return { ok: true as const, sent: 0, planned: 0 };

  const bookingIds = bookings.map((row) => row.id);
  const items = await rowsOf<ItemRow>(
    admin
      .from("crm_booking_items")
      .select("id, booking_id, kind, title, start_at, details")
      .in("booking_id", bookingIds)
      .in("kind", ["flight", "transfer", "chauffeur"])
      .limit(800)
  );
  const byBooking = new Map(bookings.map((row) => [row.id, row]));
  const flights: TravelFlight[] = [];
  const transfers: TravelTransfer[] = [];
  for (const item of items) {
    const booking = byBooking.get(item.booking_id);
    if (!booking) continue;
    if (item.kind === "transfer" || item.kind === "chauffeur") {
      transfers.push({ bookingId: item.booking_id, title: item.title || "", startAt: item.start_at || null });
      continue;
    }
    if (item.kind !== "flight") continue;
    const watch = readFlightWatch(item.details);
    const details = item.details || {};
    const rawWatch = details.flight_watch;
    const notifiedGate =
      rawWatch && typeof rawWatch === "object" && typeof (rawWatch as { notified_gate?: unknown }).notified_gate === "string"
        ? (rawWatch as { notified_gate: string }).notified_gate
        : "";
    flights.push({
      id: item.id,
      bookingId: booking.id,
      customerId: booking.customer_id,
      reference: booking.reference,
      startAt: item.start_at || null,
      origin: text(details, "from") || text(details, "origin"),
      zone: text(details, "departure_timezone") || null,
      details,
      status: watch.status,
      gate: watch.gate,
      notifiedGate,
      notifiedOut: watch.notified_out,
      estimatedOut: watch.estimated_out,
      checkinNotifiedAt: watch.checkin_notified_at,
    });
  }

  const payerCue = new Map<string, TravelBalance>();
  const horizon = shiftDay(today, 14);
  for (const booking of bookings) {
    const departsOn = (booking.start_date || "").slice(0, 10);
    if (!departsOn || departsOn < today || departsOn > horizon) continue;
    const payer = booking.billing_customer_id || booking.customer_id;
    const current = payerCue.get(payer);
    if (current && current.departsOn <= departsOn) continue;
    payerCue.set(payer, {
      customerId: payer,
      bookingId: booking.id,
      reference: booking.reference,
      departsOn,
      owed: 0,
      currency: "EUR",
    });
  }
  const balances: TravelBalance[] = [];
  const payerIds = [...payerCue.keys()];
  if (payerIds.length) {
    const amounts = await rowsOf<{ customer_id: string; currency: string; balance: number }>(
      admin.from("crm_customer_balances").select("customer_id, currency, balance").in("customer_id", payerIds)
    );
    for (const amount of amounts) {
      const owed = -Number(amount.balance);
      if (!(owed >= 0.5)) continue;
      const cue = payerCue.get(amount.customer_id);
      if (!cue) continue;
      const currency = (amount.currency || "EUR").toUpperCase();
      if (cue.owed >= 0.5 && cue.currency === "EUR" && currency !== "EUR") continue;
      balances.push({ ...cue, owed, currency });
    }
  }

  const customerIds = [...new Set(flights.map((row) => row.customerId).concat(balances.map((row) => row.customerId)))];
  const prefs = new Map<string, TravelPrefs>();
  if (customerIds.length) {
    const extended = await admin
      .from("crm_notification_preferences")
      .select("customer_id, push_travel, push_checkin, push_flight_change, push_departure, push_balance")
      .in("customer_id", customerIds);
    const missing =
      extended.error?.code === "42703" || extended.error?.code === "PGRST204" || extended.error?.code === "PGRST205";
    const source = missing
      ? await rowsOf<{ customer_id: string } & TravelPrefs>(
          admin.from("crm_notification_preferences").select("customer_id, push_travel").in("customer_id", customerIds)
        )
      : extended.error
        ? []
        : ((extended.data || []) as ({ customer_id: string } & TravelPrefs)[]);
    if (extended.error && !missing) quiet(extended.error);
    for (const row of source) prefs.set(row.customer_id, row);
  }

  const audience = new Set<string>([
    ...flights.map((row) => row.customerId),
    ...balances.map((row) => row.customerId),
  ]);
  let planned = 0;
  let sent = 0;
  const gateWrites = new Map<string, string>();
  for (const customerId of audience) {
    const plan = planTravelNotices({
      now,
      prefs: prefs.get(customerId) || null,
      flights: flights.filter((row) => row.customerId === customerId),
      transfers,
      balances: balances.filter((row) => row.customerId === customerId),
    });
    planned += plan.notices.length;
    for (const gate of plan.gates) {
      if (gate.silent) gateWrites.set(gate.itemId, gate.gate);
    }
    for (const notice of plan.notices) {
      const result = await sendCustomerPush({
        customerId: notice.customerId,
        kind: notice.kind,
        title: notice.title,
        body: notice.body,
        url: notice.url,
        idempotencyKey: notice.idempotencyKey,
        bookingId: notice.bookingId,
        preferenceChecked: true,
        inApp: true,
      });
      const kept =
        Boolean(result.sent) ||
        result.skipped === "unconfigured" ||
        result.skipped === "no-device" ||
        result.skipped === "rejected" ||
        result.skipped === "already";
      if (kept) {
        sent += 1;
        const gate = plan.gates.find(
          (row) => !row.silent && notice.idempotencyKey === `travel:gate:${row.itemId}:${row.gate}`.slice(0, 180)
        );
        if (gate) gateWrites.set(gate.itemId, gate.gate);
      }
    }
  }

  for (const [itemId, gate] of gateWrites) {
    const { data, error: readError } = await admin.from("crm_booking_items").select("details").eq("id", itemId).maybeSingle();
    if (readError || !data) continue;
    const details = (data.details && typeof data.details === "object" ? data.details : {}) as Record<string, unknown>;
    const watch =
      details.flight_watch && typeof details.flight_watch === "object"
        ? (details.flight_watch as Record<string, unknown>)
        : {};
    if (watch.notified_gate === gate) continue;
    const { error: writeError } = await admin
      .from("crm_booking_items")
      .update({ details: { ...details, flight_watch: { ...watch, notified_gate: gate } } })
      .eq("id", itemId);
    if (writeError) quiet(writeError);
  }

  return { ok: true as const, sent, planned };
}
