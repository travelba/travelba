import { isWalletPassName, storedWalletPass } from "./pkpass";

/**
 * Un seul identifiant de type de passe : un certificat, trois styles.
 * Hôtel et transfert sont des passes génériques. Le vol de repli est une
 * carte d’embarquement quand les deux codes aéroport sont déjà écrits.
 */
export const WALLET_PASS_TYPE_ID = "pass.fr.travelba.client";

export const WALLET_NAVY = "rgb(11, 25, 44)";
export const WALLET_CHAMPAGNE = "rgb(197, 168, 128)";
export const WALLET_INK = "rgb(255, 255, 255)";

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const PLACEHOLDER = /^(?:-|—|–|n\/a|na|tbd|null|none|inconnu)$/i;

export type WalletField = { key: string; label: string; value: string };

export type WalletLocation = { latitude: number; longitude: number; relevantText: string };

export type BuiltWalletPass = {
  style: "hotel" | "transfer" | "boarding";
  serialNumber: string;
  pass: Record<string, unknown>;
};

export type WalletItem = {
  id: string;
  kind: string;
  title?: string | null;
  supplier?: string | null;
  confirmation_ref?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  details?: Record<string, unknown> | null;
  visible_to_client?: boolean | null;
  lifecycle?: string | null;
};

export type WalletDocRef = {
  booking_item_id?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  extracted?: unknown;
};

type Identity = { passTypeId: string; teamId: string; bookingId?: string | null };

function clean(value: unknown, max = 120) {
  if (typeof value === "number" && Number.isFinite(value)) return clean(String(value), max);
  if (typeof value !== "string") return null;
  const text = value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  if (!text || text.length > max || PLACEHOLDER.test(text)) return null;
  return text;
}

function detail(item: WalletItem, key: string) {
  return clean(item.details?.[key]);
}

function field(key: string, label: string, value: string | null): WalletField | null {
  if (!value) return null;
  return { key, label, value };
}

function fields(rows: (WalletField | null)[]) {
  return rows.filter((row): row is WalletField => Boolean(row));
}

/** « 12 nov. 2026 ». Une date illisible reste absente. */
export function walletDate(value: string | null | undefined) {
  const day = String(value || "").slice(0, 10);
  const match = day.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const month = Number(match[2]);
  const date = Number(match[3]);
  if (month < 1 || month > 12 || date < 1 || date > 31) return null;
  return `${date} ${MONTHS[month - 1]} ${match[1]}`;
}

/** Heure déjà écrite. Minuit et une heure absente ne deviennent pas un horaire. */
export function walletClock(value: string | null | undefined) {
  const text = String(value || "").trim();
  const iso = text.match(/T(\d{2}):(\d{2})/);
  const hm = text.match(/^(\d{1,2})\s*[:hH]\s*(\d{2})$/);
  const hours = iso?.[1] || (hm ? hm[1].padStart(2, "0") : "");
  const minutes = iso?.[2] || hm?.[2] || "";
  if (!hours || !minutes) return null;
  const h = Number(hours);
  const m = Number(minutes);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h > 23 || m > 59) return null;
  if (h === 0 && m === 0) return null;
  return `${hours}h${minutes}`;
}

/** Point sur la carte, seulement si les deux coordonnées sont déjà des nombres valides. */
export function walletLocation(latitude: unknown, longitude: unknown, label: string): WalletLocation | null {
  const lat = typeof latitude === "number" ? latitude : typeof latitude === "string" && latitude.trim() ? Number(latitude) : NaN;
  const lng = typeof longitude === "number" ? longitude : typeof longitude === "string" && longitude.trim() ? Number(longitude) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01) return null;
  const relevantText = clean(label, 80);
  if (!relevantText) return null;
  return { latitude: lat, longitude: lng, relevantText };
}

function iata(value: string | null) {
  if (!value || !/^[A-Za-z]{3}$/.test(value)) return null;
  return value.toUpperCase();
}

function phone(value: string | null) {
  if (!value || !/\d/.test(value)) return null;
  return value.slice(0, 40);
}

function shell(input: {
  identity: Identity;
  serialNumber: string;
  description: string;
  locations?: WalletLocation[];
}) {
  const pass: Record<string, unknown> = {
    formatVersion: 1,
    passTypeIdentifier: input.identity.passTypeId,
    serialNumber: input.serialNumber,
    teamIdentifier: input.identity.teamId,
    organizationName: "Travel Business Agency",
    description: input.description.slice(0, 80),
    logoText: "TBA",
    backgroundColor: WALLET_NAVY,
    foregroundColor: WALLET_INK,
    labelColor: WALLET_CHAMPAGNE,
  };
  if (input.identity.bookingId && /^[0-9a-f-]{36}$/i.test(input.identity.bookingId)) {
    pass.groupingIdentifier = `tba-${input.identity.bookingId}`;
  }
  if (input.locations?.length) pass.locations = input.locations;
  return pass;
}

