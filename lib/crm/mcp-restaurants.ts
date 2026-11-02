import type { SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { createServiceClient } from "@/lib/supabase/admin";
import { cityPlaceKey, foldCityName } from "./city-names";
import { McpWriteError } from "./mcp-write";
import { ficheGaps } from "./restaurant-desk";
import {
  cancelBookingTable,
  listRestaurants,
  mapRestaurant,
  restaurantsReady,
  saveBookingTable,
  saveRestaurant,
} from "./restaurants-db";
import { listInStay } from "./restaurants-run";
import {
  parseRestaurantStatus,
  parseTableStatus,
  RESTAURANT_STATUS_LABELS,
  selectionBlock,
  type RestaurantRecord,
} from "./restaurants";

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

/** Fiche complète : photo de la salle, photo du plat, description, fourchette, lien. Comme le badge admin. */
export function ficheState(row: RestaurantRecord) {
  const gaps = ficheGaps(row);
  return { fiche_complete: gaps.length === 0, champs_manquants: gaps };
}

export function presentRestaurant(row: RestaurantRecord) {
  return {
    restaurant_id: row.id,
    nom: row.name,
    ville: row.city,
    adresse: row.address,
    lat: row.lat,
    lng: row.lng,
    telephone: row.phone,
    site: row.website,
    page: row.placeUrl || null,
    categorie: row.categories[0] || null,
    categories: row.categories,
    cuisine: row.cuisine,
    style: row.style,
    description: row.pitch,
    fourchette: row.priceBand,
    estimation: row.priceEstimated,
    horaires: row.openingHours,
    fermeture_jours: row.closedWeekdays,
    fermetures: row.annualClosures,
    plateforme: row.platform,
    lien: row.bookingUrl,
    bot: row.bot,
    empreinte_carte: row.guaranteeCard,
    annulation_en_ligne: row.onlineCancellation,
    annulation_heures: row.cancelHours,
    annulation_frais: row.cancelFeeCents == null ? null : row.cancelFeeCents / 100,
    photos: row.photoUrls,
    photo_plat: row.signaturePhotoUrl || null,
    photo_carte: row.menuPhotoUrl || null,
    disponibilites: row.availabilityNotes,
    statut: row.status,
    statut_libelle: RESTAURANT_STATUS_LABELS[row.status],
    motif: row.exclusionReason,
    etoile: row.starred,
    prepaiement: row.prepaidRequired,
    selection: selectionBlock(row),
    note: row.note,
    ...ficheState(row),
  };
}

async function readRestaurant(db: SupabaseClient, id: string) {
  if (!UUID.test(id)) throw new McpWriteError("Restaurant invalide.");
  const { data, error } = await db.from("crm_restaurants").select("*").eq("id", id).maybeSingle();
  if (error || !data) throw new McpWriteError("Restaurant introuvable.");
  return mapRestaurant(data as Record<string, unknown>);
}

/** Même nom (plié) dans la même ville : la fiche existe déjà. */
function sameHouse(row: RestaurantRecord, name: string, cityKey: string) {
  return row.cityKey === cityKey && foldCityName(row.name) === foldCityName(name);
}

async function cityRows(db: SupabaseClient, city: string) {
  const key = cityPlaceKey(city);
  if (!key) return [] as RestaurantRecord[];
  const { data, error } = await db.from("crm_restaurants").select("*").eq("city_key", key).order("name").limit(400);
  if (error) {
    if (!restaurantsReady(error)) throw new McpWriteError("Le module restaurants n’est pas encore en place.");
    throw new McpWriteError("Lecture impossible.");
  }
  return ((data || []) as Record<string, unknown>[]).map(mapRestaurant);
}

/**
 * list_restaurants : le catalogue d’une ville (ville), ou une fiche (restaurant_id), ou tout le catalogue.
 * Sert à vérifier qu’une maison n’existe pas déjà avant create_restaurant.
 */
export async function listRestaurantsTool(input: Record<string, unknown>, admin?: SupabaseClient) {
  const db = client(admin);
  const id = typeof input.restaurant_id === "string" ? input.restaurant_id.trim() : "";
  if (id) return presentRestaurant(await readRestaurant(db, id));
  const ville = typeof input.ville === "string" ? input.ville.trim() : "";
  const statut = typeof input.statut === "string" ? parseRestaurantStatus(input.statut) : null;
  if (statut && typeof statut === "object") throw new McpWriteError(statut.error);
  let rows: RestaurantRecord[];
  if (ville) {
    rows = await cityRows(db, ville);
  } else {
    const listed = await listRestaurants(db, typeof input.q === "string" ? input.q : "");
    if (!listed.ready && "error" in listed && listed.error) throw new McpWriteError(listed.error);
    if (!listed.ready) throw new McpWriteError("Le module restaurants n’est pas encore en place.");
    rows = listed.rows;
  }
  if (statut) rows = rows.filter((row) => row.status === statut);
  const restaurants = rows.map(presentRestaurant);
  return {
    ville: ville || null,
    total: restaurants.length,
    completes: restaurants.filter((row) => row.fiche_complete).length,
    a_valider: restaurants.filter((row) => row.statut === "a_valider").length,
    restaurants,
  };
}

/**
 * create_restaurant : une fiche nouvelle, nom et ville obligatoires. Une maison du même nom dans la
 * même ville est refusée (la fiche existante est citée) sauf forcer. Statut par défaut : a_valider.
 */
export async function createRestaurantTool(input: Record<string, unknown>, admin?: SupabaseClient) {
  const db = client(admin);
  const nom = typeof input.nom === "string" ? input.nom.trim() : "";
  const ville = typeof input.ville === "string" ? input.ville.trim() : "";
  if (!nom) throw new McpWriteError("Indiquez le nom.");
  if (!ville) throw new McpWriteError("Indiquez la ville.");
  const existing = (await cityRows(db, ville)).filter((row) => sameHouse(row, nom, cityPlaceKey(ville)));
  if (existing.length && input.forcer !== true) {
    throw new McpWriteError(
      `${existing[0].name} existe déjà à ${existing[0].city} (restaurant_id ${existing[0].id}). Utilisez update_restaurant, ou forcer: true pour une seconde adresse.`
    );
  }
  const { restaurant_id, forcer, ...fields } = input;
  void restaurant_id;
  void forcer;
  const saved = await saveRestaurant(db, { ...fields, statut: fields.statut ?? "a_valider" });
  if ("error" in saved) throw new McpWriteError(saved.error || "Enregistrement impossible.");
  const row = await readRestaurant(db, saved.id);
  return { cree: true, ...presentRestaurant(row) };
}

/** update_restaurant : met à jour les champs indiqués d’une fiche (restaurant_id). Les autres ne bougent pas. */
export async function updateRestaurantTool(input: Record<string, unknown>, admin?: SupabaseClient) {
  const db = client(admin);
  const id = typeof input.restaurant_id === "string" ? input.restaurant_id.trim() : "";
  if (!id) throw new McpWriteError("Indiquez restaurant_id.");
  const before = await readRestaurant(db, id);
  const { restaurant_id, forcer, ...fields } = input;
  void restaurant_id;
  void forcer;
  const touched = Object.entries(fields).filter(([, value]) => value !== undefined && value !== null);
  if (!touched.length) return { modifie: false, ...presentRestaurant(before) };
  const saved = await saveRestaurant(db, fields, id);
  if ("error" in saved) throw new McpWriteError(saved.error || "Enregistrement impossible.");
  const row = await readRestaurant(db, id);
  return { modifie: true, champs: touched.map(([key]) => key), ...presentRestaurant(row) };
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
