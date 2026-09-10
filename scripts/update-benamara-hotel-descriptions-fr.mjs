/**
 * Met à jour inventaires + infos hôtels avec des descriptions FR « style agence ».
 * Préserve les mots de passe voyageurs si credentials locaux présents.
 *
 * Run: node --env-file=.env.local scripts/update-benamara-hotel-descriptions-fr.mjs
 */
import fs from "fs";
import { randomBytes } from "crypto";

const API_URL = (process.env.MTRIP_API_URL || "https://api.mtrip.com").replace(
  /\/$/,
  ""
);
const API_ID = process.env.MTRIP_API_ID;
const API_KEY = process.env.MTRIP_API_KEY;
const ACCOUNT_ID = Number(process.env.MTRIP_ACCOUNT_ID || 66582);
const LE_URL = (
  process.env.LITTLE_EMPERORS_API_URL ||
  "https://api-staging.littleemperors.com/v2"
).replace(/\/$/, "");
const LE_KEY = process.env.LITTLE_EMPERORS_API_KEY;

const INV_COMPANIA = "inv-compania-hyatt-pty";
const INV_WALDORF = "inv-waldorf-astoria-pty";
const TRIP_ID = "benamara-panama-2026-08";

/** Descriptions rédigées comme une agence de voyages (FR). */
const AGENCY_COPY = {
  compania: {
    inventory: `
<p><strong>Hotel La Compañia – The Unbound Collection by Hyatt</strong>, au cœur du <em>Casco Viejo</em>, le quartier colonial classé de Panama City.</p>
<p>Nous avons choisi cet adresse pour votre première nuit : une immersion authentique dans les ruelles colorées, à deux pas des places historiques, des restaurants et de l’ambiance animée du centre ancien — idéale après l’arrivée de Paris et avant le départ pour Bocas del Toro.</p>
<p>L’hôtel propose une piscine en extérieur, un restaurant, un bar-terrasse avec vue sur la ville, un espace fitness, le room service et une réception 24h/24. Le petit-déjeuner à la carte et le Wi-Fi gratuit complètent un séjour confortable et élégant, dans l’esprit Unbound Collection by Hyatt.</p>
<p><strong>Inclus via Little Emperors :</strong> petit-déjeuner pour deux personnes, crédit établissement de 100&nbsp;$, surclassement prioritaire à l’arrivée (sous réserve de disponibilité), early check-in / late check-out selon disponibilité.</p>
`.trim(),
    roomKing: `
<p><strong>Chambre One King Bed Courtyard View</strong> — lit king avec vue sur la cour intérieure. Occupancy : 2 adultes. Réf. réservation <strong>151007RA008796</strong>.</p>
`.trim(),
    roomQueens: `
<p><strong>Chambre Two Queen Beds Courtyard View</strong> — deux lits queen, vue cour. Occupancy : 3 adultes. Réf. réservation <strong>151007RA008797</strong>.</p>
`.trim(),
  },
  waldorf: {
    inventory: `
<p><strong>Waldorf Astoria Panama</strong> — le premier Waldorf Astoria d’Amérique latine, une référence du luxe contemporain au Panama.</p>
<p>Situé dans le quartier d’affaires de Calle Uruguay, cet hôtel de 36 étages offre un cadre raffiné pour la fin de votre séjour : suites et chambres avec vues, spa Waldorf Astoria au 7<sup>e</sup> étage, piscine, et une gastronomie soignée (restaurant BRIO, Peacock Alley, Bungalow Terrace &amp; Pool Bar face à la skyline).</p>
<p>L’emplacement est particulièrement pratique : environ 15 minutes de l’aéroport de Tocumen (PTY), accès aisé à la Cinta Costera et au centre financier, et à environ 30 minutes du canal de Panama pour une excursion.</p>
<p>Nous vous y recommandons pour profiter d’un vrai temps de détente après Bocas — service signature Waldorf, espaces lounge et atmosphère internationale.</p>
<p><strong>Inclus via Little Emperors :</strong> petit-déjeuner pour deux personnes, crédit établissement de 100&nbsp;$, surclassement prioritaire à l’arrivée (sous réserve de disponibilité), early check-in / late check-out selon disponibilité.</p>
`.trim(),
    roomSuite: `
<p><strong>Junior Suite</strong> — 2 adultes. Réf. réservation <strong>3483484342</strong>. Idéale pour un confort supérieur en fin de voyage.</p>
`.trim(),
    roomDeluxe: `
<p><strong>Deluxe 2 Doubles</strong> — 3 adultes. Réf. réservation <strong>3483706026</strong>. Chambre spacieuse avec deux lits doubles.</p>
`.trim(),
  },
};

