import type { SupabaseClient } from "@supabase/supabase-js";
import { cityPlaceKey } from "./city-names";
import { phoneFromWhatsapp } from "./whatsapp-inbound";
import { sendContentTemplate } from "./whatsapp";
import { resolveContentSid, whatsappContentApproved } from "./twilio-content-sid";
import {
  clockLabel,
  closedOn,
  eveningAlerts,
  eveningsOfStay,
  EVENING_ALERT_LABELS,
  hotelForEvening,
  hotelsFromItems,
  localClock,
  planRestaurantCron,
  restaurantDedupeKey,
  TABLE_STATUS_LABELS,
  tableChoiceLine,
  timezoneForStay,
  type DeskEvening,
  type EveningAlert,
  type RestaurantRecord,
  type TableSeat,
  type TableStatus,
} from "./restaurants";
import {
  deliveryDecision,
  parseRestaurantReply,
  RESTAURANT_TEMPLATE_ENV,
  restaurantChoiceVariables,
  restaurantOutboundBody,
} from "./restaurant-whatsapp";
import { mapRestaurant, restaurantsReady, saveBookingChoice, type DeskTable } from "./restaurants-db";

type DbError = { code?: string | null } | null;

function logDb(scope: string, error: DbError) {
  console.error(`[restaurants] ${scope}`, error?.code ?? "?");
}

function isoShift(now: Date, days: number) {
  const copy = new Date(now.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy.toISOString().slice(0, 10);
}

type BookingRow = {
  id: string;
  reference: string;
  customer_id: string;
  title: string | null;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  timezone: string | null;
  status: string;
};

type CustomerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  whatsapp_opt_out_at?: string | null;
};

type TableRow = {
  id: string;
  booking_id: string;
  evening_date: string;
  seat: TableSeat;
  restaurant_id: string | null;
  time_local: string | null;
  status: TableStatus;
  cancel_fee_cents: number | null;
  cancelled_at: string | null;
  confirmation_ref: string | null;
  account_email: string | null;
  covers: number;
  card_last4: string | null;
};

type EveningRow = {
  booking_id: string;
  evening_date: string;
  choice: DeskEvening["choice"];
  choice_source: "whatsapp" | "manuel" | null;
  message_status: DeskEvening["messageStatus"];
  message_sent_at: string | null;
  closed_at: string | null;
};

type Bundle = {
  bookings: BookingRow[];
  customers: Map<string, CustomerRow>;
  travelerCount: Map<string, number>;
  travelerNames: Map<string, { prenom: string; nom: string }[]>;
  hotels: Map<string, ReturnType<typeof hotelsFromItems>>;
  tables: TableRow[];
  evenings: EveningRow[];
  restaurants: Map<string, RestaurantRecord>;
};

