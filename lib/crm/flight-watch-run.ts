import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createEntryLink, entryButtonSuffix, entryCodeFromLink } from "./entry-link";
import { countryForIata } from "./airports";
import { countryName } from "./countries";
import { ensureFlightNoticeSids, sendApprovedFlightSamples } from "./flight-notice-arm";
import { aeroApiKey, fetchAeroFlights, flightNoticeSid } from "./flight-watch-api";
import { checkinReminderBlocked, type ReminderDocument, type ReminderMessage } from "./checkin-reminder";
import {
  applyAeroFlight,
  capDueGroups,
  checkinAttemptDue,
  flightClockLabel,
  explainAeroMatch,
  flightDesignators,
  flightIdent,
  flightNoticeVariables,
  flightNumberLabel,
  flightRouteLabel,
  markCheckinAttempt,
  markFlightNotified,
  matchAeroFlight,
  pendingFlightNotices,
  pollDue,
  reserveAeroBudget,
  welcomePlace,
  type FlightCard,
  type FlightNoticeKind,
} from "./flight-watch";
import { siteConfig } from "../site";
import { sendContentTemplate } from "./whatsapp";
import { proactiveWhatsappAllowed } from "./whatsapp-concierge";
import { stayDatesOpen, stayToday } from "./stay-moment";

type Admin = SupabaseClient;

type BookingRow = {
  id: string;
  status: string;
  reference: string;
  visible_to_client: boolean;
  customer_id: string;
  archived_at?: string | null;
  end_date?: string | null;
};

type CustomerRow = {
  id: string;
  email: string | null;
  phone: string | null;
  whatsapp_opt_in_at: string | null;
  whatsapp_opt_out_at: string | null;
};

type ItemRow = FlightCard & {
  id: string;
  booking_id: string;
  kind: string;
  source_document_id?: string | null;
};

const MISSING_TABLE = new Set(["42P01", "PGRST205", "PGRST204"]);

const WATCH = new Set(["draft", "quoted", "confirmed"]);
const REFERENCE = /^[A-Za-z0-9-]{4,40}$/;

function quiet(error: unknown) {
  const message = error instanceof Error ? error.message : "échec";
  console.error("[flight-watch]", message.replace(/https?:\/\/\S+/g, "").slice(0, 180));
}

function watchLog(status: number, received: number, note: string) {
  console.info(
    "[flight-watch]",
    JSON.stringify({ status, received, note: note.replace(/[\r\n]+/g, " ").trim().slice(0, 80) })
  );
}

function httpNote(status: number) {
  return status ? `http ${status}` : "reseau";
}

function groupSpan(group: FlightCard[], now: Date) {
  const times = group.map((item) => Date.parse(item.start_at || "")).filter((value) => Number.isFinite(value));
  return {
    from: new Date(times.length ? Math.min(...times) : now.getTime()),
    to: new Date(times.length ? Math.max(...times) : now.getTime()),
  };
}

async function reservationSuffix(admin: Admin, email: string, reference: string) {
  if (!REFERENCE.test(reference)) return null;
  const cleanEmail = email.trim().toLowerCase();
  const generated = await admin.auth.admin.generateLink({ type: "magiclink", email: cleanEmail });
  const tokenHash = generated.data?.properties?.hashed_token;
  if (generated.error || !tokenHash) return null;
  const link = await createEntryLink(admin, siteConfig.url, {
    tokenHash,
    otpType: "magiclink",
    nextPath: `/mon-compte/reservations/${reference}`,
    email: cleanEmail,
    channel: "whatsapp",
  });
  const code = entryCodeFromLink(link);
  if (!code) return null;
  return entryButtonSuffix(code);
}

