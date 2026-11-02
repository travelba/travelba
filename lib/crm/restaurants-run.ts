import type { SupabaseClient } from "@supabase/supabase-js";
import { cityPlaceKey } from "./city-names";
import { phoneFromWhatsapp } from "./whatsapp-inbound";
import { sendContentTemplate } from "./whatsapp";
import { sendWhatsappSession, sessionAddress } from "./whatsapp-session";
import { approvedRestaurantContentSid } from "./restaurant-templates-arm";
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
  RESTAURANT_COVERS,
  restaurantDefaultClock,
  restaurantDedupeKey,
  restaurantPartFromKey,
  TABLE_STATUS_LABELS,
  type DeskEvening,
  type EveningAlert,
  type RestaurantPart,
  type RestaurantRecord,
  type TableSeat,
  type TableStatus,
} from "./restaurants";
import { timezoneForStay } from "./stay-timezone";
import {
  deliveryDecision,
  parseRestaurantButton,
  RESTAURANT_CAROUSEL_ENV,
  RESTAURANT_CAROUSEL_MENU_ENV,
  RESTAURANT_INTRO_ENV,
  restaurantAcceptAck,
  restaurantCarouselDraft,
  restaurantGreeting,
  restaurantIntroText,
  restaurantIntroVariables,
  restaurantPlaceLink,
} from "./restaurant-whatsapp";
import { mapRestaurant, refuseRestaurantSeat, restaurantsReady, saveBookingChoice, type DeskTable } from "./restaurants-db";
import { ficheGaps } from "./restaurant-desk";
import { outboundRestaurantPhone, restaurantTestPhone } from "./restaurant-test";
import { RESTAURANT_ALLOWLIST_BLOCK, restaurantAllowlist, restaurantBookingAllowed, restaurantSendGate } from "./restaurant-allowlist";

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
  is_test?: boolean;
};

/** Un dossier entre dans le module s’il est dans la liste d’essai, ou s’il est une donnée de test (numéro de test seulement). */
function bundleBookingAllowed(row: Pick<BookingRow, "reference" | "is_test">, allowlist: Set<string>) {
  return Boolean(row.is_test) || restaurantBookingAllowed(row.reference, allowlist);
}

type CustomerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  sex: string | null;
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
  is_test?: boolean;
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

type OutboundRow = {
  booking_id: string;
  evening_date: string;
  dedupe_key: string | null;
  status: string;
  body: string | null;
};

type Bundle = {
  bookings: BookingRow[];
  customers: Map<string, CustomerRow>;
  travelerNames: Map<string, { prenom: string; nom: string }[]>;
  hotels: Map<string, ReturnType<typeof hotelsFromItems>>;
  tables: TableRow[];
  evenings: EveningRow[];
  messages: OutboundRow[];
  restaurants: Map<string, RestaurantRecord>;
};

