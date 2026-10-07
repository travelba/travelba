import { addIsoDays } from "./dates";
import { centsToAmount } from "./money";
import { stayDatesOpen } from "./stay-moment";
import type { HotelArrivalChannel, HotelArrivalStatus } from "./types";

export { addIsoDays };

/** Carte de check-in après le règlement, et carte Expedia. */
export const CHECKIN_CARD_CENTS = 50_000;
export const CHECKIN_CARD_CURRENCY = "EUR";
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

export const ARRIVAL_STATUS_LABELS: Record<HotelArrivalStatus, string> = {
  pending: "En attente",
  link_requested: "Lien demandé",
  link_received: "Lien reçu",
  paying: "Paiement en cours",
  paid: "Payé",
  vip_sent: "Mail VIP envoyé",
  blocked: "À traiter",
  closed: "Clôturé",
};

export const ARRIVAL_CHANNEL_LABELS: Record<HotelArrivalChannel, string> = {
  little_emperors: "Little Emperors",
  direct: "Direct",
  expedia: "Expedia",
};

const FRENCH_COUNTRIES = new Set([
  "fr",
  "france",
  "reunion",
  "guyane",
  "guyane francaise",
  "guadeloupe",
  "martinique",
  "mayotte",
  "saint-pierre-et-miquelon",
  "saint-barthelemy",
  "saint-martin",
  "polynesie francaise",
  "nouvelle-caledonie",
  "wallis-et-futuna",
]);

const COUNTRY_ISO: Record<string, string> = {
  fr: "FR",
  france: "FR",
  reunion: "RE",
  guyane: "GF",
  "guyane francaise": "GF",
  guadeloupe: "GP",
  martinique: "MQ",
  mayotte: "YT",
  "etats-unis": "US",
  "etats unis": "US",
  usa: "US",
  "united states": "US",
  "united states of america": "US",
  "royaume-uni": "GB",
  "royaume uni": "GB",
  uk: "GB",
  "united kingdom": "GB",
  angleterre: "GB",
  england: "GB",
  ecosse: "GB",
  scotland: "GB",
  italie: "IT",
  italy: "IT",
  espagne: "ES",
  spain: "ES",
  grece: "GR",
  greece: "GR",
  portugal: "PT",
  allemagne: "DE",
  germany: "DE",
  suisse: "CH",
  switzerland: "CH",
  belgique: "BE",
  belgium: "BE",
  "pays-bas": "NL",
  "pays bas": "NL",
  netherlands: "NL",
  autriche: "AT",
  austria: "AT",
  maroc: "MA",
  morocco: "MA",
  tunisie: "TN",
  tunisia: "TN",
  egypte: "EG",
  egypt: "EG",
  "emirats arabes unis": "AE",
  "united arab emirates": "AE",
  uae: "AE",
  dubai: "AE",
  qatar: "QA",
  "arabie saoudite": "SA",
  "saudi arabia": "SA",
  oman: "OM",
  jordanie: "JO",
  jordan: "JO",
  israel: "IL",
  thailande: "TH",
  thailand: "TH",
  japon: "JP",
  japan: "JP",
  maldives: "MV",
  singapour: "SG",
  singapore: "SG",
  indonesie: "ID",
  indonesia: "ID",
  bali: "ID",
  mexique: "MX",
  mexico: "MX",
  bresil: "BR",
  brazil: "BR",
  "afrique du sud": "ZA",
  "south africa": "ZA",
  turquie: "TR",
  turkey: "TR",
  turkiye: "TR",
  croatie: "HR",
  croatia: "HR",
  islande: "IS",
  iceland: "IS",
  norvege: "NO",
  norway: "NO",
  suede: "SE",
  sweden: "SE",
  danemark: "DK",
  denmark: "DK",
  irlande: "IE",
  ireland: "IE",
  canada: "CA",
  australie: "AU",
  australia: "AU",
  "nouvelle-zelande": "NZ",
  "new zealand": "NZ",
  chine: "CN",
  china: "CN",
  inde: "IN",
  india: "IN",
  vietnam: "VN",
  cambodge: "KH",
  cambodia: "KH",
  "sri lanka": "LK",
  seychelles: "SC",
  maurice: "MU",
  mauritius: "MU",
  monaco: "MC",
  luxembourg: "LU",
  malaisie: "MY",
  malaysia: "MY",
  philippines: "PH",
  "hong kong": "HK",
  "coree du sud": "KR",
  "south korea": "KR",
  fidji: "FJ",
  fiji: "FJ",
  "polynesie francaise": "PF",
  "nouvelle-caledonie": "NC",
};

