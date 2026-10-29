import type { SupabaseClient } from "@supabase/supabase-js";
import {
  countdownUntilClose,
  eveningPhase,
  faceStatus,
  ficheGaps,
  sendBlockReason,
  type DeskFaceStatus,
  type DeskPhase,
} from "./restaurant-desk";
import { restaurantGreeting, restaurantIntroText, SALLE_CARD_BODY, PLAT_CARD_BODY, CARTE_CARD_BODY, restaurantCarouselBody } from "./restaurant-whatsapp";
import { cityPlaceKey } from "./city-names";
import { clockLabel, formatEveningFr, hotelForEvening, hotelsFromItems, localClock, restaurantDefaultClock, timezoneForStay, type RestaurantRecord, type TableSeat, type TableStatus } from "./restaurants";
import { mapRestaurant } from "./restaurants-db";
import { restaurantAllowlist, restaurantBookingAllowed } from "./restaurant-allowlist";

const MISSING = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

export type BoardFace = {
  seat: "A" | "B";
  restaurantId: string | null;
  name: string;
  time: string;
  photo: string | null;
  status: DeskFaceStatus;
  label: string;
  tone: "gris" | "encre" | "vert" | "orange" | "mute";
};

export type BoardRow = {
  bookingId: string;
  date: string;
  dateLabel: string;
  client: string;
  reference: string;
  city: string;
  hotel: string;
  countdown: string;
  closesAt: number | null;
  phase: DeskPhase;
  sendBlock: string | null;
  delivery: "modele" | "libre" | "apercu";
  /** Dossier de la liste d’essai `RESTAURANT_ALLOWED_BOOKINGS` (toujours vrai en mode test : numéro de test seul). */
  allowed: boolean;
  faces: BoardFace[];
  clicks: { at: string; label: string }[];
  suggestions: { id: string; name: string; photo: string | null; city: string; complete: boolean }[];
  previewIntro: string;
  previews: { seat: "A" | "B"; name: string; time: string; intro: string; cards: { kind: "salle" | "plat" | "carte"; title: string; body: string; photo: string | null }[] }[];
};

function toneOf(status: DeskFaceStatus): BoardFace["tone"] {
  if (status === "acceptee") return "vert";
  if (status === "a_annuler" || status === "refusee") return "orange";
  if (status === "envoyee") return "encre";
  if (status === "annulee") return "mute";
  return "gris";
}

function labelOf(status: DeskFaceStatus) {
  if (status === "a_choisir") return "À choisir";
  if (status === "proposee") return "Proposée";
  if (status === "envoyee") return "Envoyée";
  if (status === "acceptee") return "Acceptée";
  if (status === "refusee") return "Refusée";
  if (status === "a_annuler") return "À annuler";
  return "Annulée";
}

