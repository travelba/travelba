import type { SupabaseClient } from "@supabase/supabase-js";
import { cityPlaceKey } from "./city-names";
import {
  applySeatReply,
  closedOn,
  eveningsOfStay,
  formatEveningFr,
  eveningAlerts,
  hotelForEvening,
  hotelsFromItems,
  isFormError,
  normalizeCatalog,
  parseAccount,
  parseCardLast4,
  parseChoice,
  parseCovers,
  parseFeeCents,
  parseLocalTime,
  parseTableStatus,
  rankRestaurants,
  RESTAURANT_ACCOUNT,
  RESTAURANT_COVERS,
  selectionBlock,
  suggestionWindow,
  TABLE_STATUS_LABELS,
  timezoneForStay,
  validTimeZone,
  type CatalogDraft,
  type EveningAlert,
  type RestaurantChoice,
  type RestaurantRecord,
  type TableSeat,
  type TableStatus,
} from "./restaurants";

const NOT_READY = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DbError = { code?: string | null; message?: string | null } | null;

export function restaurantsReady(error: DbError) {
  return !error || !NOT_READY.has(error.code || "");
}

function logDb(scope: string, error: DbError) {
  console.error(`[restaurants] ${scope}`, error?.code ?? "?");
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function mapRestaurant(row: Record<string, unknown>): RestaurantRecord {
  const closures = Array.isArray(row.annual_closures) ? row.annual_closures : [];
  return {
    id: text(row.id),
    name: text(row.name),
    city: text(row.city),
    cityKey: text(row.city_key) || cityPlaceKey(text(row.city)),
    address: text(row.address),
    lat: typeof row.lat === "number" ? row.lat : null,
    lng: typeof row.lng === "number" ? row.lng : null,
    phone: text(row.phone),
    website: text(row.website),
    categories: Array.isArray(row.categories) ? row.categories.map((item) => text(item)).filter(Boolean) : [],
    platform: (text(row.booking_platform) || null) as RestaurantRecord["platform"],
    bookingUrl: text(row.booking_url),
    bot: (text(row.bot_reservable) || "non") as RestaurantRecord["bot"],
    guaranteeCard: row.guarantee_card === true,
    cancelHours: typeof row.cancel_hours === "number" ? row.cancel_hours : null,
    cancelFeeCents: typeof row.cancel_fee_cents === "number" ? row.cancel_fee_cents : null,
    closedWeekdays: Array.isArray(row.closed_weekdays) ? row.closed_weekdays.map((item) => Number(item)).filter((item) => item >= 1 && item <= 7) : [],
    annualClosures: closures
      .map((item) => {
        const span = item as { from?: unknown; to?: unknown };
        return { from: text(span.from), to: text(span.to) };
      })
      .filter((span) => span.from && span.to),
    status: row.status === "exclu" ? "exclu" : "actif",
    exclusionReason: (text(row.exclusion_reason) || null) as RestaurantRecord["exclusionReason"],
    starred: row.starred === true,
    prepaidRequired: row.prepaid_required === true,
    note: text(row.internal_note),
    photoUrls: Array.isArray(row.photo_urls) ? row.photo_urls.map((item) => text(item)).filter(Boolean) : [],
    menuPhotoUrl: text(row.menu_photo_url),
    signaturePhotoUrl: text(row.signature_photo_url),
    pitch: text(row.concierge_pitch),
    priceBand: text(row.price_band),
    placeUrl: text(row.place_url),
  };
}

function toRow(draft: CatalogDraft) {
  return {
    name: draft.name,
    city: draft.city,
    city_key: draft.cityKey,
    address: draft.address || null,
    lat: draft.lat,
    lng: draft.lng,
    phone: draft.phone || null,
    website: draft.website || null,
    categories: draft.categories,
    booking_platform: draft.platform,
    booking_url: draft.bookingUrl || null,
    bot_reservable: draft.bot,
    guarantee_card: draft.guaranteeCard,
    cancel_hours: draft.cancelHours,
    cancel_fee_cents: draft.cancelFeeCents,
    closed_weekdays: draft.closedWeekdays,
    annual_closures: draft.annualClosures,
    status: draft.status,
    exclusion_reason: draft.exclusionReason,
    starred: draft.starred,
    prepaid_required: draft.prepaidRequired,
    internal_note: draft.note || null,
    photo_urls: draft.photoUrls,
    menu_photo_url: draft.menuPhotoUrl || null,
    signature_photo_url: draft.signaturePhotoUrl || null,
    concierge_pitch: draft.pitch || null,
    price_band: draft.priceBand || null,
    place_url: draft.placeUrl || null,
    updated_at: new Date().toISOString(),
  };
}

const VISUAL_KEYS = [
  "photos",
  "photo_urls",
  "photoUrls",
  "photo_carte",
  "menuPhoto",
  "menu_photo_url",
  "menuPhotoUrl",
  "photo_plat",
  "signaturePhoto",
  "signature_photo_url",
  "signaturePhotoUrl",
  "description",
  "pitch",
  "concierge_pitch",
  "fourchette",
  "prix",
  "priceBand",
  "price_band",
  "page",
  "lien_lieu",
  "placeUrl",
  "place_url",
];

function visualTouched(input: Record<string, unknown>) {
  return VISUAL_KEYS.some((key) => input[key] != null && input[key] !== "");
}

function rowWithoutVisual(row: ReturnType<typeof toRow>) {
  const { photo_urls, menu_photo_url, signature_photo_url, concierge_pitch, price_band, place_url, ...rest } = row;
  void photo_urls;
  void menu_photo_url;
  void signature_photo_url;
  void concierge_pitch;
  void price_band;
  void place_url;
  return rest;
}

export async function listRestaurants(db: SupabaseClient, query = "") {
  let request = db.from("crm_restaurants").select("*").order("city").order("name").limit(200);
  const clean = query.replace(/[%_,()*'"]/g, "").trim().slice(0, 40);
  if (clean) request = request.or(`name.ilike.%${clean}%,city.ilike.%${clean}%`);
  const { data, error } = await request;
  if (error) {
    logDb("liste", error);
    if (!restaurantsReady(error)) return { ready: false as const, rows: [] as RestaurantRecord[] };
    return { ready: false as const, rows: [] as RestaurantRecord[], error: "Lecture impossible." };
  }
  return { ready: true as const, rows: ((data || []) as Record<string, unknown>[]).map(mapRestaurant) };
}

export async function saveRestaurant(db: SupabaseClient, input: Record<string, unknown>, id?: string) {
  let existing: CatalogDraft | undefined;
  if (id) {
    if (!UUID.test(id)) return { error: "Restaurant invalide." };
    const { data, error } = await db.from("crm_restaurants").select("*").eq("id", id).maybeSingle();
    if (error) {
      logDb("lire", error);
      if (!restaurantsReady(error)) return { error: "Le module restaurants n’est pas encore en place." };
      return { error: "Restaurant introuvable." };
    }
    if (!data) return { error: "Restaurant introuvable." };
    existing = mapRestaurant(data as Record<string, unknown>);
  }
  const draft = normalizeCatalog(input, existing);
  if (isFormError(draft)) return draft;
  const row = toRow(draft);
  let write = id
    ? await db.from("crm_restaurants").update(row).eq("id", id).select("id").single()
    : await db.from("crm_restaurants").insert(row).select("id").single();
  if (write.error && (write.error.code === "42703" || write.error.code === "PGRST204")) {
    if (visualTouched(input)) return { error: "Le catalogue visuel n’est pas encore en place." };
    const slim = rowWithoutVisual(row);
    write = id
      ? await db.from("crm_restaurants").update(slim).eq("id", id).select("id").single()
      : await db.from("crm_restaurants").insert(slim).select("id").single();
  }
  if (write.error || !write.data) {
    logDb("écrire", write.error);
    if (!restaurantsReady(write.error)) return { error: "Le module restaurants n’est pas encore en place." };
    return { error: "Enregistrement impossible." };
  }
  return { id: text((write.data as { id: string }).id), status: draft.status, exclusionReason: draft.exclusionReason };
}

export async function deleteRestaurant(db: SupabaseClient, id: string) {
  if (!UUID.test(id)) return { error: "Restaurant invalide." };
  const { error } = await db.from("crm_restaurants").delete().eq("id", id);
  if (error) {
    logDb("retirer", error);
    if (error.code === "23503") return { error: "Ce restaurant a des tables. Excluez-le." };
    if (!restaurantsReady(error)) return { error: "Le module restaurants n’est pas encore en place." };
    return { error: "Retrait impossible." };
  }
  return { ok: true as const };
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

type TableRow = {
  id: string;
  booking_id: string;
  evening_date: string;
  seat: TableSeat;
  restaurant_id: string | null;
  time_local: string | null;
  covers: number;
  confirmation_ref: string | null;
  account_email: string | null;
  card_last4: string | null;
  status: TableStatus;
  cancel_fee_cents: number | null;
  cancelled_at: string | null;
};

type EveningRow = {
  booking_id: string;
  evening_date: string;
  choice: RestaurantChoice | null;
  chosen_at: string | null;
  choice_source: "whatsapp" | "manuel" | null;
  message_status: "aucun" | "en_file" | "envoye" | "echec";
  message_sent_at: string | null;
  closed_at: string | null;
};

export type DeskTable = {
  id: string | null;
  seat: TableSeat;
  restaurantId: string | null;
  time: string | null;
  covers: number;
  confirmation: string | null;
  account: string;
  cardLast4: string | null;
  status: TableStatus;
  statusLabel: string;
  cancelFeeCents: number | null;
  cancelledAt: string | null;
  restaurantClosed: boolean;
};

export type DeskSuggestion = {
  id: string;
  name: string;
  categories: string[];
  distanceKm: number | null;
  featured: boolean;
  blocked: string | null;
};

export type DeskEveningView = {
  date: string;
  label: string;
  hotelName: string;
  city: string;
  timezone: string | null;
  choice: RestaurantChoice | null;
  choiceSource: "whatsapp" | "manuel" | null;
  messageStatus: EveningRow["message_status"];
  messageSentAt: string | null;
  closed: boolean;
  tables: DeskTable[];
  suggestions: DeskSuggestion[];
  alerts: EveningAlert[];
};

export type BookingRestaurantView = {
  ready: true;
  reference: string;
  timezone: string | null;
  timezoneSource: "dossier" | "hotel" | "ville" | null;
  coversDefault: number;
  hasPhone: boolean;
  hotels: { name: string; city: string }[];
  evenings: DeskEveningView[];
  messages: {
    id: string;
    eveningDate: string;
    direction: "outbound" | "inbound";
    body: string;
    button: string | null;
    status: string;
    createdAt: string;
  }[];
};

async function loadBooking(db: SupabaseClient, bookingId: string) {
  const { data, error } = await db
    .from("crm_bookings")
    .select("id, reference, customer_id, title, destination, start_date, end_date, timezone, status")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) {
    logDb("dossier", error);
    if (!restaurantsReady(error)) return { missing: true as const };
    return { error: "Dossier introuvable." };
  }
  if (!data) return { error: "Dossier introuvable." };
  return { booking: data as BookingRow };
}

export async function loadBookingRestaurants(db: SupabaseClient, bookingId: string, now = new Date()): Promise<
  BookingRestaurantView | { ready: false; message: string }
> {
  if (!UUID.test(bookingId)) return { ready: false, message: "Dossier invalide." };
  const opened = await loadBooking(db, bookingId);
  if ("missing" in opened) return { ready: false, message: "Le module restaurants n’est pas encore en place." };
  if ("error" in opened) return { ready: false, message: opened.error || "Dossier introuvable." };
  const booking = opened.booking;
  const [items, customer, tables, evenings, messages] = await Promise.all([
    db.from("crm_booking_items").select("kind, title, start_at, end_at, lifecycle, details").eq("booking_id", bookingId),
    db.from("crm_customers").select("id, phone, whatsapp_opt_out_at").eq("id", booking.customer_id).maybeSingle(),
    db.from("crm_restaurant_tables").select("*").eq("booking_id", bookingId),
    db.from("crm_restaurant_evenings").select("*").eq("booking_id", bookingId),
    db.from("crm_restaurant_messages").select("id, evening_date, direction, body, button, status, created_at").eq("booking_id", bookingId).order("created_at", { ascending: true }).limit(80),
  ]);
  for (const result of [tables, evenings, messages]) {
    if (result.error && !restaurantsReady(result.error)) {
      return { ready: false, message: "Le module restaurants n’est pas encore en place." };
    }
  }
  const hotels = hotelsFromItems((items.data || []) as Parameters<typeof hotelsFromItems>[0]);
  const dates = eveningsOfStay(hotels, booking.start_date, booking.end_date);
  const keys = [...new Set(hotels.map((hotel) => cityPlaceKey(hotel.city)).filter(Boolean))];
  if (booking.destination) keys.push(cityPlaceKey(booking.destination));
  const catalog = keys.length
    ? await db.from("crm_restaurants").select("*").in("city_key", [...new Set(keys)]).eq("status", "actif").limit(400)
    : { data: [], error: null };
  if (catalog.error && !restaurantsReady(catalog.error)) {
    return { ready: false, message: "Le module restaurants n’est pas encore en place." };
  }
  const restaurants = ((catalog.data || []) as Record<string, unknown>[]).map(mapRestaurant);
  const byId = new Map(restaurants.map((row) => [row.id, row]));
  const tableRows = (tables.data || []) as TableRow[];
  const eveningRows = new Map(((evenings.data || []) as EveningRow[]).map((row) => [row.evening_date, row]));
  const coversDefault = RESTAURANT_COVERS;
  const hasPhone = Boolean(text((customer.data as { phone?: string } | null)?.phone));
  const views: DeskEveningView[] = dates.map((date) => {
    const hotel = hotelForEvening(hotels, date);
    const zone = timezoneForStay({
      stored: booking.timezone,
      hotelZone: hotel?.zone,
      city: hotel?.city || booking.destination,
      country: hotel?.country,
    });
    const ranked = rankRestaurants(restaurants, {
      city: hotel?.city || booking.destination || "",
      lat: hotel?.lat ?? null,
      lng: hotel?.lng ?? null,
    });
    const mine = tableRows.filter((row) => row.evening_date === date);
    const selected = mine.map((row) => row.restaurant_id).filter((id): id is string => Boolean(id));
    const suggestions = suggestionWindow(ranked, selected);
    const seats: TableSeat[] = ["A", "B"];
    const deskTables = seats.map((seat) => {
      const row = mine.find((item) => item.seat === seat);
      const restaurant = row?.restaurant_id ? byId.get(row.restaurant_id) : undefined;
      return {
        id: row?.id || null,
        seat,
        restaurantId: row?.restaurant_id || null,
        time: row?.time_local ? row.time_local.slice(0, 5) : null,
        covers: RESTAURANT_COVERS,
        confirmation: row?.confirmation_ref || null,
        account: row?.account_email || RESTAURANT_ACCOUNT,
        cardLast4: row?.card_last4 || null,
        status: row?.status || "a_reserver",
        statusLabel: TABLE_STATUS_LABELS[row?.status || "a_reserver"],
        cancelFeeCents: row?.cancel_fee_cents ?? null,
        cancelledAt: row?.cancelled_at || null,
        restaurantClosed: restaurant ? closedOn(restaurant, date) : false,
      };
    });
    const state = eveningRows.get(date);
    return {
      date,
      label: formatEveningFr(date),
      hotelName: hotel?.name || "",
      city: hotel?.city || booking.destination || "",
      timezone: zone.zone,
      choice: state?.choice || null,
      choiceSource: state?.choice_source || null,
      messageStatus: state?.message_status || "aucun",
      messageSentAt: state?.message_sent_at || null,
      closed: Boolean(state?.closed_at),
      tables: deskTables,
      suggestions,
      alerts: eveningAlerts({
        now,
        eveningDate: date,
        timezone: zone.zone,
        hasPhone,
        tables: deskTables.map((table) => ({
          status: table.status,
          restaurantClosed: table.restaurantClosed,
          cancelledAt: table.cancelledAt,
        })),
      }),
    };
  });
  return {
    ready: true,
    reference: booking.reference,
    timezone: booking.timezone,
    timezoneSource: timezoneForStay({
      stored: booking.timezone,
      hotelZone: hotels[0]?.zone,
      city: hotels[0]?.city || booking.destination,
      country: hotels[0]?.country,
    }).source,
    coversDefault,
    hasPhone,
    hotels: hotels.map((hotel) => ({ name: hotel.name, city: hotel.city })),
    evenings: views,
    messages: ((messages.data || []) as Record<string, unknown>[]).map((row) => ({
      id: text(row.id),
      eveningDate: text(row.evening_date).slice(0, 10),
      direction: row.direction === "inbound" ? "inbound" : "outbound",
      body: text(row.body),
      button: text(row.button) || null,
      status: text(row.status),
      createdAt: text(row.created_at),
    })),
  };
}

export async function saveBookingTable(
  db: SupabaseClient,
  bookingId: string,
  input: Record<string, unknown>
) {
  const opened = await loadBooking(db, bookingId);
  if ("missing" in opened) return { error: "Le module restaurants n’est pas encore en place." };
  if ("error" in opened) return opened;
  const date = text(input.date).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Date invalide." };
  const seat = text(input.seat).toUpperCase();
  if (seat !== "A" && seat !== "B") return { error: "Table A ou B." };
  const covers = parseCovers(input.covers);
  if (isFormError(covers)) return covers;
  const time = parseLocalTime(input.time);
  if (isFormError(time)) return time;
  const account = parseAccount(input.account);
  if (isFormError(account)) return account;
  const last4 = parseCardLast4(input.cardLast4 ?? input.garantie);
  if (!last4.ok) return { error: last4.error };
  const status = parseTableStatus(text(input.status) || "a_reserver");
  if (!status) return { error: "Statut inconnu." };
  const restaurantId = text(input.restaurantId);
  if (restaurantId) {
    if (!UUID.test(restaurantId)) return { error: "Restaurant invalide." };
    const { data, error } = await db.from("crm_restaurants").select("*").eq("id", restaurantId).maybeSingle();
    if (error || !data) return { error: "Restaurant introuvable." };
    const restaurant = mapRestaurant(data as Record<string, unknown>);
    const blocked = selectionBlock(restaurant);
    if (blocked) return { error: blocked };
    const items = await db.from("crm_booking_items").select("kind, title, start_at, end_at, lifecycle, details").eq("booking_id", bookingId).eq("kind", "hotel");
    const hotel = hotelForEvening(hotelsFromItems((items.data || []) as Parameters<typeof hotelsFromItems>[0]), date);
    if (hotel?.city && cityPlaceKey(hotel.city) !== restaurant.cityKey) {
      return { error: "Ce restaurant n’est pas dans la ville de l’hôtel." };
    }
  } else if (status !== "a_reserver") {
    return { error: "Choisissez un restaurant." };
  }
  const confirmation = text(input.confirmation).slice(0, 80) || null;
  const row = {
    booking_id: bookingId,
    evening_date: date,
    seat,
    restaurant_id: restaurantId || null,
    time_local: time,
    covers,
    confirmation_ref: confirmation,
    account_email: account,
    card_last4: last4.last4,
    status,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from("crm_restaurant_tables").upsert(row, { onConflict: "booking_id,evening_date,seat" });
  if (error) {
    logDb("table", error);
    if (!restaurantsReady(error)) return { error: "Le module restaurants n’est pas encore en place." };
    return { error: "Table non enregistrée." };
  }
  return { ok: true as const };
}

export async function saveBookingChoice(
  db: SupabaseClient,
  bookingId: string,
  input: { date: string; choice: RestaurantChoice; source: "manuel" | "whatsapp" }
) {
  const date = input.date.slice(0, 10);
  const now = new Date().toISOString();
  const existing = await db
    .from("crm_restaurant_evenings")
    .select("closed_at")
    .eq("booking_id", bookingId)
    .eq("evening_date", date)
    .maybeSingle();
  if (existing.error && !restaurantsReady(existing.error)) {
    return { error: "Le module restaurants n’est pas encore en place." };
  }
  const { error } = await db.from("crm_restaurant_evenings").upsert(
    {
      booking_id: bookingId,
      evening_date: date,
      choice: input.choice,
      chosen_at: now,
      choice_source: input.source,
    },
    { onConflict: "booking_id,evening_date" }
  );
  if (error) {
    logDb("choix", error);
    return { error: "Choix non enregistré." };
  }
  const closed = Boolean((existing.data as { closed_at?: string | null } | null)?.closed_at);
  if (!closed && (input.choice === "A" || input.choice === "B")) {
    const tables = await db
      .from("crm_restaurant_tables")
      .select("seat, status")
      .eq("booking_id", bookingId)
      .eq("evening_date", date);
    if (!tables.error) {
      const current = ((tables.data || []) as { seat: TableSeat; status: TableStatus }[]).filter(
        (row) => row.seat === "A" || row.seat === "B"
      );
      const next = applySeatReply(current, input.choice, "accepte");
      for (const table of next.tables) {
        const before = current.find((row) => row.seat === table.seat);
        if (!before || before.status === table.status) continue;
        await db
          .from("crm_restaurant_tables")
          .update({ status: table.status, updated_at: now })
          .eq("booking_id", bookingId)
          .eq("evening_date", date)
          .eq("seat", table.seat);
      }
    }
  }
  return { ok: true as const, closed };
}

/** « Je refuse » ne choisit pas l’autre table. Les deux refus deviennent « aucune ». */
export async function refuseRestaurantSeat(
  db: SupabaseClient,
  bookingId: string,
  input: { date: string; seat: TableSeat }
) {
  const date = input.date.slice(0, 10);
  const evening = await db
    .from("crm_restaurant_evenings")
    .select("closed_at")
    .eq("booking_id", bookingId)
    .eq("evening_date", date)
    .maybeSingle();
  if (evening.error && !restaurantsReady(evening.error)) {
    return { error: "Le module restaurants n’est pas encore en place." };
  }
  if ((evening.data as { closed_at?: string | null } | null)?.closed_at) return { ok: true as const, closed: true };
  const tables = await db
    .from("crm_restaurant_tables")
    .select("seat, status")
    .eq("booking_id", bookingId)
    .eq("evening_date", date);
  if (tables.error) {
    logDb("refus", tables.error);
    return { error: "Table introuvable." };
  }
  const current = ((tables.data || []) as { seat: TableSeat; status: TableStatus }[]).filter(
    (row) => row.seat === "A" || row.seat === "B"
  );
  const next = applySeatReply(current, input.seat, "refuse");
  const now = new Date().toISOString();
  for (const table of next.tables) {
    const before = current.find((row) => row.seat === table.seat);
    if (!before || before.status === table.status) continue;
    await db
      .from("crm_restaurant_tables")
      .update({ status: table.status, updated_at: now })
      .eq("booking_id", bookingId)
      .eq("evening_date", date)
      .eq("seat", table.seat);
  }
  if (next.choice === "aucune") {
    await db.from("crm_restaurant_evenings").upsert(
      {
        booking_id: bookingId,
        evening_date: date,
        choice: "aucune",
        chosen_at: now,
        choice_source: "whatsapp",
      },
      { onConflict: "booking_id,evening_date" }
    );
  }
  return { ok: true as const, closed: false, choice: next.choice };
}

export async function cancelBookingTable(
  db: SupabaseClient,
  bookingId: string,
  input: Record<string, unknown>
) {
  const date = text(input.date).slice(0, 10);
  const seat = text(input.seat).toUpperCase();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (seat !== "A" && seat !== "B")) return { error: "Table introuvable." };
  const fee = parseFeeCents(input.frais ?? input.fraisEuros ?? input.cancelFeeEuros);
  if (isFormError(fee)) return fee;
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("crm_restaurant_tables")
    .update({
      status: "annulee",
      cancelled_at: now,
      cancel_fee_cents: fee,
      updated_at: now,
    })
    .eq("booking_id", bookingId)
    .eq("evening_date", date)
    .eq("seat", seat)
    .select("id")
    .maybeSingle();
  if (error) {
    logDb("annuler", error);
    if (!restaurantsReady(error)) return { error: "Le module restaurants n’est pas encore en place." };
    return { error: "Annulation non enregistrée." };
  }
  if (!data) return { error: "Table introuvable." };
  return { ok: true as const, cancelledAt: now, cancelFeeCents: fee };
}

export async function saveBookingTimezone(db: SupabaseClient, bookingId: string, raw: unknown) {
  const value = raw == null || raw === "" ? null : validTimeZone(text(raw));
  if (raw && !value) return { error: "Fuseau invalide." };
  const { error } = await db.from("crm_bookings").update({ timezone: value }).eq("id", bookingId);
  if (error) {
    logDb("fuseau", error);
    if (!restaurantsReady(error)) return { error: "Le module restaurants n’est pas encore en place." };
    return { error: "Fuseau non enregistré." };
  }
  return { ok: true as const, timezone: value };
}

export function choiceFromBody(raw: unknown) {
  return parseChoice(raw);
}