export type ArrivalPlan =
  | { action: "wait" }
  | { action: "task"; note: string; reason: string }
  | { action: "pay" }
  | { action: "close" };

export type ArrivalTick = {
  status: HotelArrivalStatus;
  channel: HotelArrivalChannel;
  parisToday: string;
  nowMs: number;
  checkIn: string;
  checkOut: string;
  holidays: string[];
  emails: string[];
  amountCents: number | null;
  passportCount: number;
  travelerCount: number;
  requestedAtMs: number | null;
  relanceCount: number;
  lastRelanceAtMs: number | null;
  paymentUrl: string | null;
  bookingStatus: string;
  /** Absent : le séjour est encore ouvert. Passé : le cron n’enchaîne plus. */
  bookingEndDate?: string | null;
  cardId: string | null;
  cardClosed: boolean;
  blockedReason: string | null;
};

export function parisIsoDate(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function isoDate(value: string | null | undefined) {
  return (value || "").match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || "";
}

function weekday(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function isBusinessDay(iso: string, holidays: ReadonlySet<string>) {
  const day = weekday(iso);
  if (day === 0 || day === 6) return false;
  return !holidays.has(iso);
}

/** Le jour ouvré qui tombe `count` jours ouvrés avant le check-in. */
export function businessDaysBefore(checkIn: string, count: number, holidays: ReadonlySet<string>) {
  let cursor = addIsoDays(checkIn, -1);
  let left = count;
  for (let guard = 0; left > 0 && guard < 400; guard += 1) {
    if (isBusinessDay(cursor, holidays)) left -= 1;
    if (left === 0) return cursor;
    cursor = addIsoDays(cursor, -1);
  }
  return cursor;
}

export function nextBusinessDay(iso: string, holidays: ReadonlySet<string>) {
  let cursor = addIsoDays(iso, 1);
  for (let guard = 0; guard < 40 && !isBusinessDay(cursor, holidays); guard += 1) {
    cursor = addIsoDays(cursor, 1);
  }
  return cursor;
}

export function cardCloseDate(checkOut: string) {
  return addIsoDays(checkOut, 3);
}

export function foldCountry(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function countryIso(country: string) {
  const folded = foldCountry(country);
  if (!folded) return null;
  if (/^[a-z]{2}$/.test(folded)) return folded.toUpperCase();
  return COUNTRY_ISO[folded] || null;
}

export function hotelLanguage(country: string): "fr" | "en" {
  const folded = foldCountry(country);
  if (FRENCH_COUNTRIES.has(folded)) return "fr";
  const iso = countryIso(country);
  if (iso === "FR" || iso === "RE" || iso === "GP" || iso === "MQ" || iso === "GF" || iso === "YT" || iso === "PF" || iso === "NC") {
    return "fr";
  }
  return "en";
}

export function nagerHolidayUrl(year: number, iso: string) {
  return `https://date.nager.at/api/v3/PublicHolidays/${year}/${iso}`;
}

export function holidayDatesFromNager(json: unknown) {
  if (!Array.isArray(json)) return [];
  const dates: string[] = [];
  for (const row of json) {
    if (!row || typeof row !== "object") continue;
    const date = (row as { date?: unknown }).date;
    if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) dates.push(date);
  }
  return dates;
}

export function hotelChannel(input: {
  sourceFamily?: string | null;
  supplier?: string | null;
  leHotelId?: number | null;
}): HotelArrivalChannel {
  const family = (input.sourceFamily || "").toLowerCase();
  const supplier = (input.supplier || "").toLowerCase();
  if (family.includes("expedia") || supplier.includes("expedia") || /\btaap\b/.test(supplier)) return "expedia";
  if (family.includes("little") || input.leHotelId) return "little_emperors";
  return "direct";
}

export function parseMoneyToCents(value: string | number | null | undefined) {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    return Math.round(value * 100);
  }
  if (!value) return null;
  let normal = value.replace(/\s/g, "").replace(/[^\d,.-]/g, "");
  if (!normal) return null;
  const lastComma = normal.lastIndexOf(",");
  const lastDot = normal.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    normal = lastComma > lastDot ? normal.replace(/\./g, "").replace(",", ".") : normal.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const frac = normal.slice(lastComma + 1);
    normal = frac.length > 0 && frac.length <= 2 ? normal.replace(",", ".") : normal.replace(/,/g, "");
  }
  const amount = Number(normal);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

export function parseEurosToCents(value: string) {
  return parseMoneyToCents(value);
}

/** « 2400,00 EUR » : code ISO, sans séparateur de milliers — lisible par un hôtel étranger. */
export function formatArrivalAmount(cents: number, currency: string) {
  const major = centsToAmount(cents).toFixed(2).replace(".", ",");
  return `${major} ${currency || "EUR"}`;
}

export function leStayAmount(
  item: { checkIn: string; hotelName: string },
  rows: { checkIn: string | null; hotelName: string | null; total: string | null; currency: string | null }[]
) {
  const usable = rows
    .map((row) => {
      const cents = parseMoneyToCents(row.total);
      if (cents == null) return null;
      return {
        cents,
        currency: (row.currency || "EUR").toUpperCase(),
        checkIn: isoDate(row.checkIn),
        name: foldCountry(row.hotelName || ""),
      };
    })
    .filter((row): row is { cents: number; currency: string; checkIn: string; name: string } => Boolean(row));
  if (!usable.length) return null;
  if (usable.length === 1) return { cents: usable[0].cents, currency: usable[0].currency };
  const hotel = foldCountry(item.hotelName);
  const matched = usable.filter(
    (row) => (item.checkIn && row.checkIn === item.checkIn) || (hotel && row.name === hotel)
  );
  if (matched.length === 1) return { cents: matched[0].cents, currency: matched[0].currency };
  return null;
}

export function quotedAmount(input: {
  channel: HotelArrivalChannel;
  leCents: number | null;
  leCurrency: string | null;
  netCents: number | null;
  bookingCurrency: string | null;
}) {
  if (input.channel === "expedia") return { cents: CHECKIN_CARD_CENTS, currency: CHECKIN_CARD_CURRENCY };
  if (input.channel === "little_emperors") {
    return { cents: input.leCents, currency: input.leCurrency || input.bookingCurrency || "EUR" };
  }
  return { cents: input.netCents, currency: input.bookingCurrency || "EUR" };
}

/** Marge au-dessus du prix connu de l'hôtel. Le plafond carte n'invente pas ce prix. */
export const STAY_MARGIN = 1.3;

export type StayProvision = {
  baseCents: number;
  marginCents: number;
  ceilingCents: number;
  currency: string;
};

export function majorToCents(amount: number | null | undefined) {
  return parseMoneyToCents(amount);
}

export function provisionCeilingCents(baseCents: number) {
  if (!(baseCents > 0) || !Number.isFinite(baseCents)) return null;
  return Math.ceil((baseCents * 13) / 10);
}

function moneyCurrency(value: string | null | undefined, fallback = "EUR") {
  const code = (value || "").trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(code)) return code;
  const safe = (fallback || "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(safe) ? safe : "EUR";
}

export function documentMoney(details: Record<string, unknown> | null | undefined) {
  const raw = details?.document_amount;
  const cents =
    typeof raw === "number" || typeof raw === "string" ? parseMoneyToCents(raw) : null;
  const currencyRaw = details?.document_currency;
  const currency = typeof currencyRaw === "string" ? moneyCurrency(currencyRaw, "") : "";
  return { cents, currency: currency || null };
}

export function itemStayChannel(item: {
  supplier?: string | null;
  details?: Record<string, unknown> | null;
}): HotelArrivalChannel {
  const details = item.details || {};
  const family = typeof details.source_family === "string" ? details.source_family : "";
  let leHotelId: number | null = null;
  for (const key of ["le_hotel_id", "little_emperors_hotel_id", "hotel_id"]) {
    const value = details[key];
    if (typeof value === "number" && Number.isInteger(value) && value > 0) leHotelId = value;
    else if (typeof value === "string" && /^\d+$/.test(value)) leHotelId = Number(value);
    if (leHotelId) break;
  }
  return hotelChannel({ sourceFamily: family, supplier: item.supplier, leHotelId });
}

/** Prix connu, dans cet ordre : Little Emperors, montant du document, prix de la carte, net déjà saisi. */
export function stayProvision(input: {
  channel: HotelArrivalChannel;
  itemCents: number | null;
  documentCents: number | null;
  documentCurrency: string | null;
  leCents: number | null;
  leCurrency: string | null;
  netCents: number | null;
  savedBaseCents: number | null;
  bookingCurrency: string | null;
}): StayProvision | null {
  const bookingCurrency = moneyCurrency(input.bookingCurrency);
  let base: { cents: number; currency: string } | null = null;
  if (input.channel === "little_emperors" && input.leCents != null && input.leCents > 0) {
    base = { cents: input.leCents, currency: moneyCurrency(input.leCurrency, bookingCurrency) };
  }
  if (!base && input.documentCents != null && input.documentCents > 0) {
    base = { cents: input.documentCents, currency: moneyCurrency(input.documentCurrency, bookingCurrency) };
  }
  if (!base && input.itemCents != null && input.itemCents > 0) {
    base = { cents: input.itemCents, currency: bookingCurrency };
  }
  if (!base && input.netCents != null && input.netCents > 0) {
    base = { cents: input.netCents, currency: bookingCurrency };
  }
  if (!base && input.savedBaseCents != null && input.savedBaseCents > 0) {
    base = { cents: input.savedBaseCents, currency: bookingCurrency };
  }
  if (!base) return null;
  const ceilingCents = provisionCeilingCents(base.cents);
  if (ceilingCents == null) return null;
  return {
    baseCents: base.cents,
    marginCents: ceilingCents - base.cents,
    ceilingCents,
    currency: base.currency,
  };
}

export function shownStayProvision(
  item: { amount: number | null; supplier?: string | null; details?: Record<string, unknown> | null },
  arrival: {
    channel?: HotelArrivalChannel;
    amount_cents: number | null;
    net_cents: number | null;
    currency?: string | null;
  } | null,
  bookingCurrency: string | null
) {
  const channel = arrival?.channel || itemStayChannel(item);
  const document = documentMoney(item.details);
  const fromItem = stayProvision({
    channel,
    itemCents: majorToCents(item.amount),
    documentCents: document.cents,
    documentCurrency: document.currency,
    leCents: null,
    leCurrency: null,
    netCents: arrival?.net_cents ?? null,
    savedBaseCents: null,
    bookingCurrency,
  });
  if (channel === "little_emperors" && arrival?.amount_cents != null && arrival.amount_cents > 0) {
    return stayProvision({
      channel,
      itemCents: null,
      documentCents: null,
      documentCurrency: null,
      leCents: arrival.amount_cents,
      leCurrency: arrival.currency || bookingCurrency,
      netCents: null,
      savedBaseCents: null,
      bookingCurrency,
    });
  }
  return fromItem;
}

const SECRET_KEY = /pan|cvc|cvv|cryptogramme|card_number/i;

export function arrivalRowHasNoCardSecrets(row: Record<string, unknown>) {
  return !Object.keys(row).some((key) => SECRET_KEY.test(key));
}

export function cardLast4(pan: string) {
  const digits = pan.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : "";
}

/** Début masqué. Seuls les 4 derniers chiffres restent lisibles. */
export function maskedCardNumber(last4: string | null | undefined) {
  const tail = (last4 || "").replace(/\D/g, "").slice(-4);
  return `•••• •••• •••• ${tail.length === 4 ? tail : "••••"}`;
}

export function groupedPan(pan: string) {
  return pan.replace(/\D/g, "").replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

export type StayCardFace = {
  itemId: string;
  hotel: string;
  holder: string;
  last4: string | null;
  closed: boolean;
};

/** Le client ouvre sa carte depuis son séjour. L’agence garde le code. */
export function stayRevealNeedsAgencyCode(audience: "staff" | "client") {
  return audience === "staff";
}

export function stayCardFace(input: StayCardFace): StayCardFace {
  return {
    itemId: input.itemId,
    hotel: input.hotel,
    holder: input.holder,
    last4: input.last4 && /^\d{4}$/.test(input.last4) ? input.last4 : null,
    closed: input.closed,
  };
}

/** Une seule carte pour le voyage. Le nom d’hôtel reste s’il n’y en a qu’un. */
export function tripStayCard(faces: StayCardFace[]): StayCardFace | null {
  const usable = faces.filter((face) => face.itemId);
  if (!usable.length) return null;
  const open = usable.filter((face) => !face.closed);
  const chosen = open[0] || usable[0];
  const names = [...new Set(usable.map((face) => face.hotel.trim()).filter(Boolean))];
  return stayCardFace({
    ...chosen,
    hotel: names.length === 1 ? names[0] : "",
  });
}

export function cardSecretsFromPayload(json: unknown) {
  if (!json || typeof json !== "object") return null;
  const row = json as Record<string, unknown>;
  const pan = digits(row.pan);
  const cvc = digits(row.cvv ?? row.cvc);
  const month = Number(row.expiryMonth);
  const year = Number(row.expiryYear);
  if (pan.length < 12 || cvc.length < 3 || !(month >= 1 && month <= 12) || !(year >= 2000)) return null;
  return { pan, expiry: `${String(month).padStart(2, "0")}/${String(year).slice(-2)}`, cvc };
}

function digits(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).replace(/\D/g, "") : "";
}

export function emailAddress(value: string) {
  const wrapped = value.match(/<([^>]+)>/);
  return (wrapped?.[1] || value).trim().toLowerCase();
}

const SKIP_URL =
  /little-?emperors|expedia|travelba|facebook\.com|instagram\.com|mailto:|unsubscribe|\.(png|jpe?g|gif|webp|svg|css|js)(\?|$)/i;
const PAY_URL = /pay|payment|checkout|invoice|secure|adyen|stripe|worldpay|pci|reglement|paiement|authoriz/i;

export function paymentUrlFromText(text: string) {
  const found = text.match(/https:\/\/[^\s<>"')\]]+/gi) || [];
  const clean = found
    .map((url) => url.replace(/[.,;]+$/, ""))
    .filter((url) => url.length < 2000 && !SKIP_URL.test(url));
  return clean.find((url) => PAY_URL.test(url)) || clean[0] || null;
}

export function replyPaymentUrl(input: {
  from: string;
  receivedAtMs: number;
  requestedAtMs: number;
  hotelEmails: string[];
  body: string;
  subject: string;
}) {
  if (!(input.receivedAtMs >= input.requestedAtMs)) return null;
  const from = emailAddress(input.from);
  const known = new Set(input.hotelEmails.map(emailAddress).filter(Boolean));
  if (!from || !known.has(from)) return null;
  return paymentUrlFromText(`${input.subject}\n${input.body}`);
}

export function principalGuest(input: {
  travelers: { first_name: string | null; last_name: string | null; is_account_holder: boolean }[];
  holder?: { first_name: string; last_name: string } | null;
}) {
  const named = input.travelers.filter((row) => (row.first_name || "").trim() || (row.last_name || "").trim());
  const lead = named.find((row) => row.is_account_holder) || named[0];
  const firstName = (lead?.first_name || input.holder?.first_name || "").trim();
  const lastName = (lead?.last_name || input.holder?.last_name || "").trim();
  return { firstName, lastName };
}

export function formatStayDate(iso: string, lang: "fr" | "en") {
  if (!iso) return "";
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export type ArrivalMail = {
  subject: string;
  text: string;
};

/** Entrée et sortie des courriers hôtel : la maison, brève, une demande, un remerciement. */
export function hotelMailFrame(lang: "fr" | "en", relance?: boolean) {
  if (lang === "fr") {
    return {
      open: relance
        ? [
            "Chère équipe,",
            "",
            "Nous nous permettons de revenir vers vous, de la part de Travel Business Agency.",
            "",
            "Nous n'avons pas encore reçu votre retour, et nous nous permettons cette relance.",
          ]
        : ["Chère équipe,", "", "Nous avons le plaisir de vous écrire de la part de Travel Business Agency."],
      close: [
        "Nous vous remercions de l'attention que vous porterez à ce séjour.",
        "",
        "Bien à vous,",
        "Travel Business Agency",
      ],
    };
  }
  return {
    open: relance
      ? [
          "Dear team,",
          "",
          "We are writing once more, from Travel Business Agency.",
          "",
          "We have not yet received your reply, and would be most grateful if you could come back to us.",
        ]
      : ["Dear team,", "", "We are pleased to write to you from Travel Business Agency."],
    close: ["With our thanks for the welcome you will extend to our guest.", "", "Best regards,", "Travel Business Agency"],
  };
}

export function linkRequestMail(input: {
  lang: "fr" | "en";
  hotel: string;
  reference: string;
  checkIn: string;
  checkOut: string;
  amount: string | null;
  relance?: boolean;
}): ArrivalMail {
  const stay = `${formatStayDate(input.checkIn, input.lang)} – ${formatStayDate(input.checkOut, input.lang)}`;
  const ref = input.reference || "—";
  const frame = hotelMailFrame(input.lang, input.relance);
  if (input.lang === "fr") {
    const lines = [
      ...frame.open,
      "",
      "Nous vous serions reconnaissants de nous adresser le lien de paiement de la réservation de notre client.",
      "",
      `Séjour à ${input.hotel}, du ${stay}.`,
      `Référence de confirmation : ${ref}.`,
    ];
    if (input.amount) lines.push(`Montant à régler : ${input.amount}.`);
    lines.push("", ...frame.close);
    return {
      subject: `${input.relance ? "Relance — " : ""}Lien de paiement — ${input.hotel} — ${ref}`,
      text: lines.join("\n"),
    };
  }
  const lines = [
    ...frame.open,
    "",
    "We would be grateful if you could send us the payment link for our guest's reservation.",
    "",
    `Stay at ${input.hotel}, ${stay}.`,
    `Confirmation: ${ref}.`,
  ];
  if (input.amount) lines.push(`Amount due: ${input.amount}.`);
  lines.push("", ...frame.close);
  return {
    subject: `${input.relance ? "Follow-up — " : ""}Payment link — ${input.hotel} — ${ref}`,
    text: lines.join("\n"),
  };
}

export function vipMail(input: {
  lang: "fr" | "en";
  hotel: string;
  reference: string;
  checkIn: string;
  checkOut: string;
  card: { holder: string; pan: string; expiry: string; cvc: string } | null;
}): ArrivalMail {
  const stay = `${formatStayDate(input.checkIn, input.lang)} – ${formatStayDate(input.checkOut, input.lang)}`;
  const ref = input.reference || "—";
  const frame = hotelMailFrame(input.lang);
  if (input.lang === "fr") {
    const card = input.card
      ? [
          "",
          "Carte pour l'enregistrement :",
          `Titulaire : ${input.card.holder}`,
          `Numéro : ${input.card.pan}`,
          `Expiration : ${input.card.expiry}`,
          `Cryptogramme : ${input.card.cvc}`,
        ]
      : [];
    return {
      subject: `Arrivée VIP — ${input.hotel} — ${ref}`,
      text: [
        ...frame.open,
        "",
        "Nous vous serions reconnaissants de signaler cette arrivée à vos équipes.",
        "",
        `Notre client séjourne à ${input.hotel}, du ${stay} (confirmation ${ref}).`,
        "",
        "Nous vous prions de préparer un accueil VIP dans la chambre. Un surclassement, s'il peut être envisagé à l'arrivée selon les disponibilités de la maison, serait très apprécié.",
        "",
        "Les documents d'identité sont joints, afin que la chambre soit prête dès l'arrivée.",
        ...card,
        "",
        ...frame.close,
      ].join("\n"),
    };
  }
  const card = input.card
    ? [
        "",
        "Card for check-in:",
        `Cardholder: ${input.card.holder}`,
        `Number: ${input.card.pan}`,
        `Expiry: ${input.card.expiry}`,
        `Security code: ${input.card.cvc}`,
      ]
    : [];
  return {
    subject: `VIP arrival — ${input.hotel} — ${ref}`,
    text: [
      ...frame.open,
      "",
      "We would be most grateful if you could note this arrival with your team on property.",
      "",
      `Our guest is staying at ${input.hotel}, ${stay} (confirmation ${ref}).`,
      "",
      "Kindly arrange VIP welcome amenities in the room. An upgrade, should one be available upon arrival, would be greatly appreciated.",
      "",
      "Identity documents are attached, so the room may be ready upon arrival.",
      ...card,
      "",
      ...frame.close,
    ].join("\n"),
  };
}

export function classifyPaymentPage(input: { ok: boolean; url: string; body: string }) {
  if (!input.url.startsWith("https://") || !input.ok) return "failed" as const;
  const hay = `${input.url}\n${input.body.slice(0, 8000)}`;
  if (/3d\s*secure|three-d|acs\.|creq|pareq|verified by visa|securecode|authentication required|challenge/i.test(hay)) {
    return "needs_agent" as const;
  }
  if (/payment\s+(successful|received|confirmed)|paiement\s+(reçu|confirme|confirmé)|thank you for your payment/i.test(hay)) {
    return "paid" as const;
  }
  return "needs_agent" as const;
}

function gapNote(tick: ArrivalTick) {
  const parts: string[] = [];
  if (tick.channel !== "expedia" && tick.amountCents == null) parts.push("Montant manquant.");
  if (tick.travelerCount > 0 && tick.passportCount < tick.travelerCount) {
    parts.push("Passeport manquant pour au moins un voyageur.");
  }
  return parts.join(" ") || null;
}

/** Le cron ne contacte plus l’hôtel. L’agence reprend la main. */
function pausedHotelMail(purpose: string, extra: string | null = null): ArrivalPlan {
  const note = ["Le mail automatique vers l’hôtel est en pause.", purpose, extra].filter(Boolean).join(" ");
  return { action: "task", note, reason: "manual" };
}

function holidaySet(tick: ArrivalTick) {
  return new Set(tick.holidays);
}

export function planHotelArrival(tick: ArrivalTick): ArrivalPlan {
  const holidays = holidaySet(tick);
  const closeOn = tick.checkOut ? cardCloseDate(tick.checkOut) : "";
  const stayOver = Boolean(closeOn && tick.parisToday >= closeOn);
  if (tick.cardId && !tick.cardClosed && (stayOver || tick.bookingStatus === "cancelled")) return { action: "close" };
  if (tick.status === "closed") return { action: "wait" };
  if (tick.bookingStatus !== "confirmed") return { action: "wait" };
  if (tick.bookingEndDate && !stayDatesOpen(tick.bookingEndDate, tick.parisToday)) return { action: "wait" };
  if (tick.status === "vip_sent") return { action: "wait" };
  if (tick.status === "blocked" && tick.blockedReason === "no_email" && tick.emails.length > 0) {
    return planHotelArrival({ ...tick, status: "pending", blockedReason: null });
  }
  if (tick.status === "blocked" && tick.blockedReason === "amount" && tick.amountCents != null && tick.paymentUrl) {
    return { action: "pay" };
  }
  if (tick.status === "blocked" && tick.blockedReason === "limit" && tick.cardId) {
    return pausedHotelMail("Transmettre le traitement VIP autrement.", gapNote(tick));
  }
  if (tick.status === "blocked") return { action: "wait" };
  if (tick.status === "paid") return pausedHotelMail("Transmettre le traitement VIP autrement.", gapNote(tick));
  if (tick.paymentUrl && (tick.status === "link_requested" || tick.status === "link_received" || tick.status === "paying")) {
    return { action: "pay" };
  }
  if (tick.status === "link_requested") return relancePlan(tick, holidays);
  if (!tick.checkIn) return { action: "task", note: "Date de check-in manquante.", reason: "dates" };
  const due = businessDaysBefore(tick.checkIn, 2, holidays);
  if (tick.parisToday < due) return { action: "wait" };
  if (tick.checkOut && tick.parisToday > tick.checkOut) {
    return { action: "task", note: "Le check-out est passé, l'envoi n'a pas eu lieu.", reason: "late" };
  }
  if (!tick.emails.length) {
    return { action: "task", note: "Aucun e-mail d'hôtel.", reason: "no_email" };
  }
  const note = gapNote(tick);
  if (tick.channel === "expedia") return pausedHotelMail("Transmettre le traitement VIP autrement.", note);
  return pausedHotelMail("Demander le lien de paiement autrement.", note);
}

function relancePlan(tick: ArrivalTick, holidays: ReadonlySet<string>): ArrivalPlan {
  const note = gapNote(tick);
  if (tick.relanceCount <= 0) {
    if (tick.requestedAtMs != null && tick.nowMs >= tick.requestedAtMs + FOUR_HOURS_MS) {
      return pausedHotelMail("Relancer l’hôtel autrement.", note);
    }
    return { action: "wait" };
  }
  if (tick.relanceCount === 1) {
    const fromMs = tick.lastRelanceAtMs ?? tick.requestedAtMs ?? tick.nowMs;
    const from = parisIsoDate(new Date(fromMs));
    if (tick.parisToday >= nextBusinessDay(from, holidays)) return pausedHotelMail("Relancer l’hôtel autrement.", note);
    return { action: "wait" };
  }
  return { action: "task", note: "L'hôtel n'a pas renvoyé de lien de paiement.", reason: "no_reply" };
}