async function loadBundle(db: SupabaseClient, now: Date): Promise<Bundle | { missing: true } | { error: true }> {
  const from = isoShift(now, -3);
  const to = isoShift(now, 3);
  const bookings = await db
    .from("crm_bookings")
    .select("id, reference, customer_id, title, destination, start_date, end_date, timezone, status, archived_at")
    .is("archived_at", null)
    .neq("status", "cancelled")
    .or(`start_date.is.null,start_date.lte.${to}`)
    .or(`end_date.is.null,end_date.gte.${from}`)
    .limit(200);
  if (bookings.error) {
    logDb("séjours", bookings.error);
    if (!restaurantsReady(bookings.error)) return { missing: true };
    return { error: true };
  }
  const rows = (bookings.data || []) as BookingRow[];
  const ids = rows.map((row) => row.id);
  if (!ids.length) {
    return {
      bookings: [],
      customers: new Map(),
      travelerCount: new Map(),
      travelerNames: new Map(),
      hotels: new Map(),
      tables: [],
      evenings: [],
      restaurants: new Map(),
    };
  }
  const customerIds = [...new Set(rows.map((row) => row.customer_id))];
  const [items, people, travelers, tables, evenings] = await Promise.all([
    db.from("crm_booking_items").select("booking_id, kind, title, start_at, end_at, lifecycle, details").in("booking_id", ids).eq("kind", "hotel"),
    db.from("crm_customers").select("id, first_name, last_name, phone, whatsapp_opt_out_at").in("id", customerIds),
    db.from("crm_booking_travelers").select("booking_id, first_name, last_name").in("booking_id", ids),
    db.from("crm_restaurant_tables").select("*").in("booking_id", ids).gte("evening_date", from).lte("evening_date", to),
    db.from("crm_restaurant_evenings").select("*").in("booking_id", ids).gte("evening_date", from).lte("evening_date", to),
  ]);
  for (const result of [tables, evenings]) {
    if (result.error && !restaurantsReady(result.error)) return { missing: true };
    if (result.error) {
      logDb("soirées", result.error);
      return { error: true };
    }
  }
  const hotels = new Map<string, ReturnType<typeof hotelsFromItems>>();
  for (const row of (items.data || []) as {
    booking_id: string;
    kind?: string | null;
    title?: string | null;
    start_at?: string | null;
    end_at?: string | null;
    lifecycle?: string | null;
    details?: Record<string, unknown> | null;
  }[]) {
    const list = hotels.get(row.booking_id) || [];
    list.push(...hotelsFromItems([row]));
    hotels.set(row.booking_id, list);
  }
  const cityKeys = [...new Set([...hotels.values()].flat().map((hotel) => cityPlaceKey(hotel.city)).filter(Boolean))];
  const catalog = cityKeys.length
    ? await db.from("crm_restaurants").select("*").in("city_key", cityKeys).limit(500)
    : { data: [] as Record<string, unknown>[], error: null };
  if (catalog.error && !restaurantsReady(catalog.error)) return { missing: true };
  const restaurants = new Map<string, RestaurantRecord>();
  for (const row of (catalog.data || []) as Record<string, unknown>[]) {
    const restaurant = mapRestaurant(row);
    restaurants.set(restaurant.id, restaurant);
  }
  const travelerCount = new Map<string, number>();
  const travelerNames = new Map<string, { prenom: string; nom: string }[]>();
  for (const row of (travelers.data || []) as { booking_id: string; first_name: string | null; last_name: string | null }[]) {
    travelerCount.set(row.booking_id, (travelerCount.get(row.booking_id) || 0) + 1);
    const names = travelerNames.get(row.booking_id) || [];
    names.push({ prenom: row.first_name || "", nom: row.last_name || "" });
    travelerNames.set(row.booking_id, names);
  }
  const customers = new Map<string, CustomerRow>();
  for (const row of (people.data || []) as CustomerRow[]) customers.set(row.id, row);
  return {
    bookings: rows,
    customers,
    travelerCount,
    travelerNames,
    hotels,
    tables: (tables.data || []) as TableRow[],
    evenings: (evenings.data || []) as EveningRow[],
    restaurants,
  };
}

function zoneFor(booking: BookingRow, hotels: ReturnType<typeof hotelsFromItems>, date: string) {
  const hotel = hotelForEvening(hotels, date);
  return {
    hotel,
    ...timezoneForStay({
      stored: booking.timezone,
      hotelZone: hotel?.zone,
      city: hotel?.city || booking.destination,
      country: hotel?.country,
    }),
  };
}

function deskTables(bundle: Bundle, bookingId: string, date: string): DeskTable[] {
  const mine = bundle.tables.filter((row) => row.booking_id === bookingId && row.evening_date.slice(0, 10) === date);
  return (["A", "B"] as TableSeat[]).map((seat) => {
    const row = mine.find((item) => item.seat === seat);
    const restaurant = row?.restaurant_id ? bundle.restaurants.get(row.restaurant_id) : undefined;
    return {
      id: row?.id || null,
      seat,
      restaurantId: row?.restaurant_id || null,
      time: row?.time_local ? row.time_local.slice(0, 5) : null,
      covers: row?.covers || Math.max(1, bundle.travelerCount.get(bookingId) || 1),
      confirmation: row?.confirmation_ref || null,
      account: row?.account_email || "",
      cardLast4: row?.card_last4 || null,
      status: row?.status || "a_reserver",
      statusLabel: TABLE_STATUS_LABELS[row?.status || "a_reserver"],
      cancelFeeCents: row?.cancel_fee_cents ?? null,
      cancelledAt: row?.cancelled_at || null,
      restaurantClosed: restaurant ? closedOn(restaurant, date) : false,
    };
  });
}

