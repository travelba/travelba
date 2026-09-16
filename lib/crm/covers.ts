import type { CrmBooking } from "@/lib/crm/types";

const UNSPLASH = (id: string, width = 1600) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&h=900&q=80`;

const BY_KEYWORD: Array<[RegExp, string]> = [
  [/papagayo|guanacaste|andaz|nicoya|costa rica|heredia|belen|san jos[eé]|sjo|arenal|manuel antonio/i, "photo-1687304527563-74c180d8ced7"],
  [/bocas|colon|panama|casco|tocumen|pty|panama city/i, "photo-1507525428034-b723cf961d3e"],
  [/lugano|tessin|ticino|lago/i, "photo-1756755510958-9f02ec73445c"],
  [/suisse|switzerland|alpes|alps|zermatt/i, "photo-1661302504642-d74954f9fb6b"],
  [/marrakech|maroc|morocco|rak|menara|atlas/i, "photo-1677837488142-a85ffbffe408"],
  [/miami|floride|florida|south beach/i, "photo-1507525428034-b723cf961d3e"],
  [/venise|venice|venezia/i, "photo-1523906834658-6e24ef2386f9"],
  [/paris|france|provence|cdg/i, "photo-1502602898657-3e91760cbb34"],
  [/bali|indon|lombok/i, "photo-1537996194471-e657df975ab4"],
  [/safari|tanzanie|kenya|africa|serengeti/i, "photo-1516426122078-c23e76319801"],
  [/maldives|seychell|bora|tahiti|polyn/i, "photo-1514282401047-d79a71a590e8"],
  [/new york|new-york|manhattan/i, "photo-1496442226666-8d4d0e62e6e9"],
  [/grèce|grece|greece|santorin|mykonos/i, "photo-1533105079780-92b9be482077"],
];

const FALLBACKS = [
  "photo-1488646953014-85cb44e25828",
  "photo-1476514525535-07fb3b4ae5f1",
  "photo-1469854523086-cc02fe5d8800",
  "photo-1507525428034-b723cf961d3e",
];

function hashKey(value: string) {
  let n = 0;
  for (let i = 0; i < value.length; i++) n = (n + value.charCodeAt(i) * (i + 1)) % 997;
  return n;
}

export function bookingCoverUrl(
  booking: Pick<CrmBooking, "destination" | "title" | "cover_image_path">,
  width = 1600
) {
  if (booking.cover_image_path) {
    return `/api/files?path=${encodeURIComponent(booking.cover_image_path)}`;
  }
  const key = `${booking.destination || ""} ${booking.title || ""}`.trim() || "voyage";
  for (const [re, id] of BY_KEYWORD) {
    if (re.test(key)) return UNSPLASH(id, width);
  }
  return UNSPLASH(FALLBACKS[hashKey(key) % FALLBACKS.length], width);
}