async function loadBundle(db: SupabaseClient, now: Date): Promise<Bundle | { missing: true } | { error: true }> {
  const from = isoShift(now, -3);
  const to = isoShift(now, 3);
  const columns = "id, reference, customer_id, title, destination, start_date, end_date, timezone, status, archived_at, is_test";
  let bookings = await db
    .from("crm_bookings")
    .select(columns)
    .is("archived_at", null)
    .neq("status", "cancelled")
    .or(`start_date.is.null,start_date.lte.${to}`)
    .or(`end_date.is.null,end_date.gte.${from}`)
    .limit(200);
  if (bookings.error && (bookings.error.code === "42703" || bookings.error.code === "PGRST204")) {
    const plain = await db
      .from("crm_bookings")
      .select("id, reference, customer_id, title, destination, start_date, end_date, timezone, status, archived_at")
      .is("archived_at", null)
      .neq("status", "cancelled")
      .or(`start_date.is.null,start_date.lte.${to}`)
      .or(`end_date.is.null,end_date.gte.${from}`)
      .limit(200);
    if (plain.error) {
      logDb("séjours", plain.error);
      return { error: true };
    }
    bookings = { ...plain, data: (plain.data || []).map((row) => ({ ...row, is_test: false })) } as unknown as typeof bookings;
  }
  if (bookings.error) {
    logDb("séjours", bookings.error);
    if (!restaurantsReady(bookings.error)) return { missing: true };
    return { error: true };
  }
  const allowlist = restaurantAllowlist();
  const rows = ((bookings.data || []) as BookingRow[]).filter((row) => bundleBookingAllowed(row, allowlist));
  const ids = rows.map((row) => row.id);
  if (!ids.length) {
    return {
      bookings: [],
      customers: new Map(),
      travelerNames: new Map(),
      hotels: new Map(),
      tables: [],
      evenings: [],
      messages: [],
      restaurants: new Map(),
    };
  }
  const customerIds = [...new Set(rows.map((row) => row.customer_id))];
  const [items, people, travelers, tables, evenings, messages] = await Promise.all([
    db.from("crm_booking_items").select("booking_id, kind, title, start_at, end_at, lifecycle, details").in("booking_id", ids).eq("kind", "hotel"),
    db.from("crm_customers").select("id, first_name, last_name, sex, phone, whatsapp_opt_out_at").in("id", customerIds),
    db.from("crm_booking_travelers").select("booking_id, first_name, last_name").in("booking_id", ids),
    db.from("crm_restaurant_tables").select("*").in("booking_id", ids).gte("evening_date", from).lte("evening_date", to),
    db.from("crm_restaurant_evenings").select("*").in("booking_id", ids).gte("evening_date", from).lte("evening_date", to),
    db
      .from("crm_restaurant_messages")
      .select("booking_id, evening_date, dedupe_key, status, body")
      .in("booking_id", ids)
      .eq("direction", "outbound")
      .gte("evening_date", from)
      .lte("evening_date", to),
  ]);
  for (const result of [tables, evenings, messages]) {
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
  const travelerNames = new Map<string, { prenom: string; nom: string }[]>();
  for (const row of (travelers.data || []) as { booking_id: string; first_name: string | null; last_name: string | null }[]) {
    const names = travelerNames.get(row.booking_id) || [];
    names.push({ prenom: row.first_name || "", nom: row.last_name || "" });
    travelerNames.set(row.booking_id, names);
  }
  const customers = new Map<string, CustomerRow>();
  for (const row of (people.data || []) as CustomerRow[]) customers.set(row.id, row);
  return {
    bookings: rows,
    customers,
    travelerNames,
    hotels,
    tables: (tables.data || []) as TableRow[],
    evenings: (evenings.data || []) as EveningRow[],
    messages: (messages.data || []) as OutboundRow[],
    restaurants,
  };
}

type BookingHead = { id: string; reference: string; customer_id: string; is_test: boolean };

/** Référence, client et drapeau test d’un dossier, avant la colonne `is_test` si la migration manque. */
async function bookingHead(db: SupabaseClient, bookingId: string): Promise<BookingHead | null> {
  const full = await db.from("crm_bookings").select("id, reference, customer_id, is_test").eq("id", bookingId).maybeSingle();
  if (!full.error) {
    const row = full.data as { id: string; reference: string; customer_id: string; is_test?: boolean } | null;
    return row ? { id: row.id, reference: row.reference, customer_id: row.customer_id, is_test: Boolean(row.is_test) } : null;
  }
  if (!columnMissing(full.error.code)) return null;
  const plain = await db.from("crm_bookings").select("id, reference, customer_id").eq("id", bookingId).maybeSingle();
  const row = plain.data as { id: string; reference: string; customer_id: string } | null;
  return row ? { ...row, is_test: false } : null;
}

function zoneFor(booking: BookingRow, hotels: ReturnType<typeof hotelsFromItems>, date: string) {
  const hotel = hotelForEvening(hotels, date);
  return {
    hotel,
    ...timezoneForStay({
      stored: booking.timezone,
      hotelZone: hotel?.zone,
      city: hotel?.city,
      country: hotel?.country,
      destination: booking.destination,
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
      covers: RESTAURANT_COVERS,
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

/** SID approuvé : la variable, sinon le modèle retrouvé chez Twilio par son nom. Vide : en file. */
function approvedSid(envName: string) {
  return approvedRestaurantContentSid(envName);
}

function columnMissing(code: string | null | undefined) {
  return code === "42703" || code === "PGRST204";
}

async function rememberMessage(
  db: SupabaseClient,
  input: {
    bookingId: string;
    customerId: string;
    phone: string | null;
    eveningDate: string;
    part: RestaurantPart;
    body: string;
    status: "en_file" | "envoye" | "echec";
    whatsappStatus: "queued" | "sent" | "failed";
    sid?: string | null;
    error?: string | null;
    tableId?: string | null;
    templateKey: string;
    isTest?: boolean;
  }
) {
  const key = restaurantDedupeKey(input.bookingId, input.eveningDate, input.part);
  const existing = await db.from("crm_restaurant_messages").select("id").eq("dedupe_key", key).maybeSingle();
  const row = {
    booking_id: input.bookingId,
    evening_date: input.eveningDate,
    direction: "outbound",
    body: input.body,
    status: input.status,
    twilio_sid: input.sid || null,
    dedupe_key: key,
    part: input.part,
    table_id: input.tableId || null,
    is_test: Boolean(input.isTest),
  };
  const write = existing.data
    ? await db.from("crm_restaurant_messages").update(row).eq("dedupe_key", key)
    : await db.from("crm_restaurant_messages").insert(row);
  if (write.error && columnMissing(write.error.code)) {
    const { part, table_id, is_test, ...slim } = row;
    void part;
    void table_id;
    void is_test;
    const again = existing.data
      ? await db.from("crm_restaurant_messages").update(slim).eq("dedupe_key", key)
      : await db.from("crm_restaurant_messages").insert(slim);
    if (again.error && again.error.code !== "23505") logDb("message", again.error);
  } else if (write.error && write.error.code !== "23505") logDb("message", write.error);
  const wa = await db.from("crm_whatsapp_messages").select("id").eq("dedupe_key", key).maybeSingle();
  const mirror = {
    customer_id: input.customerId,
    booking_id: input.bookingId,
    direction: "outbound",
    template_key: input.templateKey,
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
  const keys = (["intro", "A", "B"] as const).map((part) => restaurantDedupeKey(input.bookingId, input.eveningDate, part));
  const stored = await db.from("crm_restaurant_messages").select("dedupe_key, status").in("dedupe_key", keys);
  const byPart = new Map(
    ((stored.data || []) as { dedupe_key: string | null; status: string }[]).map((item) => [
      restaurantPartFromKey(item.dedupe_key),
      item.status,
    ])
  );
  const complete = (["intro", "A", "B"] as const).every((part) => byPart.get(part) === "envoye");
  const failed = (["intro", "A", "B"] as const).some((part) => byPart.get(part) === "echec");
  const messageStatus = complete ? "envoye" : failed ? "echec" : "en_file";
  await db.from("crm_restaurant_evenings").upsert(
    {
      booking_id: input.bookingId,
      evening_date: input.eveningDate,
      message_status: messageStatus,
      ...(complete ? { message_sent_at: new Date().toISOString() } : {}),
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
      couverts: RESTAURANT_COVERS,
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

function prepareRestaurantSend(input: {
  action: { part: RestaurantPart; eveningDate: string };
  row: { tables: TableRow[] };
  restaurants: Map<string, RestaurantRecord>;
  greeting: string;
  introSid: string;
  carouselSid: string;
  menuSid: string;
}):
  | { error: string; tableId: string | null; templateKey: string }
  | { contentSid: string; variables: Record<string, string>; text: string; tableId: string | null; templateKey: string } {
  if (input.action.part === "intro") {
    return {
      contentSid: input.introSid,
      variables: restaurantIntroVariables({ greeting: input.greeting, eveningDate: input.action.eveningDate }),
      text: restaurantIntroText({ greeting: input.greeting, eveningDate: input.action.eveningDate }),
      tableId: null,
      templateKey: "restaurant_selection",
    };
  }
  const table = input.row.tables.find((item) => item.seat === input.action.part);
  const restaurant = table?.restaurant_id ? input.restaurants.get(table.restaurant_id) : undefined;
  const templateKey = "restaurant_proposition";
  if (!table?.id || !restaurant) return { error: "Restaurant introuvable.", tableId: table?.id || null, templateKey };
  if (!restaurant.photoUrls[0] || !restaurant.signaturePhotoUrl) {
    return { error: "Photo de la salle ou du plat manquante.", tableId: table.id, templateKey };
  }
  const withMenu = Boolean(restaurant.menuPhotoUrl && input.menuSid);
  const draft = restaurantCarouselDraft({
    greeting: input.greeting,
    restaurantName: restaurant.name,
    timeLabel: clockLabel(table.time_local) || restaurantDefaultClock(),
    pitch: restaurant.pitch,
    priceBand: restaurant.priceBand,
    restaurantId: restaurant.id,
    tableId: table.id,
    menuPhoto: withMenu,
  });
  if ("error" in draft) return { error: draft.error, tableId: table.id, templateKey };
  return {
    contentSid: withMenu ? input.menuSid : input.carouselSid,
    variables: draft.variables,
    text: draft.text,
    tableId: table.id,
    templateKey: withMenu ? "restaurant_proposition_carte" : templateKey,
  };
}

export async function runRestaurantCronJob(db: SupabaseClient, now = new Date()) {
  const bundle = await loadBundle(db, now);
  if ("missing" in bundle) return { ready: false, queued: 0, sent: 0, closed: 0 };
  if ("error" in bundle) return { ready: false, queued: 0, sent: 0, closed: 0 };
  const introSid = await approvedSid(RESTAURANT_INTRO_ENV);
  const carouselSid = await approvedSid(RESTAURANT_CAROUSEL_ENV);
  const menuSid = await approvedSid(RESTAURANT_CAROUSEL_MENU_ENV);
  const desks: DeskEvening[] = [];
  const detail = new Map<string, { booking: BookingRow; customer: CustomerRow | undefined; tables: TableRow[] }>();
  const allowlist = restaurantAllowlist();
  for (const booking of bundle.bookings) {
    if (booking.is_test || bundle.tables.some((table) => table.booking_id === booking.id && table.is_test)) continue;
    const allowed = restaurantBookingAllowed(booking.reference, allowlist);
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
      const sentParts = { intro: false, A: false, B: false };
      for (const message of bundle.messages) {
        if (message.booking_id !== booking.id || message.evening_date.slice(0, 10) !== date || message.status !== "envoye") continue;
        const part = restaurantPartFromKey(message.dedupe_key);
        if (part) sentParts[part] = true;
      }
      desks.push({
        bookingId: booking.id,
        eveningDate: date,
        timezone: placed.zone,
        choice: state?.choice || null,
        messageStatus: state?.message_status || "aucun",
        closed: Boolean(state?.closed_at),
        canWhatsapp: Boolean(customer?.phone) && !customer?.whatsapp_opt_out_at,
        partsSent: sentParts,
        allowed,
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
  const plan = planRestaurantCron(desks, now, { intro: Boolean(introSid), carousel: Boolean(carouselSid || menuSid) });
  let queued = 0;
  let sent = 0;
  let closed = 0;
  const introHeld = new Set<string>();
  for (const action of plan.sends) {
    const eveningKey = `${action.bookingId}:${action.eveningDate}`;
    if (action.part !== "intro" && introHeld.has(eveningKey)) continue;
    const row = detail.get(eveningKey);
    const test = Boolean(row?.booking.is_test) || Boolean(row?.tables.some((table) => table.is_test));
    const testPhone = restaurantTestPhone();
    const phone = outboundRestaurantPhone({
      test,
      clientPhone: row?.customer?.phone || null,
      testPhone,
    });
    if (!row?.customer || !phone) continue;
    if (!restaurantSendGate({ reference: row.booking.reference, test, phone, testPhone }, allowlist).ok) continue;
    const prior = bundle.messages.find(
      (message) => message.dedupe_key === restaurantDedupeKey(action.bookingId, action.eveningDate, action.part)
    );
    if (action.mode === "queue" && prior?.status === "en_file") {
      if (action.part === "intro") introHeld.add(eveningKey);
      continue;
    }
    const greeting = restaurantGreeting({
      sex: row.customer.sex,
      lastName: row.customer.last_name,
      firstName: row.customer.first_name,
    });
    const prepared = prepareRestaurantSend({
      action,
      row,
      restaurants: bundle.restaurants,
      greeting,
      introSid,
      carouselSid,
      menuSid,
    });
    if ("error" in prepared) {
      await rememberMessage(db, {
        bookingId: action.bookingId,
        customerId: row.customer.id,
        phone,
        eveningDate: action.eveningDate,
        part: action.part,
        body: prepared.error,
        status: "en_file",
        whatsappStatus: "queued",
        error: prepared.error,
        tableId: prepared.tableId,
        templateKey: prepared.templateKey,
      });
      if (action.part === "intro") introHeld.add(eveningKey);
      queued += 1;
      continue;
    }
    const decision = deliveryDecision({
      templateSid: prepared.contentSid,
      hasPhone: true,
      alreadySent: false,
    });
    if (decision !== "send") {
      await rememberMessage(db, {
        bookingId: action.bookingId,
        customerId: row.customer.id,
        phone,
        eveningDate: action.eveningDate,
        part: action.part,
        body: prepared.text,
        status: "en_file",
        whatsappStatus: "queued",
        error: "Modèle WhatsApp pas encore approuvé.",
        tableId: prepared.tableId,
        templateKey: prepared.templateKey,
      });
      if (action.part === "intro") introHeld.add(eveningKey);
      queued += 1;
      continue;
    }
    const result = await sendContentTemplate({
      phone,
      contentSid: prepared.contentSid,
      variables: prepared.variables,
    });
    if (!result.ok) {
      const waiting = result.reason === "not_configured";
      await rememberMessage(db, {
        bookingId: action.bookingId,
        customerId: row.customer.id,
        phone,
        eveningDate: action.eveningDate,
        part: action.part,
        body: prepared.text,
        status: waiting ? "en_file" : "echec",
        whatsappStatus: waiting ? "queued" : "failed",
        error: waiting ? "Modèle WhatsApp pas encore approuvé." : "WhatsApp n’a pas accepté le message.",
        tableId: prepared.tableId,
        templateKey: prepared.templateKey,
      });
      if (action.part === "intro") introHeld.add(eveningKey);
      if (waiting) queued += 1;
      continue;
    }
    await rememberMessage(db, {
      bookingId: action.bookingId,
      customerId: row.customer.id,
      phone,
      eveningDate: action.eveningDate,
      part: action.part,
      body: prepared.text,
      status: "envoye",
      whatsappStatus: "sent",
      sid: result.sid,
      tableId: prepared.tableId,
      templateKey: prepared.templateKey,
    });
    if (action.part === "A" || action.part === "B") {
      await db
        .from("crm_restaurant_tables")
        .update({ status: "proposee", updated_at: new Date().toISOString() })
        .eq("booking_id", action.bookingId)
        .eq("evening_date", action.eveningDate)
        .eq("seat", action.part)
        .eq("status", "reservee");
    }
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

async function noteRestaurantReply(
  db: SupabaseClient,
  input: { customerId: string; bookingId: string; date: string; phone: string; label: string; button: string; sid: string | null }
) {
  await db.from("crm_restaurant_messages").insert({
    booking_id: input.bookingId,
    evening_date: input.date,
    direction: "inbound",
    body: input.label,
    button: input.button,
    status: "recu",
    twilio_sid: input.sid,
  });
  await db.from("crm_whatsapp_messages").insert({
    customer_id: input.customerId,
    booking_id: input.bookingId,
    direction: "inbound",
    template_key: "restaurant_proposition",
    body: input.label,
    status: "received",
    twilio_sid: input.sid,
    phone: input.phone,
  });
}

export async function captureRestaurantChoice(db: SupabaseClient, params: URLSearchParams, now = new Date()) {
  const button = parseRestaurantButton({ body: params.get("Body"), buttonPayload: params.get("ButtonPayload") });
  if (!button) return { handled: false as const };
  const phone = phoneFromWhatsapp(params.get("From"));
  if (!phone) return { handled: false as const };
  if (!("legacy" in button) && button.tableId) {
    const probe = await db.from("crm_restaurant_tables").select("id, is_test").eq("id", button.tableId).maybeSingle();
    if ((probe.data as { is_test?: boolean } | null)?.is_test) {
      const allowed = restaurantTestPhone();
      if (!allowed || phone.replace(/\D/g, "") !== allowed.replace(/\D/g, "")) return { handled: false as const };
      return captureSeatReply(db, { id: "" }, button, params, phone);
    }
  }
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
  if ("legacy" in button) return captureLegacyChoice(db, customer, button.legacy, params, now);
  return captureSeatReply(db, customer, button, params, phone);
}

async function captureSeatReply(
  db: SupabaseClient,
  customer: { id: string },
  button: { reply: "accepte" | "refuse"; tableId: string | null },
  params: URLSearchParams,
  phone: string
) {
  let tableId = button.tableId;
  let bookingId = "";
  let date = "";
  let seat: TableSeat | "" = "";
  if (!tableId) {
    const replied = (params.get("OriginalRepliedMessageSid") || "").trim();
    if (!replied) return { handled: false as const };
    const message = await db
      .from("crm_restaurant_messages")
      .select("booking_id, evening_date, dedupe_key")
      .eq("twilio_sid", replied)
      .eq("direction", "outbound")
      .maybeSingle();
    const part = restaurantPartFromKey((message.data as { dedupe_key?: string } | null)?.dedupe_key);
    if (!message.data || (part !== "A" && part !== "B")) return { handled: false as const };
    bookingId = (message.data as { booking_id: string }).booking_id;
    date = String((message.data as { evening_date: string }).evening_date).slice(0, 10);
    seat = part;
    const found = await db
      .from("crm_restaurant_tables")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("evening_date", date)
      .eq("seat", seat)
      .maybeSingle();
    tableId = (found.data as { id?: string } | null)?.id || null;
  }
  if (!tableId) return { handled: false as const };
  const table = await db.from("crm_restaurant_tables").select("id, booking_id, evening_date, seat").eq("id", tableId).maybeSingle();
  const row = table.data as { id: string; booking_id: string; evening_date: string; seat: TableSeat } | null;
  if (!row || (row.seat !== "A" && row.seat !== "B")) return { handled: false as const };
  const owner = await bookingHead(db, row.booking_id);
  const testRow = Boolean((table.data as { is_test?: boolean } | null)?.is_test) || Boolean(owner?.is_test);
  if (testRow) {
    const allowed = restaurantTestPhone();
    if (!allowed || phone.replace(/\D/g, "") !== allowed.replace(/\D/g, "")) return { handled: false as const };
  } else if (owner?.customer_id !== customer.id) return { handled: false as const };
  const customerId = owner?.customer_id || customer.id;
  bookingId = row.booking_id;
  date = String(row.evening_date).slice(0, 10);
  seat = row.seat;
  const evening = await db
    .from("crm_restaurant_evenings")
    .select("closed_at")
    .eq("booking_id", bookingId)
    .eq("evening_date", date)
    .maybeSingle();
  const label = button.reply === "accepte" ? "J'accepte" : "Je refuse";
  const note = () =>
    noteRestaurantReply(db, {
      customerId,
      bookingId,
      date,
      phone,
      label,
      button: button.reply,
      sid: params.get("MessageSid"),
    });
  if ((evening.data as { closed_at?: string | null } | null)?.closed_at) {
    await note();
    return { handled: true as const, bookingId, date, choice: null };
  }
  // Hors liste d’essai (et hors test), le clic est journalisé mais ne change rien et rien ne part.
  if (!testRow && !restaurantBookingAllowed(owner?.reference)) {
    await note();
    return { handled: true as const, bookingId, date, choice: null };
  }
  if (button.reply === "accepte") {
    const saved = await saveBookingChoice(db, bookingId, { date, choice: seat, source: "whatsapp" });
    if ("error" in saved) return { handled: false as const };
  } else {
    const saved = await refuseRestaurantSeat(db, bookingId, { date, seat });
    if ("error" in saved) return { handled: false as const };
  }
  await note();
  if (button.reply === "accepte") {
    await sendRestaurantAcceptConfirmation(db, { bookingId, date, seat, tableId: row.id });
  }
  return { handled: true as const, bookingId, date, choice: button.reply === "accepte" ? seat : null };
}

type ConfirmationResult =
  | { ok: true; sid: string | null; skipped?: "deja_envoye" | "en_cours" }
  | { ok: false; reason: string };

/** Clé d’idempotence de la confirmation d’une table : une seule par table, quel que soit le canal du clic. */
export function restaurantConfirmationKey(bookingId: string, eveningDate: string, tableId: string) {
  return `restaurant:${bookingId}:${eveningDate}:confirmation:${tableId}`;
}

/**
 * Confirmation WhatsApp après « J’accepte » : le même texte que l’aperçu (restaurant, date, heure, 2 personnes,
 * lien de l’adresse), en message libre dans la fenêtre de 24 h ouverte par la réponse du client.
 * Liste d’essai obligatoire (le mode test écrit au numéro de test). Une table n’est confirmée qu’une fois :
 * la ligne `crm_restaurant_messages` est réservée avant l’envoi, puis mise à jour. Journal dans le dossier.
 */
export async function sendRestaurantAcceptConfirmation(
  db: SupabaseClient,
  input: { bookingId: string; date: string; seat: TableSeat; tableId: string; sender?: typeof sendWhatsappSession }
): Promise<ConfirmationResult> {
  const date = input.date.slice(0, 10);
  const head = await bookingHead(db, input.bookingId);
  if (!head) return { ok: false, reason: "Dossier introuvable." };
  const [customer, tables] = await Promise.all([
    db.from("crm_customers").select("id, first_name, last_name, sex, phone, whatsapp_opt_out_at").eq("id", head.customer_id).maybeSingle(),
    db.from("crm_restaurant_tables").select("id, seat, restaurant_id, time_local, status, is_test").eq("booking_id", input.bookingId).eq("evening_date", date),
  ]);
  const person = customer.data as CustomerRow | null;
  if (!person) return { ok: false, reason: "Client introuvable." };
  const seats = ((tables.data || []) as Pick<TableRow, "id" | "seat" | "restaurant_id" | "time_local" | "status" | "is_test">[]).filter(
    (row) => row.seat === "A" || row.seat === "B"
  );
  const mine = seats.find((row) => row.id === input.tableId && row.seat === input.seat);
  if (!mine) return { ok: false, reason: "Table introuvable." };
  const other = seats.find((row) => row.seat !== input.seat);
  const test = head.is_test || seats.some((row) => row.is_test);
  const testPhone = restaurantTestPhone();
  const phone = outboundRestaurantPhone({ test, clientPhone: test ? null : person.phone, testPhone });
  if (!phone) return { ok: false, reason: test ? "Numéro de test absent." : "Ce client n’a pas de numéro WhatsApp." };
  if (!test && person.whatsapp_opt_out_at) return { ok: false, reason: "Le client a coupé WhatsApp." };
  const gate = restaurantSendGate({ reference: head.reference, test, phone, testPhone });
  if (!gate.ok) return gate;
  const ids = [mine.restaurant_id, other?.restaurant_id].filter((id): id is string => Boolean(id));
  const places = ids.length ? await db.from("crm_restaurants").select("id, name").in("id", ids) : { data: [] as { id: string; name: string }[] };
  const nameOf = (id: string | null) => ((places.data || []) as { id: string; name: string }[]).find((row) => row.id === id)?.name || "";
  const restaurantName = nameOf(mine.restaurant_id);
  if (!restaurantName) return { ok: false, reason: "Restaurant introuvable." };
  const body = restaurantAcceptAck({
    greeting: restaurantGreeting({ sex: person.sex, lastName: person.last_name, firstName: person.first_name }),
    restaurant: restaurantName,
    eveningDate: date,
    timeLabel: clockLabel(mine.time_local) || restaurantDefaultClock(),
    other: other && other.status !== "annulee" ? nameOf(other.restaurant_id) : "",
    placeUrl: mine.restaurant_id ? restaurantPlaceLink(mine.restaurant_id) : "",
  });
  const key = restaurantConfirmationKey(input.bookingId, date, input.tableId);
  const existing = await db.from("crm_restaurant_messages").select("id, status").eq("dedupe_key", key).maybeSingle();
  const prior = existing.data as { id: string; status: string } | null;
  if (prior?.status === "envoye") return { ok: true, sid: null, skipped: "deja_envoye" };
  if (prior?.status === "en_file") return { ok: true, sid: null, skipped: "en_cours" };
  const claim = {
    booking_id: input.bookingId,
    evening_date: date,
    direction: "outbound",
    body,
    status: "en_file",
    dedupe_key: key,
    table_id: input.tableId,
    is_test: test,
  };
  const claimed = prior
    ? await db.from("crm_restaurant_messages").update(claim).eq("dedupe_key", key).eq("status", prior.status).select("id")
    : await db.from("crm_restaurant_messages").insert(claim).select("id");
  if (claimed.error && columnMissing(claimed.error.code)) {
    const { table_id, is_test, ...slim } = claim;
    void table_id;
    void is_test;
    const again = prior
      ? await db.from("crm_restaurant_messages").update(slim).eq("dedupe_key", key).eq("status", prior.status).select("id")
      : await db.from("crm_restaurant_messages").insert(slim).select("id");
    if (again.error || !(again.data || []).length) return { ok: true, sid: null, skipped: "en_cours" };
  } else if (claimed.error || !(claimed.data || []).length) {
    // 23505 ou ligne déjà prise par un autre passage : quelqu’un d’autre envoie.
    return { ok: true, sid: null, skipped: "en_cours" };
  }
  const to = sessionAddress(phone);
  if (!to) {
    await db.from("crm_restaurant_messages").update({ status: "echec" }).eq("dedupe_key", key);
    return { ok: false, reason: "Numéro WhatsApp invalide." };
  }
  const send = input.sender || sendWhatsappSession;
  const result = await send({ to, body });
  const status = result.ok ? "envoye" : "echec";
  await db
    .from("crm_restaurant_messages")
    .update({ status, twilio_sid: result.ok ? result.sid : null })
    .eq("dedupe_key", key);
  const mirror = {
    customer_id: person.id,
    booking_id: input.bookingId,
    direction: "outbound",
    template_key: "restaurant_confirmation",
    body,
    status: result.ok ? "sent" : "failed",
    twilio_sid: result.ok ? result.sid : null,
    dedupe_key: key,
    phone,
    error: result.ok ? null : "WhatsApp n’a pas accepté le message (fenêtre de 24 h fermée ?).",
  };
  const logged = await db.from("crm_whatsapp_messages").upsert(mirror, { onConflict: "dedupe_key" });
  if (logged.error && logged.error.code !== "23505") logDb("confirmation", logged.error);
  if (!result.ok) return { ok: false, reason: "WhatsApp n’a pas accepté le message." };
  return { ok: true, sid: result.sid };
}

async function captureLegacyChoice(
  db: SupabaseClient,
  customer: { id: string },
  choice: "A" | "B" | "aucune",
  params: URLSearchParams,
  now: Date
) {
  const bookings = await db
    .from("crm_bookings")
    .select("id, reference, customer_id, title, destination, start_date, end_date, timezone, status")
    .eq("customer_id", customer.id)
    .neq("status", "cancelled")
    .is("archived_at", null)
    .limit(20);
  if (bookings.error || !(bookings.data || []).length) return { handled: false as const };
  const allowlist = restaurantAllowlist();
  const allowedBookings = (bookings.data as BookingRow[]).filter((row) => restaurantBookingAllowed(row.reference, allowlist));
  if (!allowedBookings.length) return { handled: false as const };
  const ids = allowedBookings.map((row) => row.id);
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
  const bookingById = new Map(allowedBookings.map((row) => [row.id, row]));
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
  const phone = phoneFromWhatsapp(params.get("From")) || "";
  await noteRestaurantReply(db, {
    customerId: customer.id,
    bookingId: target.row.booking_id,
    date,
    phone,
    label,
    button: choice,
    sid: params.get("MessageSid"),
  });
  return { handled: true as const, bookingId: target.row.booking_id, date, choice };
}

/**
 * Envoi demandé par l’agence. Le cron de 16 h ne passe pas par ici. Le mode test n’écrit qu’au numéro de test.
 * Un dossier hors de `RESTAURANT_ALLOWED_BOOKINGS` est refusé avant toute lecture du reste.
 */
export async function sendRestaurantEvening(db: SupabaseClient, bookingId: string, date: string) {
  const head = await bookingHead(db, bookingId);
  if (!head) return { error: "Dossier introuvable." };
  if (!head.is_test && !restaurantBookingAllowed(head.reference)) return { error: RESTAURANT_ALLOWLIST_BLOCK };
  const bundle = await loadBundle(db, new Date());
  if ("missing" in bundle) return { error: "Le module restaurants n’est pas encore en place." };
  if ("error" in bundle) return { error: "Lecture impossible." };
  const booking = bundle.bookings.find((row) => row.id === bookingId);
  const customer = booking ? bundle.customers.get(booking.customer_id) : undefined;
  if (!booking || !customer) return { error: "Dossier introuvable." };
  const tables = bundle.tables.filter((row) => row.booking_id === bookingId && row.evening_date.slice(0, 10) === date);
  const test = Boolean(booking.is_test) || tables.some((row) => row.is_test);
  const testPhone = restaurantTestPhone();
  const phone = outboundRestaurantPhone({
    test,
    clientPhone: test ? null : customer.phone,
    testPhone,
  });
  if (!phone) return { error: test ? "Numéro de test absent. Renseignez RESTAURANT_TEST_PHONE." : "Ce client n’a pas de numéro WhatsApp." };
  const gate = restaurantSendGate({ reference: booking.reference, test, phone, testPhone });
  if (!gate.ok) return { error: gate.reason };
  const sent = { intro: false, A: false, B: false };
  for (const message of bundle.messages) {
    if (message.booking_id !== bookingId || message.evening_date.slice(0, 10) !== date || message.status !== "envoye") continue;
    const part = restaurantPartFromKey(message.dedupe_key);
    if (part) sent[part] = true;
  }
  if (sent.intro && sent.A && sent.B) return { error: "Déjà envoyé." };
  const houses = (["A", "B"] as const).map((seat) => {
    const table = tables.find((row) => row.seat === seat);
    const restaurant = table?.restaurant_id ? bundle.restaurants.get(table.restaurant_id) : undefined;
    return { seat, table, restaurant };
  });
  if (houses.some((house) => !house.restaurant || !house.table?.id)) return { error: "Choisissez les deux restaurants." };
  const gaps = houses.flatMap((house) =>
    ficheGaps({
      photoUrls: house.restaurant?.photoUrls || [],
      signaturePhotoUrl: house.restaurant?.signaturePhotoUrl || "",
      pitch: house.restaurant?.pitch || "",
      priceBand: house.restaurant?.priceBand || "",
      placeUrl: house.restaurant?.placeUrl || "",
      website: house.restaurant?.website || "",
    }).map((gap) => `${house.restaurant?.name || "Restaurant"} : ${gap}`)
  );
  if (gaps.length) return { error: `Fiche incomplète : ${gaps.join(", ")}.` };
  const introSid = await approvedSid(RESTAURANT_INTRO_ENV);
  const carouselSid = await approvedSid(RESTAURANT_CAROUSEL_ENV);
  const menuSid = await approvedSid(RESTAURANT_CAROUSEL_MENU_ENV);
  const greeting = restaurantGreeting({ sex: customer.sex, lastName: customer.last_name, firstName: customer.first_name });
  if (!introSid || !(carouselSid || menuSid)) {
    if (!test) return { error: "Le modèle WhatsApp n’est pas encore approuvé par Meta." };
    const text = restaurantIntroText({ greeting, eveningDate: date });
    const libre = await sendWhatsappSession({ to: sessionAddress(phone) || phone, body: text });
    if (!libre.ok) return { error: "Aperçu seul. Le modèle n’est pas approuvé et la fenêtre de 24 h n’est pas ouverte." };
    await rememberMessage(db, {
      bookingId,
      customerId: customer.id,
      phone,
      eveningDate: date,
      part: "intro",
      body: text,
      status: "envoye",
      whatsappStatus: "sent",
      sid: libre.sid,
      templateKey: "restaurant_selection",
      isTest: true,
    });
    return { ok: true as const, libre: true };
  }
  const detail = { booking, customer, tables };
  let sentCount = 0;
  for (const part of ["intro", "A", "B"] as const) {
    if (sent[part]) continue;
    const prepared = prepareRestaurantSend({
      action: { part, eveningDate: date },
      row: detail,
      restaurants: bundle.restaurants,
      greeting,
      introSid,
      carouselSid,
      menuSid,
    });
    if ("error" in prepared) return { error: prepared.error };
    const result = await sendContentTemplate({ phone, contentSid: prepared.contentSid, variables: prepared.variables });
    if (!result.ok) return { error: "WhatsApp n’a pas accepté le message." };
    await rememberMessage(db, {
      bookingId,
      customerId: customer.id,
      phone,
      eveningDate: date,
      part,
      body: prepared.text,
      status: "envoye",
      whatsappStatus: "sent",
      sid: result.sid,
      tableId: prepared.tableId,
      templateKey: prepared.templateKey,
      isTest: test,
    });
    if (part === "A" || part === "B") {
      await db
        .from("crm_restaurant_tables")
        .update({ status: "proposee", updated_at: new Date().toISOString() })
        .eq("booking_id", bookingId)
        .eq("evening_date", date)
        .eq("seat", part)
        .eq("status", "reservee");
    }
    sentCount += 1;
  }
  return { ok: true as const, sent: sentCount };
}