function hotelName(item: WalletItem) {
  return detail(item, "hotel_name") || clean(item.title, 80);
}

export function buildHotelPass(item: WalletItem, guest: string | null, identity: Identity): BuiltWalletPass | null {
  if (item.kind !== "hotel") return null;
  const name = hotelName(item);
  if (!name) return null;
  const address = [detail(item, "address"), detail(item, "city")].filter(Boolean).join(", ") || null;
  const arrive = walletDate(item.start_at);
  const leave = walletDate(item.end_at);
  const clock = walletClock(detail(item, "check_in_time")) || walletClock(item.start_at);
  const confirmation = clean(item.confirmation_ref, 40);
  const who = clean(guest, 80);
  const where = walletLocation(item.details?.latitude, item.details?.longitude, name);
  const serialNumber = `hotel-${item.id}`;
  const pass = shell({
    identity,
    serialNumber,
    description: `Hôtel ${name}`.slice(0, 80),
    locations: where ? [where] : undefined,
  });
  pass.generic = {
    primaryFields: fields([field("hotel", "HÔTEL", name)]),
    secondaryFields: fields([field("arrive", "ARRIVÉE", arrive), field("leave", "DÉPART", leave)]),
    auxiliaryFields: fields([field("guest", "VOYAGEUR", who), field("confirmation", "CONFIRMATION", confirmation)]),
    backFields: fields([
      field("address", "Adresse", address),
      field("checkin", "Heure d’arrivée", clock),
      field("agency", "Agence", "Travel Business Agency"),
    ]),
  };
  return { style: "hotel", serialNumber, pass };
}

function transferPlace(item: WalletItem) {
  return detail(item, "pickup") || detail(item, "depart_address");
}

export function buildTransferPass(item: WalletItem, identity: Identity): BuiltWalletPass | null {
  if (item.kind !== "transfer" && item.kind !== "chauffeur") return null;
  const place = transferPlace(item);
  const dropoff = detail(item, "dropoff") || detail(item, "arrive_address");
  const clock = walletClock(item.start_at) || walletClock(detail(item, "pickup_time"));
  const day = walletDate(item.start_at);
  const driver = detail(item, "driver");
  const company = clean(item.supplier, 80) || detail(item, "company");
  const line = phone(detail(item, "phone"));
  if (!place && !(clock && (company || driver))) return null;
  const when = [day, clock].filter(Boolean).join(" · ") || null;
  const serialNumber = `transfer-${item.id}`;
  const pass = shell({
    identity,
    serialNumber,
    description: `Transfert${place ? ` ${place}` : ""}`.slice(0, 80),
  });
  pass.generic = {
    primaryFields: fields([field("pickup", "PRISE EN CHARGE", place || when)]),
    secondaryFields: fields([field("when", "HORAIRE", place ? when : null), field("dropoff", "DÉPOSE", dropoff)]),
    auxiliaryFields: fields([field("driver", "CHAUFFEUR", driver), field("company", "SOCIÉTÉ", company), field("phone", "TÉLÉPHONE", line)]),
    backFields: fields([
      field("note", "Précision", detail(item, "pickup_note")),
      field("agency", "Agence", "Travel Business Agency"),
    ]),
  };
  return { style: "transfer", serialNumber, pass };
}

function flightCode(item: WalletItem) {
  const raw = detail(item, "flight_number");
  if (!raw || !/^[A-Z]{1,3}\s?\d{1,4}[A-Z]?$/i.test(raw)) return null;
  return raw.toUpperCase().replace(/\s+/g, "");
}