async function takeBudget(admin: Admin, now: Date) {
  const { data } = await admin
    .from("crm_integrations")
    .select("id, extra")
    .eq("provider", "aeroapi")
    .maybeSingle();
  const extra = (data?.extra || null) as { day?: string; calls?: number } | null;
  const decision = reserveAeroBudget(extra, now);
  if (!decision.ok) return decision;
  const kept = { ...((data?.extra || {}) as Record<string, unknown>), ...decision.extra };
  if (data?.id) {
    await admin.from("crm_integrations").update({ extra: kept, updated_at: now.toISOString() }).eq("id", data.id);
  } else {
    await admin.from("crm_integrations").insert({ provider: "aeroapi", extra: kept });
  }
  return decision;
}

function arrivalPlace(details: Record<string, unknown>) {
  const city = typeof details.city_to === "string" ? details.city_to : "";
  const code = typeof details.to === "string" ? details.to : "";
  const named = typeof details.country === "string" ? details.country : "";
  return welcomePlace({ city, country: countryName(countryForIata(code)) || named });
}

async function notify(input: {
  admin: Admin;
  item: ItemRow;
  booking: BookingRow;
  customer: CustomerRow | undefined;
  kind: FlightNoticeKind;
  when?: string | null;
  place?: string | null;
  contentSid?: string;
}) {
  if (!input.booking.visible_to_client) return false;
  if (!input.customer?.email || !proactiveWhatsappAllowed(input.customer)) return false;
  const contentSid = input.contentSid || flightNoticeSid(input.kind);
  if (!contentSid) return false;
  const suffix = await reservationSuffix(input.admin, input.customer.email, input.booking.reference);
  if (!suffix) return false;
  const variables = flightNoticeVariables({
    kind: input.kind,
    flight: flightNumberLabel(input.item.details),
    route: flightRouteLabel(input.item.details),
    when: input.when,
    place: input.place,
    buttonSuffix: suffix,
  });
  if (!variables) return false;
  const result = await sendContentTemplate({
    phone: input.customer.phone,
    contentSid,
    variables,
  });
  return result.ok;
}

function missingTable(error: { code?: string } | null) {
  return Boolean(error?.code && MISSING_TABLE.has(error.code));
}

async function loadCheckinReminder(admin: Admin, bookingIds: string[]) {
  const empty = {
    documents: [] as ReminderDocument[],
    messages: [] as ReminderMessage[],
    status: new Map<string, string>(),
  };
  if (!bookingIds.length) return empty;
  const [docs, messages, checkins] = await Promise.all([
    admin
      .from("crm_booking_documents")
      .select("id, booking_id, booking_item_id, file_name, kind")
      .in("booking_id", bookingIds)
      .in("kind", ["carte d'embarquement", "carte d’embarquement"]),
    admin
      .from("crm_whatsapp_messages")
      .select("booking_id, template_key, status, body, payload")
      .in("booking_id", bookingIds)
      .in("template_key", ["carte_embarquement", "cartes_embarquement"]),
    admin.from("crm_flight_checkins").select("booking_item_id, status").in("booking_id", bookingIds),
  ]);
  if (docs.error) quiet(docs.error);
  if (messages.error) quiet(messages.error);
  if (checkins.error && !missingTable(checkins.error)) quiet(checkins.error);
  const status = new Map<string, string>();
  if (!checkins.error) {
    for (const row of (checkins.data || []) as { booking_item_id?: string; status?: string }[]) {
      if (row.booking_item_id && row.status) status.set(row.booking_item_id, row.status);
    }
  }
  return {
    documents: docs.error ? [] : ((docs.data || []) as ReminderDocument[]),
    messages: messages.error ? [] : ((messages.data || []) as ReminderMessage[]),
    status,
  };
}

function groupDue(items: ItemRow[], now: Date) {
  const groups = new Map<string, ItemRow[]>();
  for (const item of items) {
    if (!pollDue(item, now)) continue;
    const ident = flightIdent(item.details);
    if (!ident) continue;
    const list = groups.get(ident) || [];
    list.push(item);
    groups.set(ident, list);
  }
  return capDueGroups([...groups.entries()], now);
}