function authHeader() {
  return (
    "Basic " + Buffer.from(`${API_ID}:${API_KEY}`, "utf8").toString("base64")
  );
}

async function leHotel(id) {
  const res = await fetch(`${LE_URL}/hotels/${id}`, {
    headers: { Authorization: `Bearer ${LE_KEY}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`LE hotel ${id}: ${res.status}`);
  return res.json();
}

function pickImages(hotel, n = 5, prefer = []) {
  const all = [...(hotel.images || []), ...(hotel.short_info?.images || [])];
  const seen = new Set();
  const unique = [];
  for (const im of all) {
    if (seen.has(im.url)) continue;
    seen.add(im.url);
    unique.push(im);
  }
  const selected = [];
  for (const p of prefer) {
    const hit = unique.find(
      (im) =>
        (im.description || "").toLowerCase().includes(p) &&
        !selected.includes(im.url)
    );
    if (hit) selected.push(hit.url);
  }
  for (const im of unique) {
    if (selected.length >= n) break;
    if (!selected.includes(im.url)) selected.push(im.url);
  }
  return selected.slice(0, n);
}

async function upsertInventory(payload) {
  const res = await fetch(`${API_URL}/v1/inventories`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  console.log("inventory", payload.inventory_id, res.status, text.slice(0, 120));
  if (!res.ok) throw new Error(text);
}

function loadPasswords() {
  const path = "tmp_mtrip_extract/benamara-mtrip-credentials.json";
  if (!fs.existsSync(path)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(path, "utf8"));
    return Object.fromEntries(
      (data.travelers || []).map((t) => [t.identifier, t.password])
    );
  } catch {
    return null;
  }
}

const travelersMeta = [
  {
    id: "yanik",
    first_name: "Yanik",
    last_name: "Benamara",
    role: ["lead_traveler", "traveler"],
    af: { ticket: "057-9233973911", pnr: "ZEFYUU", class: "Premium Economy", baggage: "2PC" },
    x1: { ticket: "169-9233971257", pnr: "N0OP1Q", class: "Economy", baggage: "2PC" },
    cm: { ticket: "230-9233914324", pnr: "ACHLQR", class: "Economy", baggage: "1PC" },
  },
  {
    id: "elly",
    first_name: "Elly",
    last_name: "Benamara",
    role: ["traveler"],
    af: { ticket: "057-9233973910", pnr: "ZEFYUU", class: "Premium Economy", baggage: "2PC" },
    x1: { ticket: "169-9233971255", pnr: "N0OP1Q", class: "Economy", baggage: "2PC" },
    cm: { ticket: "230-9233914322", pnr: "ACHLQR", class: "Economy", baggage: "1PC" },
  },
  {
    id: "shirley",
    first_name: "Shirley",
    last_name: "Bchiri Benamara",
    role: ["traveler"],
    af: { ticket: "057-2360113845", pnr: "ZI3BTU", class: "Economy", baggage: "1PC" },
    x1: { ticket: "169-9233971253", pnr: "N0OP1Q", class: "Economy", baggage: "2PC" },
    cm: { ticket: "230-9233914320", pnr: "ACHLQR", class: "Economy", baggage: "1PC" },
  },
  {
    id: "bluma",
    first_name: "Bluma",
    last_name: "Benamara",
    role: ["traveler"],
    af: { ticket: "057-2360113846", pnr: "ZI3BTU", class: "Economy", baggage: "1PC" },
    x1: { ticket: "169-9233971254", pnr: "N0OP1Q", class: "Economy", baggage: "2PC" },
    cm: { ticket: "230-9233914321", pnr: "ACHLQR", class: "Economy", baggage: "1PC" },
  },
  {
    id: "saul",
    first_name: "Saul",
    last_name: "Benamara",
    role: ["traveler"],
    af: { ticket: "057-2360113847", pnr: "ZI3BTU", class: "Economy", baggage: "1PC" },
    x1: { ticket: "169-9233971256", pnr: "N0OP1Q", class: "Economy", baggage: "2PC" },
    cm: { ticket: "230-9233914323", pnr: "ACHLQR", class: "Economy", baggage: "1PC" },
  },
];

function flightDetails(key) {
  return travelersMeta.map((t) => ({
    traveler_identifier: t.id,
    reservation_reference: t[key].pnr,
    e_ticket: t[key].ticket,
    class: t[key].class,
    baggage_allowance: t[key].baggage,
  }));
}

async function main() {
  const [waldorf, compania] = await Promise.all([leHotel(8431), leHotel(11753)]);
  const waldorfPhotos = pickImages(waldorf, 5, [
    "lobby",
    "swimming pool",
    "peacock",
    "junior suite",
    "deluxe 2 doubles",
  ]);
  const companiaPhotos = pickImages(compania, 5);

  await upsertInventory({
    name: "Hotel La Compañia - The Unbound Collection by Hyatt",
    inventory_id: INV_COMPANIA,
    inventory_type: "accommodation",
    description: AGENCY_COPY.compania.inventory,
    address: compania.address,
    city: "Panama City",
    picture_url: companiaPhotos,
    location: compania.latitude
      ? `${compania.latitude},${compania.longitude}`
      : undefined,
  });

  await upsertInventory({
    name: "Waldorf Astoria Panama",
    inventory_id: INV_WALDORF,
    inventory_type: "accommodation",
    description: AGENCY_COPY.waldorf.inventory,
    address: waldorf.address,
    city: "Panama City",
    picture_url: waldorfPhotos,
    location: waldorf.latitude
      ? `${waldorf.latitude},${waldorf.longitude}`
      : undefined,
  });

  const savedPw = loadPasswords();
  const passwords = Object.fromEntries(
    travelersMeta.map((t) => [
      t.id,
      savedPw?.[t.id] || randomBytes(9).toString("base64url"),
    ])
  );

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

  const trip = {
    name: "Famille Benamara — Panama août 2026",
    identifier: TRIP_ID,
    trip_type: "type_4",
    mtrip_account_id: ACCOUNT_ID,
    start_date: "2026-08-02T00:00:00",
    end_date: "2026-08-19T23:59:00",
    description:
      "<p>Voyage sur mesure pour la famille Benamara au Panama (2–19 août 2026).</p>" +
      "<p><strong>Parcours :</strong> arrivée Paris–Panama City, nuit au Casco Viejo, séjour à Bocas del Toro, retour via David, puis quelques nuits au Waldorf Astoria avant le vol retour vers Paris.</p>",
    status: "published",
    booking_status: "confirmed",
    booking_visibility: true,
    trip_update_notifications:
      "Les descriptions de vos hôtels ont été mises à jour dans l'application.",
    sort_items_by_position: true,
    destinations: [
      {
        name: "Panama City",
        locode: "PAPTY",
        country_iso_code: "PA",
        start_date: "2026-08-02T00:00:00",
        end_date: "2026-08-03T23:59:00",
        position: 1,
        description:
          "<p>Arrivée à Tocumen et première nuit dans le quartier colonial du Casco Viejo.</p>",
        location: { latitude: 8.9824, longitude: -79.5199 },
        picture_url: companiaPhotos[0],
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
          "<p>Séjour dans l’archipel de Bocas del Toro — plages, îles et ambiance Caraïbes.</p>",
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
          "<p>Retour sur Panama City via David, puis séjour détente au Waldorf Astoria avant le vol pour Paris.</p>",
        location: { latitude: 8.9824, longitude: -79.5199 },
        picture_url: waldorfPhotos[0],
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
        comments: "Vol long-courrier Paris → Panama.",
        active_for_every_traveler: false,
        flights_travelers_details: flightDetails("af"),
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
        comments: "Vol intérieur vers Bocas del Toro (opéré par Air Panama).",
        active_for_every_traveler: false,
        flights_travelers_details: flightDetails("x1"),
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
        comments: "Vol Copa David → Panama City.",
        active_for_every_traveler: false,
        flights_travelers_details: flightDetails("cm"),
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
        comments: "Vol retour Panama → Paris (arrivée J+1).",
        active_for_every_traveler: false,
        flights_travelers_details: flightDetails("af"),
      },
    ],
    accommodations: [
      {
        identifier: "compania-king",
        inventory_id: INV_COMPANIA,
        name: "Hotel La Compañia - The Unbound Collection by Hyatt",
        booking_number: "151007RA008796",
        from_date: "2026-08-02T15:00:00",
        to_date: "2026-08-03T12:00:00",
        check_in_time: "15:00",
        check_out_time: "12:00",
        type_of_room: "One King Bed Courtyard View",
        address: compania.address,
        city: "Panama City",
        country_code: "PA",
        website: compania.website,
        location: {
          latitude: Number(compania.latitude) || 8.9527,
          longitude: Number(compania.longitude) || -79.535,
        },
        picture_url: companiaPhotos[0],
        info:
          AGENCY_COPY.compania.inventory + AGENCY_COPY.compania.roomKing,
        chain_code: "HY",
        position: 1,
        active_for_every_traveler: true,
      },
      {
        identifier: "compania-queens",
        inventory_id: INV_COMPANIA,
        name: "Hotel La Compañia - The Unbound Collection by Hyatt",
        booking_number: "151007RA008797",
        from_date: "2026-08-02T15:00:00",
        to_date: "2026-08-03T12:00:00",
        check_in_time: "15:00",
        check_out_time: "12:00",
        type_of_room: "Two Queen Beds Courtyard View",
        address: compania.address,
        city: "Panama City",
        country_code: "PA",
        website: compania.website,
        location: {
          latitude: Number(compania.latitude) || 8.9527,
          longitude: Number(compania.longitude) || -79.535,
        },
        picture_url: companiaPhotos[1] || companiaPhotos[0],
        info:
          AGENCY_COPY.compania.inventory + AGENCY_COPY.compania.roomQueens,
        chain_code: "HY",
        position: 2,
        active_for_every_traveler: true,
      },
      {
        identifier: "waldorf-suite",
        inventory_id: INV_WALDORF,
        name: "Waldorf Astoria Panama",
        booking_number: "3483484342",
        from_date: "2026-08-14T15:00:00",
        to_date: "2026-08-18T12:00:00",
        check_in_time: "15:00",
        check_out_time: "12:00",
        type_of_room: "Junior Suite",
        address: waldorf.address,
        city: "Panama City",
        country_code: "PA",
        website: waldorf.website,
        location: {
          latitude: Number(waldorf.latitude) || 8.9806,
          longitude: Number(waldorf.longitude) || -79.5201,
        },
        picture_url:
          waldorfPhotos.find((u) => u.includes("13601")) || waldorfPhotos[0],
        info: AGENCY_COPY.waldorf.inventory + AGENCY_COPY.waldorf.roomSuite,
        chain_code: "WA",
        position: 3,
        active_for_every_traveler: true,
      },
      {
        identifier: "waldorf-deluxe",
        inventory_id: INV_WALDORF,
        name: "Waldorf Astoria Panama",
        booking_number: "3483706026",
        from_date: "2026-08-14T15:00:00",
        to_date: "2026-08-18T12:00:00",
        check_in_time: "15:00",
        check_out_time: "12:00",
        type_of_room: "Deluxe 2 Doubles",
        address: waldorf.address,
        city: "Panama City",
        country_code: "PA",
        website: waldorf.website,
        location: {
          latitude: Number(waldorf.latitude) || 8.9806,
          longitude: Number(waldorf.longitude) || -79.5201,
        },
        picture_url:
          waldorfPhotos.find((u) => u.includes("13598")) || waldorfPhotos[1],
        info: AGENCY_COPY.waldorf.inventory + AGENCY_COPY.waldorf.roomDeluxe,
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
    price_note: "Total hôtels estimé (billets aériens non inclus).",
  };

  const res = await fetch(`${API_URL}/v1/trips`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(trip),
  });
  console.log("trip", res.status, await res.text());

  // Persist FR copy + passwords for CDC / future updates
  fs.mkdirSync("tmp_mtrip_extract", { recursive: true });
  fs.writeFileSync(
    "tmp_mtrip_extract/benamara-hotel-descriptions-fr.json",
    JSON.stringify(AGENCY_COPY, null, 2)
  );
  fs.writeFileSync(
    "tmp_mtrip_extract/benamara-mtrip-credentials.json",
    JSON.stringify(
      {
        trip_identifier: TRIP_ID,
        travelers: travelersMeta.map((t) => ({
          identifier: t.id,
          name: `${t.first_name} ${t.last_name}`,
          password: passwords[t.id],
        })),
      },
      null,
      2
    )
  );

  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
