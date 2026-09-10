/**
 * Create Benamara Panama trip on mTrip from extracted PDF data.
 * Run: node --env-file=.env.local scripts/create-benamara-mtrip.mjs
 */
import { randomBytes } from "crypto";

const API_URL = (process.env.MTRIP_API_URL || "https://api.mtrip.com").replace(
  /\/$/,
  ""
);
const API_ID = process.env.MTRIP_API_ID;
const API_KEY = process.env.MTRIP_API_KEY;
const ACCOUNT_ID = Number(process.env.MTRIP_ACCOUNT_ID || 66582);
const PRIMARY_ID = process.env.MTRIP_PRIMARY_ID || "TBT123";

if (!API_ID || !API_KEY) {
  console.error("Missing MTRIP_API_ID / MTRIP_API_KEY");
  process.exit(1);
}

function authHeader() {
  return (
    "Basic " + Buffer.from(`${API_ID}:${API_KEY}`, "utf8").toString("base64")
  );
}

function pwd() {
  return randomBytes(9).toString("base64url"); // >= 6 chars
}

const travelersMeta = [
  {
    id: "yanik",
    first_name: "Yanik",
    last_name: "Benamara",
    role: ["lead_traveler", "traveler"],
    af: {
      ticket: "057-9233973911",
      pnr: "ZEFYUU",
      class: "Premium Economy",
      baggage: "2PC",
    },
    x1: { ticket: "169-9233971257", pnr: "N0OP1Q", class: "Economy", baggage: "2PC" },
    cm: { ticket: "230-9233914324", pnr: "ACHLQR", class: "Economy", baggage: "1PC" },
  },
  {
    id: "elly",
    first_name: "Elly",
    last_name: "Benamara",
    role: ["traveler"],
    af: {
      ticket: "057-9233973910",
      pnr: "ZEFYUU",
      class: "Premium Economy",
      baggage: "2PC",
    },
    x1: { ticket: "169-9233971255", pnr: "N0OP1Q", class: "Economy", baggage: "2PC" },
    cm: { ticket: "230-9233914322", pnr: "ACHLQR", class: "Economy", baggage: "1PC" },
  },
  {
    id: "shirley",
    first_name: "Shirley",
    last_name: "Bchiri Benamara",
    role: ["traveler"],
    af: {
      ticket: "057-2360113845",
      pnr: "ZI3BTU",
      class: "Economy",
      baggage: "1PC",
    },
    x1: { ticket: "169-9233971253", pnr: "N0OP1Q", class: "Economy", baggage: "2PC" },
    cm: { ticket: "230-9233914320", pnr: "ACHLQR", class: "Economy", baggage: "1PC" },
  },
  {
    id: "bluma",
    first_name: "Bluma",
    last_name: "Benamara",
    role: ["traveler"],
    af: {
      ticket: "057-2360113846",
      pnr: "ZI3BTU",
      class: "Economy",
      baggage: "1PC",
    },
    x1: { ticket: "169-9233971254", pnr: "N0OP1Q", class: "Economy", baggage: "2PC" },
    cm: { ticket: "230-9233914321", pnr: "ACHLQR", class: "Economy", baggage: "1PC" },
  },
  {
    id: "saul",
    first_name: "Saul",
    last_name: "Benamara",
    role: ["traveler"],
    af: {
      ticket: "057-2360113847",
      pnr: "ZI3BTU",
      class: "Economy",
      baggage: "1PC",
    },
    x1: { ticket: "169-9233971256", pnr: "N0OP1Q", class: "Economy", baggage: "2PC" },
    cm: { ticket: "230-9233914323", pnr: "ACHLQR", class: "Economy", baggage: "1PC" },
  },
];

const passwords = Object.fromEntries(travelersMeta.map((t) => [t.id, pwd()]));

