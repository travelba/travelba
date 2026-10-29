import type { SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { createServiceClient } from "@/lib/supabase/admin";
import { McpWriteError } from "./mcp-write";
import {
  cancelBookingTable,
  listRestaurants,
  mapRestaurant,
  saveBookingTable,
  saveRestaurant,
} from "./restaurants-db";
import { listInStay } from "./restaurants-run";
import { parseTableStatus } from "./restaurants";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function client(admin?: SupabaseClient) {
  if (admin) return admin;
  if (typeof globalThis.WebSocket !== "function") {
    globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket;
  }
  return createServiceClient();
}

async function resolveBooking(db: SupabaseClient, input: Record<string, unknown>) {
  const id = typeof input.dossier_id === "string" ? input.dossier_id.trim() : "";
  const reference = typeof input.reference === "string" ? input.reference.trim() : "";
  if (!id && !reference) throw new McpWriteError("Indiquez le dossier.");
  if (id && !UUID.test(id)) throw new McpWriteError("Dossier invalide.");
  let query = db.from("crm_bookings").select("id, reference");
  query = id ? query.eq("id", id) : query.eq("reference", reference);
  const { data, error } = await query.limit(2);
  if (error || !data?.length) throw new McpWriteError("Dossier introuvable.");
  if (data.length > 1) throw new McpWriteError("Plusieurs dossiers portent cette référence. Indiquez l’identifiant.");
  return data[0] as { id: string; reference: string };
}

function presentRestaurant(row: ReturnType<typeof mapRestaurant>) {
  return {
    restaurant_id: row.id,
    nom: row.name,
    ville: row.city,
    adresse: row.address,
    lat: row.lat,
    lng: row.lng,
    telephone: row.phone,
    site: row.website,
    categories: row.categories,
    plateforme: row.platform,
    lien: row.bookingUrl,
    bot: row.bot,
    garantie: row.guaranteeCard,
    annulation_heures: row.cancelHours,
    annulation_frais: row.cancelFeeCents == null ? null : row.cancelFeeCents / 100,
    fermeture_jours: row.closedWeekdays,
    fermetures: row.annualClosures,
    statut: row.status,
    motif: row.exclusionReason,
    etoile: row.starred,
    prepaiement: row.prepaidRequired,
    note: row.note,
  };
}

const CATALOG_WRITE = [
  "nom",
  "adresse",
  "lat",
  "lng",
  "telephone",
  "site",
  "categories",
  "plateforme",
  "lien",
  "bot",
  "garantie",
  "annulation_heures",
  "annulation_frais",
  "fermeture_jours",
  "fermetures",
  "statut",
  "motif",
  "etoile",
  "prepaiement",
  "note",
];

export async function catalogueRestaurants(input: Record<string, unknown>, admin?: SupabaseClient) {
  const db = client(admin);
  const id = typeof input.restaurant_id === "string" ? input.restaurant_id.trim() : "";
  const writing = CATALOG_WRITE.some((key) => input[key] != null && input[key] !== "") || (Boolean(id) && input.ville != null);
  if (writing || (typeof input.nom === "string" && input.nom.trim())) {
    const saved = await saveRestaurant(db, input, id || undefined);
    if ("error" in saved) throw new McpWriteError(saved.error || "Enregistrement impossible.");
    return saved;
  }
  if (id) {
    if (!UUID.test(id)) throw new McpWriteError("Restaurant invalide.");
    const { data, error } = await db.from("crm_restaurants").select("*").eq("id", id).maybeSingle();
    if (error || !data) throw new McpWriteError("Restaurant introuvable.");
    return presentRestaurant(mapRestaurant(data as Record<string, unknown>));
  }
  const ville = typeof input.ville === "string" ? input.ville : "";
  const listed = await listRestaurants(db, ville);
  if (!listed.ready && "error" in listed && listed.error) throw new McpWriteError(listed.error);
  if (!listed.ready) throw new McpWriteError("Le module restaurants n’est pas encore en place.");
  return { restaurants: listed.rows.map(presentRestaurant) };
}

export async function sejoursRestaurants(input: Record<string, unknown>, admin?: SupabaseClient) {
  void input;
  const listed = await listInStay(client(admin));
  if ("message" in listed && listed.message && !listed.sejours.length) return listed;
  return { sejours: listed.sejours };
}

export async function tablesRestaurant(input: Record<string, unknown>, admin?: SupabaseClient) {
  const db = client(admin);
  const booking = await resolveBooking(db, input);
  const annuler =
    input.annuler === true ||
    input.annuler === "true" ||
    input.annuler === "oui" ||
    parseTableStatus(input.statut) === "annulee";
  if (annuler) {
    const saved = await cancelBookingTable(db, booking.id, input);
    if ("error" in saved) throw new McpWriteError(saved.error || "Enregistrement impossible.");
    return { dossier_id: booking.id, reference: booking.reference, ...saved };
  }
  const saved = await saveBookingTable(db, booking.id, {
    date: input.date,
    seat: input.table || input.seat,
    restaurantId: input.restaurant_id,
    time: input.heure,
    covers: input.couverts,
    confirmation: input.confirmation,
    account: input.compte,
    garantie: input.garantie,
    status: input.statut || "reservee",
  });
  if ("error" in saved) throw new McpWriteError(saved.error || "Enregistrement impossible.");
  return { dossier_id: booking.id, reference: booking.reference, ok: true };
}

export async function choixRestaurant(input: Record<string, unknown>, admin?: SupabaseClient) {
  const db = client(admin);
  const booking = await resolveBooking(db, input);
  const date = typeof input.date === "string" ? input.date.slice(0, 10) : "";
  let evenings = db.from("crm_restaurant_evenings").select("evening_date, choice, choice_source, chosen_at, message_status, message_sent_at, closed_at").eq("booking_id", booking.id);
  let messages = db.from("crm_restaurant_messages").select("evening_date, direction, body, button, status, created_at").eq("booking_id", booking.id).order("created_at", { ascending: true }).limit(40);
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    evenings = evenings.eq("evening_date", date);
    messages = messages.eq("evening_date", date);
  }
  const [eveningRows, messageRows] = await Promise.all([evenings, messages]);
  if (eveningRows.error || messageRows.error) throw new McpWriteError("Lecture impossible.");
  return {
    dossier_id: booking.id,
    reference: booking.reference,
    soirs: eveningRows.data || [],
    messages: messageRows.data || [],
  };
}