export type TonightCard = {
  bookingId: string;
  date: string;
  reference: string;
  client: string;
  hotel: string;
  city: string;
  timezone: string | null;
  hasPhone: boolean;
  choice: string | null;
  choiceSource: string | null;
  messageStatus: string;
  messageSentAt: string | null;
  tables: { seat: TableSeat; name: string; time: string; status: string; statusLabel: string }[];
  alerts: { id: EveningAlert; label: string }[];
};

export async function loadTonight(db: SupabaseClient, now = new Date()) {
  const bundle = await loadBundle(db, now);
  if ("missing" in bundle) return { ready: false as const, rows: [] as TonightCard[], message: "Le module restaurants n’est pas encore en place." };
  if ("error" in bundle) return { ready: false as const, rows: [] as TonightCard[], message: "Lecture impossible." };
  const cards: TonightCard[] = [];
  for (const booking of bundle.bookings) {
    const hotels = bundle.hotels.get(booking.id) || [];
    const dates = eveningsOfStay(hotels, booking.start_date, booking.end_date);
    for (const date of dates) {
      const placed = zoneFor(booking, hotels, date);
      const local = placed.zone ? localClock(now, placed.zone)?.isoDate : null;
      const utc = now.toISOString().slice(0, 10);
      const paris = localClock(now, "Europe/Paris")?.isoDate;
      const tonight = placed.zone ? local === date : date === utc || date === paris;
      if (!tonight) continue;
      const customer = bundle.customers.get(booking.customer_id);
      const hasPhone = Boolean(customer?.phone);
      const tables = deskTables(bundle, booking.id, date);
      const state = bundle.evenings.find((row) => row.booking_id === booking.id && row.evening_date.slice(0, 10) === date);
      const alerts = eveningAlerts({
        now,
        eveningDate: date,
        timezone: placed.zone,
        hasPhone,
        tables: tables.map((table) => ({
          status: table.status,
          restaurantClosed: table.restaurantClosed,
          cancelledAt: table.cancelledAt,
        })),
      });
      cards.push({
        bookingId: booking.id,
        date,
        reference: booking.reference,
        client: [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || "Client",
        hotel: placed.hotel?.name || "",
        city: placed.hotel?.city || booking.destination || "",
        timezone: placed.zone,
        hasPhone,
        choice: state?.choice || null,
        choiceSource: state?.choice_source || null,
        messageStatus: state?.message_status || "aucun",
        messageSentAt: state?.message_sent_at || null,
        tables: tables.map((table) => ({
          seat: table.seat,
          name: (table.restaurantId && bundle.restaurants.get(table.restaurantId)?.name) || "",
          time: clockLabel(table.time),
          status: table.status,
          statusLabel: table.statusLabel,
        })),
        alerts: alerts.map((id) => ({ id, label: EVENING_ALERT_LABELS[id] })),
      });
    }
  }
  cards.sort((a, b) => a.timezone?.localeCompare(b.timezone || "") || a.client.localeCompare(b.client, "fr"));
  return { ready: true as const, rows: cards, message: "" };
}

async function templateSid() {
  const sid = await resolveContentSid(RESTAURANT_TEMPLATE_ENV);
  if (!sid) return "";
  return (await whatsappContentApproved(sid)) ? sid : "";
}

async function rememberMessage(
  db: SupabaseClient,
  input: {
    bookingId: string;
    customerId: string;
    phone: string | null;
    eveningDate: string;
    body: string;
    status: "en_file" | "envoye" | "echec";
    whatsappStatus: "queued" | "sent" | "failed";
    sid?: string | null;
    error?: string | null;
  }
) {
  const key = restaurantDedupeKey(input.bookingId, input.eveningDate);
  const existing = await db.from("crm_restaurant_messages").select("id").eq("dedupe_key", key).maybeSingle();
  const row = {
    booking_id: input.bookingId,
    evening_date: input.eveningDate,
    direction: "outbound",
    body: input.body,
    status: input.status,
    twilio_sid: input.sid || null,
    dedupe_key: key,
  };
  if (existing.data) {
    await db.from("crm_restaurant_messages").update(row).eq("dedupe_key", key);
  } else {
    const inserted = await db.from("crm_restaurant_messages").insert(row);
    if (inserted.error && inserted.error.code !== "23505") logDb("message", inserted.error);
  }
  const wa = await db.from("crm_whatsapp_messages").select("id").eq("dedupe_key", key).maybeSingle();
  const mirror = {
    customer_id: input.customerId,
    booking_id: input.bookingId,
    direction: "outbound",
    template_key: "restaurant_choix",
    body: input.body,
    status: input.whatsappStatus,
    twilio_sid: input.sid || null,
    dedupe_key: key,
    phone: input.phone,
    error: input.error || null,
  };
  if (wa.data) await db.from("crm_whatsapp_messages").update(mirror).eq("dedupe_key", key);
  else {
    const inserted = await db.from("crm_whatsapp_messages").insert(mirror);
    if (inserted.error && inserted.error.code !== "23505") logDb("whatsapp", inserted.error);
  }
  await db.from("crm_restaurant_evenings").upsert(
    {
      booking_id: input.bookingId,
      evening_date: input.eveningDate,
      message_status: input.status,
      message_sent_at: input.status === "envoye" ? new Date().toISOString() : null,
    },
    { onConflict: "booking_id,evening_date" }
  );
}

export async function listInStay(db: SupabaseClient, now = new Date()) {
  const bundle = await loadBundle(db, now);
  if ("missing" in bundle) return { sejours: [] as InStay[], message: "Le module restaurants n’est pas encore en place." };
  if ("error" in bundle) return { sejours: [] as InStay[], message: "Lecture impossible." };
  const sejours: InStay[] = [];
  const utc = now.toISOString().slice(0, 10);
  for (const booking of bundle.bookings) {
    const hotels = bundle.hotels.get(booking.id) || [];
    const dates = eveningsOfStay(hotels, booking.start_date, booking.end_date);
    const tonight = dates.find((date) => {
      const placed = zoneFor(booking, hotels, date);
      if (!placed.zone) return date === utc;
      return localClock(now, placed.zone)?.isoDate === date;
    });
    if (!tonight) continue;
    const placed = zoneFor(booking, hotels, tonight);
    const customer = bundle.customers.get(booking.customer_id);
    const phone = customer?.phone || null;
    sejours.push({
      dossier_id: booking.id,
      reference: booking.reference,
      client: [customer?.first_name, customer?.last_name].filter(Boolean).join(" "),
      hotel: placed.hotel?.name || "",
      ville: placed.hotel?.city || booking.destination || "",
      arrivee: dates[0] || booking.start_date,
      depart: booking.end_date,
      voyageurs: bundle.travelerNames.get(booking.id) || [],
      couverts: bundle.travelerCount.get(booking.id) || 0,
      whatsapp: Boolean(phone) && !customer?.whatsapp_opt_out_at,
      telephone: phone,
      fuseau: placed.zone,
    });
  }
  return { sejours };
}

type InStay = {
  dossier_id: string;
  reference: string;
  client: string;
  hotel: string;
  ville: string;
  arrivee: string | null;
  depart: string | null;
  voyageurs: { prenom: string; nom: string }[];
  couverts: number;
  whatsapp: boolean;
  telephone: string | null;
  fuseau: string | null;
};

export async function runRestaurantCronJob(db: SupabaseClient, now = new Date()) {
  const bundle = await loadBundle(db, now);
  if ("missing" in bundle) return { ready: false, queued: 0, sent: 0, closed: 0 };
  if ("error" in bundle) return { ready: false, queued: 0, sent: 0, closed: 0 };
  const sid = await templateSid();
  const desks: DeskEvening[] = [];
  const detail = new Map<string, { booking: BookingRow; customer: CustomerRow | undefined; tables: TableRow[] }>();
  for (const booking of bundle.bookings) {
    const hotels = bundle.hotels.get(booking.id) || [];
    const earliest = isoShift(now, -2);
    const latest = isoShift(now, 1);
    const dates = eveningsOfStay(hotels, booking.start_date, booking.end_date).filter((date) => date >= earliest && date <= latest);
    for (const date of dates) {
      const placed = zoneFor(booking, hotels, date);
      const customer = bundle.customers.get(booking.customer_id);
      const tables = deskTables(bundle, booking.id, date);
      const state = bundle.evenings.find((row) => row.booking_id === booking.id && row.evening_date.slice(0, 10) === date);
      const key = `${booking.id}:${date}`;
      desks.push({
        bookingId: booking.id,
        eveningDate: date,
        timezone: placed.zone,
        choice: state?.choice || null,
        messageStatus: state?.message_status || "aucun",
        closed: Boolean(state?.closed_at),
        canWhatsapp: Boolean(customer?.phone) && !customer?.whatsapp_opt_out_at,
        tables: tables.map((table) => ({
          seat: table.seat,
          status: table.status,
          restaurantName: (table.restaurantId && bundle.restaurants.get(table.restaurantId)?.name) || null,
        })),
      });
      detail.set(key, {
        booking,
        customer,
        tables: bundle.tables.filter((row) => row.booking_id === booking.id && row.evening_date.slice(0, 10) === date),
      });
    }
  }
  const plan = planRestaurantCron(desks, now, Boolean(sid));
  let queued = 0;
  let sent = 0;
  let closed = 0;
  for (const action of plan.sends) {
    const already = desks.find((row) => row.bookingId === action.bookingId && row.eveningDate === action.eveningDate);
    if (action.mode === "queue" && already?.messageStatus === "en_file") continue;
    const row = detail.get(`${action.bookingId}:${action.eveningDate}`);
    if (!row?.customer?.phone) continue;
    const left = row.tables.find((table) => table.seat === "A");
    const right = row.tables.find((table) => table.seat === "B");
    const nameA = (left?.restaurant_id && bundle.restaurants.get(left.restaurant_id)?.name) || "";
    const nameB = (right?.restaurant_id && bundle.restaurants.get(right.restaurant_id)?.name) || "";
    const body = restaurantOutboundBody({
      firstName: row.customer.first_name,
      eveningDate: action.eveningDate,
      tableA: { name: nameA, time: left?.time_local || null },
      tableB: { name: nameB, time: right?.time_local || null },
    });
    const decision = deliveryDecision({
      templateSid: action.mode === "send" ? sid : "",
      hasPhone: true,
      alreadySent: false,
    });
    if (decision === "queue") {
      await rememberMessage(db, {
        bookingId: action.bookingId,
        customerId: row.customer.id,
        phone: row.customer.phone,
        eveningDate: action.eveningDate,
        body,
        status: "en_file",
        whatsappStatus: "queued",
        error: "Modèle WhatsApp pas encore approuvé.",
      });
      queued += 1;
      continue;
    }
    const result = await sendContentTemplate({
      phone: row.customer.phone,
      contentSid: sid,
      variables: restaurantChoiceVariables({
        firstName: row.customer.first_name,
        eveningDate: action.eveningDate,
        tableA: tableChoiceLine(nameA, left?.time_local),
        tableB: tableChoiceLine(nameB, right?.time_local),
      }),
    });
    if (!result.ok) {
      await rememberMessage(db, {
        bookingId: action.bookingId,
        customerId: row.customer.id,
        phone: row.customer.phone,
        eveningDate: action.eveningDate,
        body,
        status: result.reason === "not_configured" ? "en_file" : "echec",
        whatsappStatus: result.reason === "not_configured" ? "queued" : "failed",
        error: result.reason === "not_configured" ? "Modèle WhatsApp pas encore approuvé." : "WhatsApp n’a pas accepté le message.",
      });
      if (result.reason === "not_configured") queued += 1;
      continue;
    }
    await rememberMessage(db, {
      bookingId: action.bookingId,
      customerId: row.customer.id,
      phone: row.customer.phone,
      eveningDate: action.eveningDate,
      body,
      status: "envoye",
      whatsappStatus: "sent",
      sid: result.sid,
    });
    await db
      .from("crm_restaurant_tables")
      .update({ status: "proposee", updated_at: new Date().toISOString() })
      .eq("booking_id", action.bookingId)
      .eq("evening_date", action.eveningDate)
      .eq("status", "reservee");
    sent += 1;
  }
  for (const action of plan.closes) {
    for (const table of action.tables) {
      await db
        .from("crm_restaurant_tables")
        .update({ status: table.status, updated_at: new Date().toISOString() })
        .eq("booking_id", action.bookingId)
        .eq("evening_date", action.eveningDate)
        .eq("seat", table.seat)
        .neq("status", table.status);
    }
    const stamp = new Date().toISOString();
    const updated = await db
      .from("crm_restaurant_evenings")
      .update({ closed_at: stamp })
      .eq("booking_id", action.bookingId)
      .eq("evening_date", action.eveningDate)
      .select("booking_id");
    if (!updated.error && !(updated.data || []).length) {
      await db.from("crm_restaurant_evenings").insert({
        booking_id: action.bookingId,
        evening_date: action.eveningDate,
        closed_at: stamp,
      });
    }
    closed += 1;
  }
  return { ready: true, queued, sent, closed };
}

export async function captureRestaurantChoice(db: SupabaseClient, params: URLSearchParams, now = new Date()) {
  const choice = parseRestaurantReply({ body: params.get("Body"), buttonPayload: params.get("ButtonPayload") });
  if (!choice) return { handled: false as const };
  const phone = phoneFromWhatsapp(params.get("From"));
  if (!phone) return { handled: false as const };
  const [primary, secondary] = await Promise.all([
    db.from("crm_customers").select("id, first_name").eq("phone", phone),
    db.from("crm_customers").select("id, first_name").eq("phone_secondary", phone),
  ]);
  const people = new Map<string, { id: string; first_name: string | null }>();
  for (const row of [...(primary.data || []), ...(secondary.data || [])] as { id: string; first_name: string | null }[]) {
    people.set(row.id, row);
  }
  if (people.size !== 1) return { handled: false as const };
  const customer = [...people.values()][0];
  const bookings = await db
    .from("crm_bookings")
    .select("id, reference, customer_id, title, destination, start_date, end_date, timezone, status")
    .eq("customer_id", customer.id)
    .neq("status", "cancelled")
    .is("archived_at", null)
    .limit(20);
  if (bookings.error || !(bookings.data || []).length) return { handled: false as const };
  const ids = (bookings.data as BookingRow[]).map((row) => row.id);
  const [evenings, items] = await Promise.all([
    db.from("crm_restaurant_evenings").select("*").in("booking_id", ids).eq("message_status", "envoye").is("choice", null),
    db.from("crm_booking_items").select("booking_id, kind, title, start_at, end_at, lifecycle, details").in("booking_id", ids).eq("kind", "hotel"),
  ]);
  if (evenings.error && !restaurantsReady(evenings.error)) return { handled: false as const };
  const open = (evenings.data || []) as EveningRow[];
  if (!open.length) return { handled: false as const };
  const hotels = new Map<string, ReturnType<typeof hotelsFromItems>>();
  for (const row of (items.data || []) as {
    booking_id: string;
    kind?: string | null;
    title?: string | null;
    start_at?: string | null;
    end_at?: string | null;
    lifecycle?: string | null;
    details?: Record<string, unknown> | null;
  }[]) {
    hotels.set(row.booking_id, [...(hotels.get(row.booking_id) || []), ...hotelsFromItems([row])]);
  }
  const bookingById = new Map((bookings.data as BookingRow[]).map((row) => [row.id, row]));
  const ranked = open
    .map((row) => {
      const booking = bookingById.get(row.booking_id);
      const zone = booking ? zoneFor(booking, hotels.get(row.booking_id) || [], row.evening_date.slice(0, 10)).zone : null;
      const today = zone ? localClock(now, zone)?.isoDate === row.evening_date.slice(0, 10) : false;
      return { row, today, sent: row.message_sent_at || "" };
    })
    .sort((a, b) => Number(b.today) - Number(a.today) || b.sent.localeCompare(a.sent));
  const target = ranked[0];
  if (!target) return { handled: false as const };
  if (ranked.length > 1 && ranked[0].today === ranked[1].today && ranked[0].sent === ranked[1].sent) return { handled: false as const };
  const date = target.row.evening_date.slice(0, 10);
  const saved = await saveBookingChoice(db, target.row.booking_id, { date, choice, source: "whatsapp" });
  if ("error" in saved) return { handled: false as const };
  const label = choice === "aucune" ? "Aucune" : choice;
  await db.from("crm_restaurant_messages").insert({
    booking_id: target.row.booking_id,
    evening_date: date,
    direction: "inbound",
    body: label,
    button: choice,
    status: "recu",
    twilio_sid: params.get("MessageSid") || null,
  });
  await db.from("crm_whatsapp_messages").insert({
    customer_id: customer.id,
    booking_id: target.row.booking_id,
    direction: "inbound",
    template_key: "restaurant_choix",
    body: label,
    status: "received",
    twilio_sid: params.get("MessageSid") || null,
    phone,
  });
  return { handled: true as const, bookingId: target.row.booking_id, date, choice };
}
