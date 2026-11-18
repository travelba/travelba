import { nightsBetween, type RoomGuests } from "./limits";
import { sellFromNet } from "./pricing";

/**
 * Libellés de repas au plus égaux au code ETG.
 * Un code inconnu reste le code : on ne l’améliore pas.
 */
const MEAL_LABELS: Record<string, string> = {
  nomeal: "Sans repas",
  breakfast: "Petit-déjeuner",
  "american-breakfast": "Petit-déjeuner",
  "asian-breakfast": "Petit-déjeuner",
  "breakfast-buffet": "Petit-déjeuner",
  "chinese-breakfast": "Petit-déjeuner",
  "continental-breakfast": "Petit-déjeuner",
  "english-breakfast": "Petit-déjeuner",
  "irish-breakfast": "Petit-déjeuner",
  "israeli-breakfast": "Petit-déjeuner",
  "japanese-breakfast": "Petit-déjeuner",
  "scandinavian-breakfast": "Petit-déjeuner",
  "scottish-breakfast": "Petit-déjeuner",
  lunch: "Déjeuner",
  dinner: "Dîner",
  "half-board": "Demi-pension",
  "half-board-lunch": "Demi-pension (déjeuner)",
  "half-board-dinner": "Demi-pension (dîner)",
  "full-board": "Pension complète",
  "all-inclusive": "Tout compris",
  "soft-all-inclusive": "Tout compris, boissons non alcoolisées",
  "super-all-inclusive": "Tout compris",
  "ultra-all-inclusive": "Tout compris",
};

export function mealLabel(value: string | null | undefined): { code: string; label: string } {
  const code = (value || "").trim();
  if (!code) return { code: "", label: "Repas non précisé" };
  return { code, label: MEAL_LABELS[code] || code };
}

export const RG_EXT_FIELDS = [
  "class",
  "quality",
  "sex",
  "bathroom",
  "bedding",
  "family",
  "capacity",
  "club",
  "bedrooms",
  "balcony",
  "view",
  "floor",
] as const;

export type RgExt = Partial<Record<(typeof RG_EXT_FIELDS)[number], number>>;

export function rgExtEqual(left: RgExt | null | undefined, right: RgExt | null | undefined) {
  if (!left || !right) return false;
  return RG_EXT_FIELDS.every((field) => Number(left[field] ?? 0) === Number(right[field] ?? 0));
}

export type RoomGroupStatic = {
  name?: string;
  rg_ext?: RgExt;
  images?: unknown;
  images_ext?: unknown;
  room_amenities?: string[];
};

export function matchRoomGroup(rg: RgExt | null | undefined, groups: RoomGroupStatic[]) {
  if (!rg) return null;
  return groups.find((group) => rgExtEqual(rg, group.rg_ext)) || null;
}

export type TaxLine = {
  name: string;
  label: string;
  amount: string;
  currency_code: string;
  included_by_supplier: boolean;
};

const TAX_LABELS: Record<string, string> = {
  city_tax: "Taxe de séjour",
  electricity_fee: "Électricité",
  environmental_fee: "Éco-contribution",
  extra_person_fee: "Personne supplémentaire",
  government_tax: "Taxe gouvernementale",
  hotel_fee: "Frais d’hôtel",
  luxury_tax: "Taxe de luxe",
  mandatory_fee: "Frais obligatoires",
  mandatory_tax: "Taxe obligatoire",
  occupancy_tax: "Taxe d’occupation",
  resort_fee: "Frais de resort",
  service_fee: "Frais de service",
  tourism_fee: "Taxe de tourisme",
  transfer_fee: "Transfert",
  vat: "TVA",
  cleaning_fee: "Frais de ménage",
};