export async function loadRestaurantBoard(
  db: SupabaseClient,
  input: { test: boolean; templatesReady: boolean; testPhone: boolean; now?: Date }
) {
  const now = input.now || new Date();
  const from = new Date(now.getTime() - 2 * 86_400_000).toISOString().slice(0, 10);
  const to = new Date(now.getTime() + 2 * 86_400_000).toISOString().slice(0, 10);
  let bookings = await db
    .from("crm_bookings")
    .select("id, reference, customer_id, title, destination, start_date, end_date, timezone, status, is_test")
    .is("archived_at", null)
    .neq("status", "cancelled")
    .eq("is_test", input.test)
    .limit(80);
  if (bookings.error && MISSING.has(bookings.error.code || "")) {
    if (input.test) return { ready: false as const, rows: [] as BoardRow[], message: "Le mode test n’est pas encore en place. Migration à jouer." };
    const plain = await db
      .from("crm_bookings")
      .select("id, reference, customer_id, title, destination, start_date, end_date, timezone, status")
      .is("archived_at", null)
      .neq("status", "cancelled")
      .limit(80);
    if (plain.error) return { ready: false as const, rows: [] as BoardRow[], message: "Lecture impossible." };
    bookings = { ...plain, data: (plain.data || []).map((row) => ({ ...row, is_test: false })) } as unknown as typeof bookings;
  }
  if (bookings.error) return { ready: false as const, rows: [] as BoardRow[], message: "Lecture impossible." };
  const stays = (bookings.data || []) as {
    id: string;
    reference: string;
    customer_id: string;
    destination: string | null;
    start_date: string | null;
    end_date: string | null;
    timezone: string | null;
  }[];
  if (!stays.length) return { ready: true as const, rows: [] as BoardRow[], message: "" };
  const ids = stays.map((row) => row.id);
  const customerIds = [...new Set(stays.map((row) => row.customer_id))];
  const [people, items, tables, messages, catalog] = await Promise.all([
    db.from("crm_customers").select("id, first_name, last_name, sex, phone").in("id", customerIds),
    db.from("crm_booking_items").select("booking_id, kind, title, start_at, end_at, lifecycle, details").in("booking_id", ids).eq("kind", "hotel"),
    db.from("crm_restaurant_tables").select("*").in("booking_id", ids).gte("evening_date", from).lte("evening_date", to),
    db.from("crm_restaurant_messages").select("booking_id, evening_date, direction, body, button, status, dedupe_key, created_at").in("booking_id", ids).gte("evening_date", from).lte("evening_date", to),
    db.from("crm_restaurants").select("*").eq("status", "actif").limit(200),
  ]);
  if (tables.error && MISSING.has(tables.error.code || "")) {
    return { ready: false as const, rows: [] as BoardRow[], message: "Le module restaurants n’est pas encore en place." };
  }
  const restaurants = new Map<string, RestaurantRecord>();
  for (const row of (catalog.data || []) as Record<string, unknown>[]) {
    const restaurant = mapRestaurant(row);
    restaurants.set(restaurant.id, restaurant);
  }
  const customers = new Map(
    ((people.data || []) as { id: string; first_name: string | null; last_name: string | null; sex: string | null; phone: string | null }[]).map(
      (row) => [row.id, row]
    )
  );
  const rows: BoardRow[] = [];
  const allowlist = restaurantAllowlist();
  for (const stay of stays) {
    const allowed = input.test || restaurantBookingAllowed(stay.reference, allowlist);
    const hotels = hotelsFromItems((items.data || []).filter((row) => (row as { booking_id: string }).booking_id === stay.id) as Parameters<typeof hotelsFromItems>[0]);
    const customer = customers.get(stay.customer_id);
    const greeting = restaurantGreeting({ sex: customer?.sex, lastName: customer?.last_name, firstName: customer?.first_name });
    const dates = [now.toISOString().slice(0, 10)];
    for (const date of dates) {
      const placed = timezoneForStay({ stored: stay.timezone, hotelZone: hotelForEvening(hotels, date)?.zone, city: hotelForEvening(hotels, date)?.city || stay.destination, country: hotelForEvening(hotels, date)?.country });
      const local = placed.zone ? localClock(now, placed.zone)?.isoDate : date;
      if (placed.zone && local !== date && !input.test) continue;
      const mine = ((tables.data || []) as { booking_id: string; evening_date: string; seat: TableSeat; restaurant_id: string | null; time_local: string | null; status: TableStatus }[]).filter(
        (row) => row.booking_id === stay.id && String(row.evening_date).slice(0, 10) === date
      );
      const sent = new Set<string>();
      for (const message of (messages.data || []) as { booking_id: string; evening_date: string; status: string; dedupe_key: string | null }[]) {
        if (message.booking_id !== stay.id || String(message.evening_date).slice(0, 10) !== date || message.status !== "envoye") continue;
        const part = (message.dedupe_key || "").split(":").pop();
        if (part) sent.add(part);
      }
      const faces: BoardFace[] = (["A", "B"] as const).map((seat) => {
        const table = mine.find((row) => row.seat === seat);
        const restaurant = table?.restaurant_id ? restaurants.get(table.restaurant_id) : undefined;
        const other = mine.find((row) => row.seat !== seat);
        const status = faceStatus({
          hasRestaurant: Boolean(restaurant),
          status: table?.status || "a_reserver",
          sent: sent.has(seat),
          otherAccepted: other?.status === "choisie",
        });
        return {
          seat,
          restaurantId: restaurant?.id || null,
          name: restaurant?.name || "",
          time: table?.time_local ? clockLabel(table.time_local) : "",
          photo: restaurant?.photoUrls[0] || null,
          status,
          label: labelOf(status),
          tone: toneOf(status),
        };
      });
      const phase = eveningPhase(faces.map((face) => face.status));
      const gaps = faces.flatMap((face) => {
        const restaurant = face.restaurantId ? restaurants.get(face.restaurantId) : undefined;
        if (!restaurant) return [];
        return ficheGaps(restaurant).map((gap) => `${restaurant.name} : ${gap}`);
      });
      const clock = countdownUntilClose(now, date, placed.zone);
      const city = hotelForEvening(hotels, date)?.city || stay.destination || "";
      const cityKey = cityPlaceKey(city);
      const suggestions = [...restaurants.values()]
        .filter((row) => !cityKey || row.cityKey === cityKey)
        .slice(0, 12)
        .map((row) => ({
          id: row.id,
          name: row.name,
          photo: row.photoUrls[0] || null,
          city: row.city,
          complete: ficheGaps(row).length === 0,
        }));
      const clicks = ((messages.data || []) as { booking_id: string; evening_date: string; direction: string; body: string | null; button: string | null; created_at: string }[])
        .filter((row) => row.booking_id === stay.id && String(row.evening_date).slice(0, 10) === date && row.direction === "inbound")
        .map((row) => ({ at: new Date(row.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }), label: row.button || row.body || "Réponse" }));
      const previewIntro = restaurantIntroText({ greeting, eveningDate: date });
      const previews = faces
        .filter((face) => face.name)
        .map((face) => {
          const restaurant = face.restaurantId ? restaurants.get(face.restaurantId) : undefined;
          const intro = restaurantCarouselBody()
            .replace("{{1}}", greeting)
            .replace("{{2}}", face.name)
            .replace("{{3}}", face.time || restaurantDefaultClock());
          const cards: { kind: "salle" | "plat" | "carte"; title: string; body: string; photo: string | null }[] = [
            {
              kind: "salle" as const,
              title: "La salle",
              body: SALLE_CARD_BODY.replace("{{4}}", restaurant?.pitch || "une table tenue pour vous").replace("{{6}}", restaurant?.id || "exemple"),
              photo: restaurant?.photoUrls[0] || null,
            },
            {
              kind: "plat" as const,
              title: "Le plat signature",
              body: PLAT_CARD_BODY.replace("{{8}}", restaurant?.priceBand || "selon la carte"),
              photo: restaurant?.signaturePhotoUrl || null,
            },
          ];
          if (restaurant?.menuPhotoUrl) {
            cards.push({ kind: "carte", title: "La carte", body: CARTE_CARD_BODY, photo: restaurant.menuPhotoUrl });
          }
          return { seat: face.seat, name: face.name, time: face.time, intro, cards };
        });
      const block = sendBlockReason({
        gaps,
        templatesReady: input.templatesReady,
        test: input.test,
        testPhone: input.testPhone,
        alreadySent: sent.has("intro") && sent.has("A") && sent.has("B"),
        hasClientPhone: Boolean(customer?.phone),
        allowed,
      });
      rows.push({
        bookingId: stay.id,
        date,
        dateLabel: formatEveningFr(date),
        client: [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || "Client",
        reference: stay.reference,
        city,
        hotel: hotelForEvening(hotels, date)?.name || "",
        countdown: clock.label,
        closesAt: clock.at,
        phase,
        sendBlock: phase === "envoyer" ? block : null,
        delivery: input.templatesReady ? "modele" : input.test && input.testPhone ? "libre" : "apercu",
        allowed,
        faces,
        clicks,
        suggestions,
        previewIntro,
        previews,
      });
    }
  }
  return { ready: true as const, rows, message: "" };
}