const travelers = travelersMeta.map((t) => ({
  identifier: t.id,
  first_name: t.first_name,
  last_name: t.last_name,
  role: t.role,
  language: "fr",
  password: passwords[t.id],
  send_invitation_type: 0,
  send_invitation_sms: false,
  booking_reference: t.af.pnr,
}));

function flightTravelerDetails(segmentKey) {
  return travelersMeta.map((t) => ({
    traveler_identifier: t.id,
    reservation_reference: t[segmentKey].pnr,
    e_ticket: t[segmentKey].ticket,
    class: t[segmentKey].class,
    baggage_allowance: t[segmentKey].baggage,
  }));
}

const trip = {
  name: "Famille Benamara — Panama août 2026",
  identifier: "benamara-panama-2026-08",
  trip_type: "type_4",
  mtrip_account_id: ACCOUNT_ID,
  // primary_id alone with account_id can 404 — account_id is enough for TBT
  start_date: "2026-08-02T00:00:00",
  end_date: "2026-08-19T23:59:00",
  description:
    "<p>Voyage famille Benamara au Panama (2–19 août 2026).</p>" +
    "<p><strong>Itinéraire :</strong> Paris CDG → Panama City (AF) → Bocas del Toro (Air Panama) → retour via David (Copa) → Panama City (Waldorf Astoria) → Paris CDG (AF).</p>" +
    "<p><em>Note :</em> hébergement Bocas / David (3–14 août) non fourni dans les PDF — à compléter.</p>",
  status: "published",
  booking_status: "confirmed",
  booking_visibility: true,
  trip_update_notifications:
    "Votre voyage Panama est prêt dans l'app. Consultez vols et hôtels.",
  sort_items_by_position: true,
  destinations: [
    {
      name: "Panama City",
      locode: "PAPTY",
      country_iso_code: "PA",
      start_date: "2026-08-02T00:00:00",
      end_date: "2026-08-03T23:59:00",
      position: 1,
      description: "<p>Arrivée Tocumen + nuit Casco Viejo (Hotel La Compañia).</p>",
      location: { latitude: 8.9824, longitude: -79.5199 },
      active_for_every_traveler: true,
    },
    {
      name: "Bocas del Toro",
      locode: "PABOC",
      country_iso_code: "PA",
      start_date: "2026-08-03T00:00:00",
      end_date: "2026-08-12T23:59:00",
      position: 2,
      description:
        "<p>Séjour Bocas del Toro. Vol Air Panama X1 218 depuis Marcos A. Gelabert.</p>",
      location: { latitude: 9.3408, longitude: -82.2509 },
      active_for_every_traveler: true,
    },
    {
      name: "Panama City",
      locode: "PAPTY",
      country_iso_code: "PA",
      start_date: "2026-08-12T00:00:00",
      end_date: "2026-08-18T23:59:00",
      position: 3,
      description:
        "<p>Retour via David (Copa CM 18) puis Waldorf Astoria Panama (14–18 août).</p>",
      location: { latitude: 8.9824, longitude: -79.5199 },
      active_for_every_traveler: true,
    },
  ],
  travelers,
  flights: [
    {
      identifier: "af490-out",
      departure_date: "2026-08-02T15:45:00",
      arrival_date: "2026-08-02T19:45:00",
      airline_iata: "AF",
      airline: "Air France",
      flight_number: "490",
      booking_reference: "ZEFYUU",
      departure_city: "Paris",
      departure_airport: "Charles de Gaulle",
      departure_airport_iata: "CDG",
      departure_terminal: "2E",
      arrival_city: "Panama City",
      arrival_airport: "Tocumen International",
      arrival_airport_iata: "PTY",
      arrival_terminal: "2",
      aircraft: "Airbus A350-900",
      operator: "Air France",
      duration: 39600,
      position: 1,
      comments:
        "Vol long-courrier AF490. PNR Yanik/Elly: ZEFYUU · Shirley/Bluma/Saul: ZI3BTU (dossier ZHXQEV).",
      active_for_every_traveler: false,
      flights_travelers_details: flightTravelerDetails("af"),
    },
    {
      identifier: "x1218-bocas",
      departure_date: "2026-08-03T09:45:00",
      arrival_date: "2026-08-03T10:45:00",
      airline_iata: "X1",
      airline: "Hahn Air / Air Panama",
      flight_number: "218",
      booking_reference: "N0OP1Q",
      departure_city: "Panama City",
      departure_airport: "Marcos A. Gelabert",
      departure_airport_iata: "PAC",
      arrival_city: "Bocas del Toro",
      arrival_airport: "Isla Colon International",
      arrival_airport_iata: "BOC",
      aircraft: "Fokker 50",
      operator: "Air Panama",
      duration: 3600,
      position: 2,
      comments: "Opéré par Air Panama. Dossier XL8LPD · PNR X1/N0OP1Q.",
      active_for_every_traveler: false,
      flights_travelers_details: flightTravelerDetails("x1"),
    },
    {
      identifier: "cm18-david-pty",
      departure_date: "2026-08-12T09:50:00",
      arrival_date: "2026-08-12T11:03:00",
      airline_iata: "CM",
      airline: "Copa Airlines",
      flight_number: "18",
      booking_reference: "ACHLQR",
      departure_city: "David",
      departure_airport: "Enrique Malek International",
      departure_airport_iata: "DAV",
      arrival_city: "Panama City",
      arrival_airport: "Tocumen International",
      arrival_airport_iata: "PTY",
      aircraft: "Boeing 737-800",
      operator: "Copa Airlines",
      duration: 4380,
      position: 3,
      comments: "Dossier XLDW2Z · PNR CM/ACHLQR.",
      active_for_every_traveler: false,
      flights_travelers_details: flightTravelerDetails("cm"),
    },
    {
      identifier: "af491-return",
      departure_date: "2026-08-18T21:55:00",
      arrival_date: "2026-08-19T15:20:00",
      airline_iata: "AF",
      airline: "Air France",
      flight_number: "491",
      booking_reference: "ZEFYUU",
      departure_city: "Panama City",
      departure_airport: "Tocumen International",
      departure_airport_iata: "PTY",
      departure_terminal: "2",
      arrival_city: "Paris",
      arrival_airport: "Charles de Gaulle",
      arrival_airport_iata: "CDG",
      arrival_terminal: "2E",
      aircraft: "Airbus A350-900",
      operator: "Air France",
      duration: 37500,
      position: 4,
      comments: "Arrivée J+1 à CDG. Même billet aller-retour AF.",
      active_for_every_traveler: false,
      flights_travelers_details: flightTravelerDetails("af"),
    },
  ],
  accommodations: [
    {
      identifier: "compania-king",
      name: "Hotel La Compañia - The Unbound Collection by Hyatt",
      booking_number: "151007RA008796",
      from_date: "2026-08-02T15:00:00",
      to_date: "2026-08-03T12:00:00",
      check_in_time: "15:00",
      check_out_time: "12:00",
      type_of_room: "One King Bed Courtyard View",
      address: "Avenida A &, C. 8a Oeste, Panama City, Panama",
      city: "Panama City",
      country_code: "PA",
      location: { latitude: 8.9527, longitude: -79.535 },
      info:
        "Little Emperors: upgrade prioritaire, petit-déj 2 pers, $100 crédit, early/late subject to availability. Annulation gratuite avant 31/07/2026 00:00 puis 1 nuit. Total $322.58. Booking name: Benamara Yannick.",
      chain_code: "HY",
      position: 1,
      active_for_every_traveler: true,
    },
    {
      identifier: "compania-queens",
      name: "Hotel La Compañia - The Unbound Collection by Hyatt",
      booking_number: "151007RA008797",
      from_date: "2026-08-02T15:00:00",
      to_date: "2026-08-03T12:00:00",
      check_in_time: "15:00",
      check_out_time: "12:00",
      type_of_room: "Two Queen Beds Courtyard View",
      address: "Avenida A &, C. 8a Oeste, Panama City, Panama",
      city: "Panama City",
      country_code: "PA",
      location: { latitude: 8.9527, longitude: -79.535 },
      info:
        "3 adults. LE benefits. Total $350.63. Booking name: Benamara Yannick.",
      chain_code: "HY",
      position: 2,
      active_for_every_traveler: true,
    },
    {
      identifier: "waldorf-suite",
      name: "Waldorf Astoria Panama",
      booking_number: "3483484342",
      from_date: "2026-08-14T15:00:00",
      to_date: "2026-08-18T12:00:00",
      check_in_time: "15:00",
      check_out_time: "12:00",
      type_of_room: "Junior Suite",
      address: "47th St. Uruguay Street, Panama City, Panama",
      city: "Panama City",
      country_code: "PA",
      location: { latitude: 8.9806, longitude: -79.5201 },
      info:
        "2 adults. LE: breakfast 2, $100 credit, priority upgrade, early/late. Total $1,257.32. Annulation gratuite avant 13/08/2026 23:59.",
      chain_code: "WA",
      position: 3,
      active_for_every_traveler: true,
    },
    {
      identifier: "waldorf-deluxe",
      name: "Waldorf Astoria Panama",
      booking_number: "3483706026",
      from_date: "2026-08-14T15:00:00",
      to_date: "2026-08-18T12:00:00",
      check_in_time: "15:00",
      check_out_time: "12:00",
      type_of_room: "Deluxe 2 Doubles",
      address: "47th St. Uruguay Street, Panama City, Panama",
      city: "Panama City",
      country_code: "PA",
      location: { latitude: 8.9806, longitude: -79.5201 },
      info:
        "3 adults. Hilton Honors Offer + LE benefits. ~$1,562.04 / €1,370.23. Annulation gratuite avant 09/08/2026 23:59.",
      chain_code: "WA",
      position: 4,
      active_for_every_traveler: true,
    },
  ],
  contacts: [
    {
      type: "custom",
      label: "Travel Business Agency",
      email: "contact@travelbt.fr",
      email_label: "Email",
      phone: "+33188619369",
      phone_label: "Téléphone",
    },
  ],
  price_currency: "USD",
  total_price: 322.58 + 350.63 + 1257.32 + 1562.04,
  price_note:
    "Total hôtels estimé (La Compañia $673.21 + Waldorf ~$2,819.36). Billets avion hors total (payés séparément).",
  prices: [
    { text: "La Compañia King", price: 322.58 },
    { text: "La Compañia Two Queens", price: 350.63 },
    { text: "Waldorf Junior Suite", price: 1257.32 },
    { text: "Waldorf Deluxe 2 Doubles (USD)", price: 1562.04 },
  ],
};

async function main() {
  console.log("POST", `${API_URL}/v1/trips`);
  const res = await fetch(`${API_URL}/v1/trips`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(trip),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  console.log("status", res.status);
  console.log(JSON.stringify(body, null, 2));

  if (!res.ok) process.exit(1);

  // Verify identifier
  const check = await fetch(
    `${API_URL}/v1/trips/internal_identifier?identifier=${encodeURIComponent(trip.identifier)}`,
    { headers: { Authorization: authHeader(), Accept: "application/json" } }
  );
  console.log("check", check.status, await check.text());

  // Save credentials locally (not committed)
  const creds = {
    trip_identifier: trip.identifier,
    travelers: travelersMeta.map((t) => ({
      identifier: t.id,
      name: `${t.first_name} ${t.last_name}`,
      password: passwords[t.id],
    })),
  };
  const fs = await import("fs");
  fs.writeFileSync(
    "tmp_mtrip_extract/benamara-mtrip-credentials.json",
    JSON.stringify(creds, null, 2)
  );
  console.log("credentials saved to tmp_mtrip_extract/benamara-mtrip-credentials.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