/** `city_tax` devient « Taxe de séjour ». Un code inconnu n’est plus en snake_case. */
export function taxLabel(code: string | null | undefined): string {
  const key = (code || "").trim().toLowerCase();
  if (!key || key === "taxe") return "Taxe";
  if (TAX_LABELS[key]) return TAX_LABELS[key];
  return key.replace(/_/g, " ").replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

export function partitionTaxes(taxes: unknown): { included: TaxLine[]; excluded: TaxLine[] } {
  const included: TaxLine[] = [];
  const excluded: TaxLine[] = [];
  if (!Array.isArray(taxes)) return { included, excluded };
  for (const tax of taxes) {
    if (!tax || typeof tax !== "object") continue;
    const row = tax as Record<string, unknown>;
    const name = String(row.name || "taxe");
    const line: TaxLine = {
      name,
      label: taxLabel(name),
      amount: String(row.amount || ""),
      currency_code: String(row.currency_code || ""),
      included_by_supplier: row.included_by_supplier !== false,
    };
    if (row.included_by_supplier === false) excluded.push(line);
    else included.push(line);
  }
  return { included, excluded };
}

/**
 * L’heure reste celle de la réponse ETG. Le bac à sable n’envoie pas de suffixe :
 * ces horloges sont UTC. On ne les décale pas vers Paris.
 */
export function formatApiDeadline(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  const zoned = /^(.+?)(Z|[+-]\d{2}:\d{2})$/.exec(raw);
  if (zoned) {
    const clock = zoned[1].replace("T", " ");
    return zoned[2] === "Z" ? `${clock} UTC` : `${clock} ${zoned[2]}`;
  }
  return `${raw.replace("T", " ")} UTC`;
}

export type PenaltyView = {
  text: string;
};

export type Policy = {
  start_at?: string | null;
  end_at?: string | null;
  amount_show?: string;
  amount_charge?: string;
  currency?: string;
};

function penaltyMoney(policy: Policy, showCurrency: string, chargeCurrency: string) {
  const show = `${policy.amount_show || policy.amount_charge || "0"} ${showCurrency}`.trim();
  const charge = policy.amount_charge;
  if (!charge || !chargeCurrency || chargeCurrency === showCurrency) return show;
  return `${show} (débit ${charge} ${chargeCurrency})`;
}

export function penaltyLines(
  policies: Policy[] | null | undefined,
  freeBefore: string | null | undefined,
  currency: string,
  chargeCurrency = ""
): PenaltyView[] {
  const lines: PenaltyView[] = [];
  if (freeBefore) {
    const when = formatApiDeadline(freeBefore);
    lines.push({
      text: when
        ? `Annulation sans frais jusqu’au ${when}.`
        : "Annulation sans frais jusqu’à la date indiquée par Ratehawk.",
    });
  } else {
    lines.push({ text: "Pas d’annulation sans frais. Les frais s’appliquent dès l’annulation." });
  }
  for (const policy of policies || []) {
    const start = formatApiDeadline(policy.start_at);
    const end = formatApiDeadline(policy.end_at);
    const money = penaltyMoney(policy, currency, chargeCurrency);
    if (!start && end) lines.push({ text: `Jusqu’au ${end} : ${money}.` });
    else if (start && end) lines.push({ text: `Du ${start} au ${end} : ${money}.` });
    else if (start && !end) lines.push({ text: `À partir du ${start} : ${money}.` });
  }
  return lines;
}

export function imageUrl(template: string) {
  return template.replace("{size}", "640x400");
}

/** Photos ETG : chaîne `{size}`, ou objet `{ url }` (`images` et `images_ext`). */
export function collectImageUrls(value: unknown, limit = 12): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const push = (raw: unknown) => {
    if (urls.length >= limit || raw == null) return;
    if (Array.isArray(raw)) {
      for (const item of raw) push(item);
      return;
    }
    let template = "";
    if (typeof raw === "string") template = raw.trim();
    else if (typeof raw === "object") {
      const row = raw as Record<string, unknown>;
      const candidate = row.url ?? row.tmpl ?? row.src;
      if (typeof candidate === "string") template = candidate.trim();
    }
    if (!template || seen.has(template)) return;
    seen.add(template);
    urls.push(imageUrl(template));
  };
  push(value);
  return urls;
}