const PACE_EVERY = 8;
const PACE_MS = 6_000;

function pause(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function runFlightWatch(
  admin: Admin,
  deps: { now?: Date; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void> } = {}
) {
  const now = deps.now || new Date();
  const sleep = deps.sleep || pause;
  const aero = Boolean(aeroApiKey());
  const noticeSids = await ensureFlightNoticeSids(admin, deps.fetchImpl).catch((error) => {
    quiet(error);
    return {} as Partial<Record<FlightNoticeKind, string>>;
  });
  await sendApprovedFlightSamples(admin, noticeSids, deps.fetchImpl).catch((error) => quiet(error));

  const from = new Date(now.getTime() - 18 * 60 * 60 * 1000).toISOString();
  const to = new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await admin
    .from("crm_booking_items")
    .select("id, booking_id, kind, start_at, end_at, details, source_document_id")
    .eq("kind", "flight")
    .gte("start_at", from)
    .lte("start_at", to);
  if (error) {
    quiet(error);
    return { ok: false as const, reason: "items", calls: 0, updated: 0, notified: 0 };
  }
  const items = (rows || []) as ItemRow[];
  const bookingIds = [...new Set(items.map((item) => item.booking_id))];
  const bookings = new Map<string, BookingRow>();
  if (bookingIds.length) {
    const { data } = await admin
      .from("crm_bookings")
      .select("id, status, reference, visible_to_client, customer_id, archived_at, end_date")
      .in("id", bookingIds);
    for (const row of (data || []) as BookingRow[]) bookings.set(row.id, row);
  }
  const customerIds = [...new Set([...bookings.values()].map((row) => row.customer_id))];
  const customers = new Map<string, CustomerRow>();
  if (customerIds.length) {
    const { data } = await admin
      .from("crm_customers")
      .select("id, email, phone, whatsapp_opt_in_at, whatsapp_opt_out_at")
      .in("id", customerIds);
    for (const row of (data || []) as CustomerRow[]) customers.set(row.id, row);
  }

  const today = stayToday(now);
  const active = items.filter((item) => {
    const booking = bookings.get(item.booking_id);
    return Boolean(
      booking && !booking.archived_at && WATCH.has(booking.status) && stayDatesOpen(booking.end_date, today)
    );
  });
  const agencyCheckin = new Set<string>();
  if (bookingIds.length) {
    const { data: checkins, error: checkinError } = await admin
      .from("crm_booking_items")
      .select("booking_id")
      .in("booking_id", bookingIds)
      .eq("kind", "checkin");
    if (checkinError) quiet(checkinError);
    else for (const row of (checkins || []) as { booking_id: string }[]) agencyCheckin.add(row.booking_id);
  }

  let calls = 0;
  let updated = 0;
  let notified = 0;
  let capped = false;
  const seen = new Set<string>();

  for (const [ident, group] of aero ? groupDue(active, now) : []) {
    const designators = flightDesignators(group[0].details);
    const idents = designators.length ? designators : [ident];
    const attempts: Awaited<ReturnType<typeof fetchAeroFlights>>[] = [];
    let stopRun = false;
    const span = groupSpan(group, now);
    for (const designator of idents) {
      if (attempts.some((attempt) => attempt.ok && group.every((item) => matchAeroFlight(item, attempt.flights)))) {
        break;
      }
      if (calls > 0 && calls % PACE_EVERY === 0) await sleep(PACE_MS);
      const budget = await takeBudget(admin, now);
      if (!budget.ok) {
        capped = true;
        stopRun = true;
        break;
      }
      const result = await fetchAeroFlights(designator, span.from, deps.fetchImpl, now, span.to);
      calls += 1;
      attempts.push(result);
      const unmatched = result.ok ? group.filter((item) => !matchAeroFlight(item, result.flights)) : group;
      const note = !result.ok
        ? httpNote(result.status)
        : unmatched.length
          ? explainAeroMatch(unmatched[0], result.flights).note
          : "apparie";
      watchLog(result.status, result.flights.length, note);
      if (result.stop) {
        capped = true;
        stopRun = true;
        break;
      }
    }
    const usable = attempts.filter((attempt) => !attempt.stop);
    for (const item of usable.length ? group : []) {
      seen.add(item.id);
      const booking = bookings.get(item.booking_id);
      if (!booking) continue;
      let chosen: ReturnType<typeof matchAeroFlight> = null;
      let note = "aucun vol";
      let error = "";
      for (const attempt of usable) {
        if (!attempt.ok) {
          error = httpNote(attempt.status);
          note = error;
          continue;
        }
        const explained = explainAeroMatch(item, attempt.flights);
        if (explained.flight) {
          chosen = explained.flight;
          note = "";
          error = "";
          break;
        }
        note = explained.note;
        error = "";
      }
      const patch = applyAeroFlight(item, chosen, now, { note, error });
      let details = patch.details;
      const noticed = { ...item, start_at: patch.start_at, end_at: patch.end_at, details };
      for (const kind of pendingFlightNotices(noticed)) {
        const place = kind === "arrivee" ? arrivalPlace(details) : null;
        const when =
          kind === "horaire" || kind === "retard" ? flightClockLabel(patch.start_at) : null;
        if ((kind === "horaire" || kind === "retard") && !when) continue;
        if (kind === "arrivee" && !place) continue;
        const sent = await notify({
          admin,
          item: { ...item, start_at: patch.start_at, details },
          booking,
          customer: customers.get(booking.customer_id),
          kind,
          when,
          place,
          contentSid: noticeSids[kind],
        });
        if (sent) {
          details = markFlightNotified(details, kind, patch.start_at, now);
          notified += 1;
        }
      }
      const { error: writeError } = await admin
        .from("crm_booking_items")
        .update({ start_at: patch.start_at, end_at: patch.end_at, details, updated_at: now.toISOString() })
        .eq("id", item.id);
      if (writeError) quiet(writeError);
      else updated += 1;
      item.start_at = patch.start_at;
      item.end_at = patch.end_at;
      item.details = details;
    }
    if (stopRun) break;
  }

  const flightCounts = new Map<string, number>();
  for (const item of active) flightCounts.set(item.booking_id, (flightCounts.get(item.booking_id) || 0) + 1);
  const activeBookingIds = [...flightCounts.keys()];
  const reminder = await loadCheckinReminder(admin, activeBookingIds);

  for (const item of active) {
    if (!checkinAttemptDue(item, now, agencyCheckin.has(item.booking_id))) continue;
    if (
      checkinReminderBlocked({
        status: reminder.status.get(item.id) || null,
        flight: {
          id: item.id,
          booking_id: item.booking_id,
          source_document_id: item.source_document_id || null,
          details: item.details,
        },
        flightsOnBooking: flightCounts.get(item.booking_id) || 1,
        documents: reminder.documents,
        messages: reminder.messages,
      })
    ) {
      continue;
    }
    const booking = bookings.get(item.booking_id);
    if (!booking) continue;
    const customer = customers.get(booking.customer_id);
    const sent = await notify({
      admin,
      item,
      booking,
      customer,
      kind: "enregistrement",
      contentSid: noticeSids.enregistrement,
    });
    const details = sent
      ? markFlightNotified(item.details, "enregistrement", item.start_at, now)
      : markCheckinAttempt(item.details, now);
    if (sent) notified += 1;
    const { error: writeError } = await admin
      .from("crm_booking_items")
      .update({ details, updated_at: now.toISOString() })
      .eq("id", item.id);
    if (writeError) quiet(writeError);
    else if (!seen.has(item.id)) updated += 1;
  }

  return { ok: true as const, calls, updated, notified, capped, aero };
}