export function buildBoardingPass(item: WalletItem, passenger: string | null, identity: Identity): BuiltWalletPass | null {
  if (item.kind !== "flight") return null;
  const number = flightCode(item);
  const from = iata(detail(item, "from"));
  const to = iata(detail(item, "to"));
  const cityFrom = detail(item, "city_from");
  const cityTo = detail(item, "city_to");
  if (!number && !(from && to) && !(cityFrom && cityTo)) return null;
  const day = walletDate(item.start_at);
  const clock = walletClock(item.start_at);
  const when = [day, clock].filter(Boolean).join(" · ") || null;
  const who = clean(passenger, 80);
  const seat = clean(detail(item, "seat"), 6);
  const gate = clean(detail(item, "gate"), 6);
  const terminal = detail(item, "terminal");
  const pnr = clean(item.confirmation_ref, 12);
  const airline = detail(item, "airline") || clean(item.supplier, 40);
  const route = [cityFrom || from, cityTo || to].filter(Boolean).join(" → ") || null;
  const serialNumber = `boarding-${item.id}`;
  const pass = shell({
    identity,
    serialNumber,
    description: `Vol ${number || route || ""}`.trim().slice(0, 80),
  });
  const back = fields([
    field("airline", "Compagnie", airline),
    field("terminal", "Terminal", terminal),
    field("pnr", "Réservation", pnr),
    field("note", "Carte", "Émise par l’agence à partir du vol du séjour. La carte de la compagnie, si elle est déposée, fait foi."),
    field("agency", "Agence", "Travel Business Agency"),
  ]);
  if (from && to) {
    pass.boardingPass = {
      transitType: "PKTransitTypeAir",
      headerFields: fields([field("flight", "VOL", number), field("date", "DATE", day)]),
      primaryFields: fields([
        field("origin", cityFrom || from, from),
        field("destination", cityTo || to, to),
      ]),
      secondaryFields: fields([field("passenger", "PASSAGER", who), field("when", "DÉPART", when)]),
      auxiliaryFields: fields([field("seat", "SIÈGE", seat), field("gate", "PORTE", gate)]),
      backFields: back,
    };
  } else {
    pass.generic = {
      primaryFields: fields([field("route", "VOL", route || number)]),
      secondaryFields: fields([field("flight", "NUMÉRO", number), field("when", "DÉPART", when)]),
      auxiliaryFields: fields([field("passenger", "PASSAGER", who), field("seat", "SIÈGE", seat), field("gate", "PORTE", gate)]),
      backFields: back,
    };
  }
  return { style: "boarding", serialNumber, pass };
}

function sameFlight(left: string | null | undefined, right: string | null | undefined) {
  const a = String(left || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const b = String(right || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return a.length >= 4 && a === b;
}

/** Un .pkpass de compagnie déjà déposé pour ce vol. Le repli TBA ne se montre pas. */
export function flightHasAirlinePass(item: WalletItem, docs: WalletDocRef[]) {
  const number = flightCode(item);
  return docs.some((doc) => {
    if (!isWalletPassName(doc.file_name, doc.mime_type)) return false;
    if (doc.booking_item_id && doc.booking_item_id === item.id) return true;
    const extract = storedWalletPass(doc.extracted);
    if (number && extract?.flight && sameFlight(extract.flight, number)) return true;
    const file = String(doc.file_name || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    return Boolean(number && file.includes(number));
  });
}

export function itemEligible(item: WalletItem) {
  if (item.visible_to_client === false) return false;
  if (item.lifecycle === "cancelled" || item.lifecycle === "superseded") return false;
  return item.kind === "hotel" || item.kind === "transfer" || item.kind === "chauffeur" || item.kind === "flight";
}

/** Lien du passe, ou null si la signature n’est pas posée, ou si la carte n’a rien à montrer. */
export function walletPassHref(input: {
  ready: boolean;
  reference: string;
  item: WalletItem;
  docs?: WalletDocRef[];
  guest?: string | null;
}) {
  if (!input.ready) return null;
  if (!/^TB-\d{4}-\d{4}$/i.test(input.reference)) return null;
  if (!/^[0-9a-f-]{36}$/i.test(input.item.id)) return null;
  if (!itemEligible(input.item)) return null;
  const identity = { passTypeId: WALLET_PASS_TYPE_ID, teamId: "TEAMIDTEST" };
  const guest = input.guest || null;
  let built: BuiltWalletPass | null = null;
  if (input.item.kind === "hotel") built = buildHotelPass(input.item, guest, identity);
  else if (input.item.kind === "transfer" || input.item.kind === "chauffeur") built = buildTransferPass(input.item, identity);
  else if (input.item.kind === "flight") {
    if (flightHasAirlinePass(input.item, input.docs || [])) return null;
    built = buildBoardingPass(input.item, guest, identity);
  }
  if (!built) return null;
  return `/api/client/bookings/${input.reference.toUpperCase()}/passe/${input.item.id}`;
}

export function buildItemPass(item: WalletItem, guest: string | null, identity: Identity) {
  if (item.kind === "hotel") return buildHotelPass(item, guest, identity);
  if (item.kind === "transfer" || item.kind === "chauffeur") return buildTransferPass(item, identity);
  if (item.kind === "flight") return buildBoardingPass(item, guest, identity);
  return null;
}