/** La colonne `images` prime. Sinon les photos du contenu sont dans `images_ext`. */
export function preferHotelImages(stored: unknown, extended: unknown, limit = 12) {
  const fromColumn = collectImageUrls(stored, limit);
  if (fromColumn.length) return fromColumn;
  return collectImageUrls(extended, limit);
}

const POLICY_CATEGORY: Record<string, string> = {
  add_fee: "Frais supplémentaires",
  check_in_check_out: "Arrivée et départ",
  children: "Enfants",
  children_meal: "Repas enfants",
  cot: "Lit bébé",
  deposit: "Caution",
  extra_bed: "Lit supplémentaire",
  internet: "Internet",
  meal: "Repas",
  no_show: "Non-présentation",
  parking: "Parking",
  pets: "Animaux",
  shuttle: "Navette",
  visa: "Visa",
};

const POLICY_TOKEN: Record<string, string> = {
  after_midday: "après midi",
  airport: "aéroport",
  available: "disponible",
  before_midday: "avant midi",
  breakage: "casse",
  breakfast: "petit-déjeuner",
  card: "par carte",
  cash: "en espèces",
  early: "arrivée anticipée",
  early_checkin: "arrivée anticipée",
  fixed: "montant fixe",
  gt_5kg: "plus de 5 kg",
  hotel: "dans l’hôtel",
  included: "inclus",
  late: "départ tardif",
  late_checkout: "départ tardif",
  lt_5kg: "moins de 5 kg",
  no: "non admis",
  not_included: "non inclus",
  off_side: "à l’extérieur",
  on_side: "sur place",
  one_way: "aller simple",
  per_car_per_night: "par voiture et par nuit",
  per_car_per_stay: "par voiture et par séjour",
  per_guest_per_night: "par personne et par nuit",
  per_guest_per_stay: "par personne et par séjour",
  per_hour: "par heure",
  per_room_per_night: "par chambre et par nuit",
  per_room_per_stay: "par chambre et par séjour",
  per_week: "par semaine",
  percent: "pourcentage",
  room: "dans la chambre",
  service: "service",
  support_enable: "assistance possible",
  television: "télévision",
  two_ways: "aller-retour",
  unavailable: "indisponible",
  wired: "filaire",
  wireless: "sans fil",
  yes: "admis",
};

const POLICY_SKIP = new Set(["inclusion", "availability", "price", "currency", "price_unit", "age_start", "age_end"]);

function policyToken(value: string) {
  const key = value.trim();
  if (!key || key === "unspecified") return "";
  return POLICY_TOKEN[key] || key.replace(/_/g, " ");
}

function policyEntryLine(category: string, entry: Record<string, unknown>): string | null {
  const bits: string[] = [];
  const inclusion = typeof entry.inclusion === "string" ? entry.inclusion : typeof entry.availability === "string" ? entry.availability : "";
  const inclusionText = policyToken(inclusion);
  if (inclusionText && inclusion !== "unspecified") bits.push(inclusionText);
  if (typeof entry.age_start === "number" && typeof entry.age_end === "number") {
    bits.push(`de ${entry.age_start} à ${entry.age_end} ans`);
  }
  const price = entry.price == null ? "" : String(entry.price).trim();
  const currency = typeof entry.currency === "string" ? entry.currency.trim() : "";
  const unitKey = typeof entry.price_unit === "string" ? entry.price_unit : "";
  const unit = unitKey && unitKey !== "unspecified" ? policyToken(unitKey) : "";
  const priceNumber = Number(price);
  const priced = price !== "" && Number.isFinite(priceNumber) && !(priceNumber === 0 && inclusion !== "not_included");
  if (priced) bits.push([price, currency, unit].filter(Boolean).join(" "));
  for (const [key, value] of Object.entries(entry)) {
    if (POLICY_SKIP.has(key)) continue;
    if (key === "amount" && typeof value === "number") {
      if (value > 0) bits.push(String(value));
      continue;
    }
    if (typeof value !== "string" && typeof value !== "number") continue;
    const text = policyToken(String(value));
    if (text) bits.push(text);
  }
  if (!bits.length) return null;
  const label = POLICY_CATEGORY[category] || category.replace(/_/g, " ");
  return `${label} : ${bits.join(", ")}.`;
}

