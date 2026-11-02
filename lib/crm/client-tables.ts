import { createServiceClient } from "@/lib/supabase/admin";
import { clockLabel, formatEveningFr, type TableSeat, type TableStatus } from "./restaurants";
import { restaurantsReady } from "./restaurants-db";

/** Ce que le client voit. Les tables pas encore envoyées restent cachées. */
export type ClientTableStatus = "proposee" | "acceptee" | "refusee" | "a_annuler" | "annulee";

const LABEL: Record<ClientTableStatus, string> = {
  proposee: "Proposée",
  acceptee: "Acceptée",
  refusee: "Refusée",
  a_annuler: "À annuler",
  annulee: "Annulée",
};

export function clientTableLabel(status: ClientTableStatus) {
  return LABEL[status];
}

/** Même lecture que le bureau : proposée seulement une fois le message parti (`proposee`). */
export function clientTableFace(input: { status: TableStatus; otherAccepted: boolean }): ClientTableStatus | null {
  if (input.status === "proposee") return "proposee";
  if (input.status === "choisie") return "acceptee";
  if (input.status === "annulee") return "annulee";
  if (input.status === "a_annuler") return input.otherAccepted ? "a_annuler" : "refusee";
  return null;
}

/** Accepter et Refuser restent possibles tant que la table est proposée et que 18 h n’est pas passé. */
export function clientTableCanReply(status: ClientTableStatus, closed: boolean) {
  return status === "proposee" && !closed;
}

export type ClientTableCard = {
  id: string;
  date: string;
  seat: TableSeat;
  name: string;
  time: string;
  address: string;
  href: string;
  photo: string | null;
  pitch: string;
  price: string;
  status: ClientTableStatus;
  label: string;
  canReply: boolean;
};

export type ClientEveningTables = {
  date: string;
  label: string;
  tables: ClientTableCard[];
};

export type ClientTableSource = {
  id: string;
  date: string;
  seat: TableSeat;
  time: string | null;
  status: TableStatus;
  name: string;
  address: string;
  href: string;
  photo: string | null;
  pitch: string;
  price: string;
  closed: boolean;
};

export function presentClientTables(rows: ClientTableSource[]): ClientEveningTables[] {
  const byDate = new Map<string, ClientTableSource[]>();
  for (const row of rows) {
    const list = byDate.get(row.date) || [];
    list.push(row);
    byDate.set(row.date, list);
  }
  const evenings: ClientEveningTables[] = [];
  for (const [date, list] of [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const otherAccepted = list.some((row) => row.status === "choisie");
    const tables: ClientTableCard[] = [];
    for (const row of [...list].sort((a, b) => a.seat.localeCompare(b.seat))) {
      const status = clientTableFace({ status: row.status, otherAccepted });
      if (!status) continue;
      tables.push({
        id: row.id,
        date,
        seat: row.seat,
        name: row.name.trim() || "Restaurant",
        time: clockLabel(row.time),
        address: row.address.trim(),
        href: row.href.startsWith("https://") ? row.href : "",
        photo: row.photo && (row.photo.startsWith("https://") || row.photo.startsWith("/")) ? row.photo : null,
        pitch: row.pitch.trim(),
        price: row.price.trim(),
        status,
        label: clientTableLabel(status),
        canReply: clientTableCanReply(status, row.closed),
      });
    }
    if (tables.length) {
      const raw = formatEveningFr(date);
      evenings.push({ date, label: raw ? raw.charAt(0).toLocaleUpperCase("fr-FR") + raw.slice(1) : date, tables });
    }
  }
  return evenings;
}

type TableRow = {
  id: string;
  evening_date: string;
  seat: string;
  time_local: string | null;
  status: string;
  restaurant_id: string | null;
};

type PlaceRow = {
  id: string;
  name?: string | null;
  address?: string | null;
  website?: string | null;
  place_url?: string | null;
  photo_urls?: string[] | null;
  concierge_pitch?: string | null;
  price_band?: string | null;
};

function httpsOrEmpty(value: string | null | undefined) {
  const link = (value || "").trim();
  return link.startsWith("https://") ? link : "";
}

/**
 * Tables déjà proposées au titulaire. Lecture service role : la RLS restaurants est réservée à l’agence.
 * Pas de carte, pas d’e-mail de réservation, pas de note interne.
 */
export async function loadClientRestaurantEvenings(bookingId: string): Promise<ClientEveningTables[]> {
  try {
    const admin = createServiceClient();
    const tables = await admin
      .from("crm_restaurant_tables")
      .select("id, evening_date, seat, time_local, status, restaurant_id")
      .eq("booking_id", bookingId)
      .in("status", ["proposee", "choisie", "a_annuler", "annulee"]);
    if (tables.error) {
      if (!restaurantsReady(tables.error)) return [];
      return [];
    }
    const rows = (tables.data || []) as TableRow[];
    if (!rows.length) return [];
    const ids = [...new Set(rows.map((row) => row.restaurant_id).filter((id): id is string => Boolean(id)))];
    const places = new Map<string, PlaceRow>();
    if (ids.length) {
      const visual = await admin
        .from("crm_restaurants")
        .select("id, name, address, website, place_url, photo_urls, concierge_pitch, price_band")
        .in("id", ids);
      const plain =
        visual.error && restaurantsReady(visual.error) === false
          ? await admin.from("crm_restaurants").select("id, name, address, website").in("id", ids)
          : visual;
      if (!plain.error) {
        for (const place of (plain.data || []) as PlaceRow[]) places.set(place.id, place);
      }
    }
    const evenings = await admin
      .from("crm_restaurant_evenings")
      .select("evening_date, closed_at")
      .eq("booking_id", bookingId);
    const closed = new Set(
      ((evenings.data || []) as { evening_date: string; closed_at: string | null }[])
        .filter((row) => row.closed_at)
        .map((row) => String(row.evening_date).slice(0, 10))
    );
    return presentClientTables(
      rows
        .filter((row) => row.seat === "A" || row.seat === "B")
        .map((row) => {
          const place = row.restaurant_id ? places.get(row.restaurant_id) : undefined;
          const photo = Array.isArray(place?.photo_urls) ? place.photo_urls.find((url) => url.startsWith("https://")) || null : null;
          return {
            id: row.id,
            date: String(row.evening_date).slice(0, 10),
            seat: row.seat as TableSeat,
            time: row.time_local,
            status: row.status as TableStatus,
            name: place?.name || "",
            address: place?.address || "",
            href: httpsOrEmpty(place?.place_url) || httpsOrEmpty(place?.website),
            photo,
            pitch: place?.concierge_pitch || "",
            price: place?.price_band || "",
            closed: closed.has(String(row.evening_date).slice(0, 10)),
          };
        })
    );
  } catch {
    return [];
  }
}
