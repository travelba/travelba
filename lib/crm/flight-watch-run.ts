import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createEntryLink, entryButtonSuffix, entryCodeFromLink } from "./entry-link";
import { countryForIata } from "./airports";
import { countryName } from "./countries";
import { ensureFlightNoticeSids, sendApprovedFlightSamples } from "./flight-notice-arm";
import { aeroApiKey, fetchAeroFlights, flightNoticeSid } from "./flight-watch-api";
import {
  applyAeroFlight,
  checkinAttemptDue,
  flightClockLabel,
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

type Admin = SupabaseClient;

type BookingRow = {
  id: string;
  status: string;
  reference: string;
  visible_to_client: boolean;
  customer_id: string;
  archived_at?: string | null;
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
};

const ACTIVE = new Set(["draft", "quoted", "confirmed", "travelling"]);
const REFERENCE = /^[A-Za-z0-9-]{4,40}$/;

function quiet(error: unknown) {
  const message = error instanceof Error ? error.message : "échec";
  console.error("[flight-watch]", message.replace(/https?:\/\/\S+/g, "").slice(0, 180));
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
  return [...groups.entries()].sort((left, right) => {
    const a = Date.parse(left[1][0]?.start_at || "") || 0;
    const b = Date.parse(right[1][0]?.start_at || "") || 0;
    return a - b;
  });
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
    .select("id, booking_id, kind, start_at, end_at, details")
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
      .select("id, status, reference, visible_to_client, customer_id, archived_at")
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

  const active = items.filter((item) => {
    const booking = bookings.get(item.booking_id);
    return Boolean(booking && !booking.archived_at && ACTIVE.has(booking.status));
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
    if (calls > 0 && calls % PACE_EVERY === 0) await sleep(PACE_MS);
    const budget = await takeBudget(admin, now);
    if (!budget.ok) {
      capped = true;
      break;
    }
    const result = await fetchAeroFlights(ident, now, deps.fetchImpl);
    calls += 1;
    if (result.stop) {
      capped = true;
      break;
    }
    for (const item of group) {
      seen.add(item.id);
      const booking = bookings.get(item.booking_id);
      if (!booking) continue;
      const patch = applyAeroFlight(item, result.ok ? matchAeroFlight(item, result.flights) : null, now);
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
  }

  for (const item of active) {
    if (!checkinAttemptDue(item, now, agencyCheckin.has(item.booking_id))) continue;
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