export function plainPolicyText(value: string): string[] {
  return value
    .replace(/<li[^>]*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** `metapolicy_struct` en phrases. Les tableaux vides et les valeurs `unspecified` ne sortent pas. */
export function metapolicyLines(struct: unknown, extra: unknown): string[] {
  const lines: string[] = [];
  if (struct && typeof struct === "object" && !Array.isArray(struct)) {
    for (const [key, value] of Object.entries(struct as Record<string, unknown>)) {
      const entries = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
      for (const entry of entries) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
        const line = policyEntryLine(key, entry as Record<string, unknown>);
        if (line) lines.push(line);
      }
      if (typeof value === "string") {
        const text = policyToken(value);
        if (text) lines.push(`${POLICY_CATEGORY[key] || key.replace(/_/g, " ")} : ${text}.`);
      }
    }
  }
  if (typeof extra === "string") lines.push(...plainPolicyText(extra));
  return lines;
}

/** Un slug (`conrad_los_angeles`) ou un hid n’est pas un nom d’hôtel. */
export function isTechnicalHotelName(value: string, hid?: number) {
  const name = value.trim();
  if (!name) return true;
  if (hid != null && (name === String(hid) || name === `Hôtel ${hid}`)) return true;
  return /^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(name);
}

export function publicHotelName(stored: string | null | undefined, live: string | null | undefined, hid: number) {
  for (const value of [stored, live]) {
    const name = (value || "").trim();
    if (name && !isTechnicalHotelName(name, hid)) return name;
  }
  return "Hôtel";
}

export function clockLabel(value: string | null | undefined) {
  const raw = (value || "").trim();
  const match = /^(\d{2}):(\d{2})/.exec(raw);
  return match ? `${match[1]}:${match[2]}` : raw || null;
}

export function stayLine(checkin: string, checkout: string, guests: RoomGuests[]) {
  const nights = nightsBetween(checkin, checkout);
  const rooms = guests.length;
  const adults = guests.reduce((sum, room) => sum + (Number.isFinite(room.adults) ? room.adults : 0), 0);
  const children = guests.reduce((sum, room) => sum + (Array.isArray(room.children) ? room.children.length : 0), 0);
  const parts = [
    nights == null ? null : nights > 1 ? `${nights} nuits` : `${nights} nuit`,
    rooms > 1 ? `${rooms} chambres` : `${rooms} chambre`,
    adults > 1 ? `${adults} adultes` : `${adults} adulte`,
  ].filter((part): part is string => Boolean(part));
  if (children === 1) parts.push("1 enfant");
  else if (children > 1) parts.push(`${children} enfants`);
  return parts.join(" · ");
}

export function starLabel(count: number | null | undefined) {
  if (count == null || !Number.isInteger(count) || count < 1 || count > 5) return null;
  return count > 1 ? `${count} étoiles` : "1 étoile";
}

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function titledParagraphs(value: unknown): { title: string; text: string }[] {
  if (!Array.isArray(value)) return [];
  const blocks: { title: string; text: string }[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as { title?: unknown; paragraphs?: unknown };
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const paragraphs = Array.isArray(row.paragraphs) ? row.paragraphs : [];
    const text = paragraphs
      .filter((paragraph): paragraph is string => typeof paragraph === "string")
      .map(stripTags)
      .filter(Boolean)
      .join(" ");
    if (text) blocks.push({ title, text });
  }
  return blocks;
}

export function amenityLines(groups: unknown): string[] {
  if (!Array.isArray(groups)) return [];
  const lines: string[] = [];
  const seen = new Set<string>();
  const push = (value: unknown, paid: boolean) => {
    if (typeof value !== "string") return;
    const label = taxLabel(value.replace(/\s+/g, " ").trim());
    const line = paid ? `${label}, payant` : label;
    const key = line.toLowerCase();
    if (!label || label === "Taxe" || seen.has(key)) return;
    seen.add(key);
    lines.push(line);
  };
  for (const group of groups) {
    if (!group || typeof group !== "object") continue;
    const row = group as { amenities?: unknown; non_free_amenities?: unknown };
    if (Array.isArray(row.amenities)) for (const amenity of row.amenities) push(amenity, false);
    if (Array.isArray(row.non_free_amenities)) for (const amenity of row.non_free_amenities) push(amenity, true);
  }
  return lines;
}

export type HotelPageFacts = {
  name: string;
  address: string | null;
  star_rating: number | null;
  check_in_time: string | null;
  check_out_time: string | null;
  description: { title: string; text: string }[];
  amenities: string[];
  policies: string[];
  images: string[];
};

export function readHotelFacts(
  row: {
    name?: unknown;
    address?: unknown;
    star_rating?: unknown;
    check_in_time?: unknown;
    check_out_time?: unknown;
    metapolicy_struct?: unknown;
    metapolicy_extra_info?: unknown;
    description_struct?: unknown;
    amenity_groups?: unknown;
    policy_struct?: unknown;
    images?: unknown;
    images_ext?: unknown;
  } | null,
  hid: number
): HotelPageFacts | null {
  if (!row) return null;
  const stars = row.star_rating == null || row.star_rating === "" ? Number.NaN : Number(row.star_rating);
  const address = typeof row.address === "string" ? row.address.trim() : "";
  const policies = [
    ...metapolicyLines(row.metapolicy_struct, row.metapolicy_extra_info),
    ...titledParagraphs(row.policy_struct).map((block) => (block.title ? `${block.title}. ${block.text}` : block.text)),
  ];
  return {
    name: publicHotelName(typeof row.name === "string" ? row.name : null, null, hid),
    address: address || null,
    star_rating: Number.isInteger(stars) && stars >= 0 && stars <= 5 ? stars : null,
    check_in_time: clockLabel(typeof row.check_in_time === "string" ? row.check_in_time : null),
    check_out_time: clockLabel(typeof row.check_out_time === "string" ? row.check_out_time : null),
    description: titledParagraphs(row.description_struct),
    amenities: amenityLines(row.amenity_groups),
    policies,
    images: preferHotelImages(row.images, row.images_ext, 12),
  };
}

/** Le débit contrat et le prix affiché viennent de la même option. On ne convertit pas. */
export const CHARGE_EXPLANATION =
  "Le montant débité sur le dépôt est celui du contrat (amount). Le prix affiché est le montant renvoyé pour la devise demandée (show_amount). Les deux chiffres viennent de Ratehawk : l’agence ne convertit pas l’un dans l’autre.";

export type PaymentType = {
  type?: string;
  amount?: string;
  show_amount?: string;
  currency_code?: string;
  show_currency_code?: string;
  is_need_credit_card_data?: boolean;
  is_need_cvc?: boolean;
  tax_data?: { taxes?: unknown };
  cancellation_penalties?: { policies?: Policy[]; free_cancellation_before?: string | null };
};

/** Contrat B2B : seul `deposit` est payable. `hotel` et `now` ne sont pas proposés. */
export function pickPaymentType(types: PaymentType[] | null | undefined, _preferred?: string): PaymentType | null {
  return (types || []).find((row) => row.type === "deposit") ?? null;
}

export function shownPrice(payment: PaymentType | null, margin: number) {
  const net = payment?.show_amount || payment?.amount || null;
  const currency = payment?.show_currency_code || payment?.currency_code || "";
  const netNumber = net == null ? null : Number(net);
  const sell = netNumber != null && Number.isFinite(netNumber) ? sellFromNet(netNumber, margin) : null;
  return { net, currency, sell };
}
