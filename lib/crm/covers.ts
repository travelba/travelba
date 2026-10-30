import type { CrmBooking } from "@/lib/crm/types";
import { coverQuery, isOriginHub, stayArrivalPlaces } from "@/lib/crm/carnet";
import {
  cityCoverPhoto,
  cityGeneratedCoverId,
  countryCodeForPlace,
  countryCoverPhoto,
  countryLandmarkPhotoAllowed,
  coverSearchHits,
  generatedPlaceAllowed,
  isCountryName,
  isKnownCatalogPhoto,
  lookupCoverPhoto,
} from "@/lib/crm/cover-catalog";
import { tripCityPlan, type TripStep } from "@/lib/crm/layover";

/** Photo retouchée du catalogue, ou rien (fond marine) si le fichier n’existe pas. */
export function catalogCoverUrl(photoId: string) {
  return `/api/covers/${photoId}`;
}

const COVER_SRC_WIDTHS = [96, 192, 480, 960, 1600];

/** Largeur demandée, bornée. Absent ou illisible : l’image catalogue entière. */
export function coverWidthParam(raw: string | null) {
  if (!raw) return null;
  const width = Number.parseInt(raw, 10);
  if (!Number.isFinite(width) || width < 32) return null;
  return Math.min(1600, width);
}

/** Vignette catalogue. Le lien séjour et les fichiers importés gardent leur URL. */
export function isSizedCatalogCover(src: string) {
  return src.startsWith("/api/covers/") && !src.includes("/api/covers/sejour/");
}

export function coverDisplayUrl(src: string, width: number) {
  const safe = coverWidthParam(String(width));
  if (!safe || !isSizedCatalogCover(src)) return src;
  const split = src.indexOf("?");
  const path = split === -1 ? src : src.slice(0, split);
  const params = new URLSearchParams(split === -1 ? "" : src.slice(split + 1));
  params.set("w", String(safe));
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/** `srcSet` des largeurs servies. Le navigateur choisit la vignette. */
export function coverSrcSet(src: string) {
  if (!isSizedCatalogCover(src)) return undefined;
  return COVER_SRC_WIDTHS.map((width) => `${coverDisplayUrl(src, width)} ${width}w`).join(", ");
}

export type CoverBooking = Pick<CrmBooking, "destination" | "title" | "cover_image_path"> & {
  updated_at?: string | null;
  cover_credit?: string | null;
};

/** Comparaison sur le lieu entier, accents et tirets ignorés. */
/** Identifiant dans `/api/covers/{id}`. */
export function catalogPhotoId(src: string) {
  const match = src.match(/\/api\/covers\/(photo-[A-Za-z0-9_-]{6,80})/);
  return match?.[1] ?? null;
}

export function placeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’.]/g, " ")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Jetons du libellé, virgule comprise : « Lamego, Portugal » garde le pays. */
function labelTokens(value: string | null | undefined) {
  return (value || "")
    .split(/\s*(?:·|\||\/|→|->|—|–|,| - )\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Pays écrit à côté de la ville. Paris / CDG / France ne comptent
 * que lorsqu’aucun autre pays n’est nommé.
 */
function labelCountryCodes(booking: Pick<CrmBooking, "destination" | "title">) {
  const named: string[] = [];
  const hubs: string[] = [];
  const tokens = [...labelTokens(booking.destination), ...labelTokens(booking.title)];
  for (const token of tokens) {
    const code = countryCodeForPlace(placeKey(token));
    if (!code) continue;
    const bucket = isOriginHub(token) ? hubs : named;
    if (!bucket.includes(code)) bucket.push(code);
  }
  return named.length ? named : hubs;
}

export type CoverTextMatch = { photo: string; rank: number };

/**
 * Photo d’un texte libre : ville du catalogue, sinon résidence proche
 * (Aghouatim → Marrakech), sinon le pays. Paris ne gagne que s’il est seul.
 */
export function coverMatchInText(text: string): CoverTextMatch | null {
  const folded = ` ${placeKey(text).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()} `;
  let best: { rank: number; len: number; photo: string } | null = null;
  let hub: { rank: number; len: number; photo: string } | null = null;
  for (const row of coverSearchHits()) {
    if (!folded.includes(` ${row.key} `)) continue;
    const candidate = { rank: row.rank, len: row.key.length, photo: row.photo };
    const better = (current: typeof best) =>
      !current ||
      candidate.rank > current.rank ||
      (candidate.rank === current.rank && candidate.len > current.len);
    if (isOriginHub(row.key)) {
      if (better(hub)) hub = candidate;
    } else if (better(best)) best = candidate;
  }
  const chosen = best || hub;
  return chosen ? { photo: chosen.photo, rank: chosen.rank } : null;
}

/** Jetons d’un libellé, pour savoir si une photo de pays montre une autre ville. */
export function quotedPlaceKeys(text: string) {
  return labelTokens(text).map((token) => placeKey(token)).filter(Boolean);
}

export function coverPhotoInText(text: string): string | null {
  const match = coverMatchInText(text);
  if (!match) return null;
  if (match.rank < 3 && !countryLandmarkPhotoAllowed(match.photo, quotedPlaceKeys(text))) return null;
  return match.photo;
}

export function unsplashKeywordMatch(booking: Pick<CrmBooking, "destination" | "title">) {
  const key = placeKey(coverQuery(booking.destination, booking.title));
  const direct = lookupCoverPhoto(key);
  if (direct) return direct;
  if (countryCodeForPlace(key)) return null;
  const scanned = coverPhotoInText(`${booking.destination || ""} ${booking.title || ""}`);
  if (scanned) return scanned;
  const codes = labelCountryCodes(booking);
  if (codes.length !== 1) return null;
  const photo = countryCoverPhoto(codes[0]);
  if (!photo) return null;
  const text = `${booking.destination || ""} ${booking.title || ""}`;
  if (!countryLandmarkPhotoAllowed(photo, quotedPlaceKeys(text))) return null;
  return photo;
}

export type CoverPlaceItem = {
  kind?: string | null;
  title?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  sort_order?: number | null;
  details?: Record<string, unknown> | null;
};

export type CoverPlan =
  | { mode: "single"; src: string; fallback: string | null }
  | { mode: "split"; src: string; srcB: string }
  | { mode: "none" };

function catalogUrl(photoId: string) {
  return catalogCoverUrl(photoId);
}

/** Lieu sans photo propre : identifiant à générer. Une ville du catalogue ou un pays : null. */
export function generatedCoverIdForPlace(place: string) {
  const key = placeKey(place);
  if (!key || cityCoverPhoto(key) || !generatedPlaceAllowed(key)) return null;
  return cityGeneratedCoverId(key);
}

function arrivalPhotoId(place: string) {
  const key = placeKey(place);
  if (!key) return null;
  return cityCoverPhoto(key) || (generatedPlaceAllowed(key) ? cityGeneratedCoverId(key) : null);
}

/** La photo du pays n’accompagne qu’une image générée, et seulement si la génération échoue. */
function singlePlan(photo: string, countryPhoto: string | null): CoverPlan {
  const fallback =
    photo.startsWith("photo-city-") && countryPhoto && countryPhoto !== photo
      ? catalogUrl(countryPhoto)
      : null;
  return { mode: "single", src: catalogUrl(photo), fallback };
}

function countryPhotoNamed(place: string) {
  const code = countryCodeForPlace(placeKey(place));
  return code ? countryCoverPhoto(code) : null;
}

function contextCountryPhoto(
  booking: Pick<CrmBooking, "destination" | "title">,
  items?: CoverPlaceItem[]
) {
  const codes: string[] = [];
  const push = (value: string) => {
    const code = countryCodeForPlace(placeKey(value));
    if (code && !codes.includes(code)) codes.push(code);
  };
  for (const token of [...labelTokens(booking.destination), ...labelTokens(booking.title)]) push(token);
  for (const item of items || []) push(detailText(item.details, "country"));
  if (codes.length !== 1) return null;
  return countryCoverPhoto(codes[0]);
}

function countryFallbackFor(
  place: string,
  booking: Pick<CrmBooking, "destination" | "title">,
  items?: CoverPlaceItem[]
) {
  return countryPhotoNamed(place) || contextCountryPhoto(booking, items);
}

function countryPostcardInsteadOfPlace(places: string[], photo: string) {
  return places.some((place) => {
    const id = generatedCoverIdForPlace(place);
    return Boolean(id && id !== photo);
  });
}

function detailText(details: Record<string, unknown> | null | undefined, key: string) {
  const value = details?.[key];
  return typeof value === "string" ? value.trim() : "";
}

/** Ville, adresse et pays écrits sur les cartes, pour retrouver une photo. */
function stayCoverText(
  booking: Pick<CrmBooking, "destination" | "title">,
  items?: CoverPlaceItem[]
) {
  const bits = [booking.destination || "", booking.title || ""];
  for (const item of items || []) {
    bits.push(
      detailText(item.details, "city"),
      detailText(item.details, "city_to"),
      detailText(item.details, "address"),
      detailText(item.details, "country"),
      detailText(item.details, "region")
    );
  }
  return bits.filter(Boolean).join(" ");
}

function arrivalPlaces(
  booking: Pick<CrmBooking, "destination" | "title">,
  options?: { items?: CoverPlaceItem[]; places?: string[] }
) {
  const listed = options?.places?.length
    ? options.places
    : options?.items?.length
      ? stayArrivalPlaces(null, null, options.items)
      : [];
  const raw = listed.length ? listed : stayArrivalPlaces(booking.destination, booking.title);
  const origins = new Set(
    (options?.items?.length ? tripCityPlan(options.items as TripStep[]).origins : []).map((city) => placeKey(city))
  );
  const stayed = raw.filter((place) => {
    const key = placeKey(place);
    if (origins.has(key)) return false;
    if (!isOriginHub(place)) return true;
    return raw.every((other) => isOriginHub(other));
  });
  return stayed.length ? stayed : raw;
}

/** Une ville : sa photo, ou une image générée de cette ville. Deux villes : diagonale. */
export function bookingCoverPlan(
  booking: CoverBooking,
  options?: { items?: CoverPlaceItem[]; places?: string[]; partage?: string | null }
): CoverPlan {
  if (booking.cover_image_path) {
    const params = new URLSearchParams({ path: booking.cover_image_path });
    if (booking.updated_at) params.set("v", booking.updated_at);
    if (options?.partage) params.set("partage", options.partage);
    const fallback = placeCoverUrl(booking);
    return { mode: "single", src: `/api/files?${params.toString()}`, fallback };
  }
  const places = arrivalPlaces(booking, options);
  const known = places.filter((place) => {
    const key = placeKey(place);
    return Boolean(lookupCoverPhoto(key) || countryCodeForPlace(key));
  });
  const knownAreCountries =
    known.length > 0 && known.every((place) => isCountryName(placeKey(place)));
  const hasOtherPlace = places.some((place) => !isCountryName(placeKey(place)));
  const coverPlaces = known.length && !(knownAreCountries && hasOtherPlace) ? known : places;
  const countries: string[] = [];
  for (const place of coverPlaces) {
    const code = countryCodeForPlace(placeKey(place));
    if (code && !countries.includes(code)) countries.push(code);
  }
  const allowed = new Set(coverPlaces.map((place) => placeKey(place)));
  const originKeys = new Set(
    (options?.items?.length ? tripCityPlan(options.items as TripStep[]).origins : []).map((city) => placeKey(city))
  );
  for (const token of [...labelTokens(booking.destination), ...labelTokens(booking.title)]) {
    const key = placeKey(token);
    const code = countryCodeForPlace(key);
    if (!code || countries.includes(code)) continue;
    if ((isOriginHub(token) || originKeys.has(key)) && countries.length) continue;
    if (allowed.size && cityCoverPhoto(key) && !allowed.has(key)) continue;
    countries.push(code);
  }
  if (coverPlaces.length >= 2 && countries.length === 1) {
    const photos: string[] = [];
    for (const place of coverPlaces) {
      const photo = arrivalPhotoId(place);
      if (photo && !photos.includes(photo)) photos.push(photo);
    }
    if (photos.length >= 2) {
      return { mode: "split", src: catalogUrl(photos[0]), srcB: catalogUrl(photos[1]) };
    }
    if (photos.length === 1) return singlePlan(photos[0], countryCoverPhoto(countries[0]));
    const photo = countryCoverPhoto(countries[0]);
    const placeKeys = coverPlaces.map((place) => placeKey(place));
    if (photo && countryLandmarkPhotoAllowed(photo, placeKeys)) {
      return { mode: "single", src: catalogUrl(photo), fallback: null };
    }
  }
  if (countries.length >= 2) {
    const placeKeys = coverPlaces.map((place) => placeKey(place));
    const photos = countries
      .map((code) => countryCoverPhoto(code))
      .filter((photo): photo is string => Boolean(photo && countryLandmarkPhotoAllowed(photo, placeKeys)))
      .slice(0, 2);
    if (photos.length === 2) {
      return { mode: "split", src: catalogUrl(photos[0]), srcB: catalogUrl(photos[1]) };
    }
    const missing = coverPlaces
      .map((place) => {
        const key = placeKey(place);
        const code = countryCodeForPlace(key);
        if (code && countryCoverPhoto(code)) return null;
        return arrivalPhotoId(place);
      })
      .filter((photo): photo is string => Boolean(photo && !photos.includes(photo)));
    if (photos.length === 1 && missing[0]) {
      return { mode: "split", src: catalogUrl(photos[0]), srcB: catalogUrl(missing[0]) };
    }
    if (photos.length === 1) return { mode: "single", src: catalogUrl(photos[0]), fallback: null };
  }
  if (coverPlaces.length === 1) {
    const photo = lookupCoverPhoto(placeKey(coverPlaces[0])) || coverPhotoInText(coverPlaces[0]);
    const placeKeys = places.map((place) => placeKey(place));
    if (photo && countryLandmarkPhotoAllowed(photo, placeKeys)) {
      return singlePlan(photo, countryFallbackFor(coverPlaces[0], booking, options?.items));
    }
  }
  const single = unsplashKeywordMatch(booking);
  if (single && !countryPostcardInsteadOfPlace(coverPlaces, single)) {
    return singlePlan(single, coverPlaces[0] ? countryFallbackFor(coverPlaces[0], booking, options?.items) : null);
  }
  const mentioned = coverMatchInText(stayCoverText(booking, options?.items));
  if (mentioned && mentioned.rank >= 3) {
    return { mode: "single", src: catalogUrl(mentioned.photo), fallback: null };
  }
  const generated = [
    ...new Set(
      coverPlaces.map((place) => arrivalPhotoId(place)).filter((id): id is string => Boolean(id))
    ),
  ];
  if (generated.length >= 2) {
    return { mode: "split", src: catalogUrl(generated[0]), srcB: catalogUrl(generated[1]) };
  }
  if (generated.length === 1) {
    const place = coverPlaces.find((item) => arrivalPhotoId(item) === generated[0]) || coverPlaces[0] || "";
    return singlePlan(generated[0], countryFallbackFor(place, booking, options?.items));
  }
  const countryPhoto = coverPhotoInText(stayCoverText(booking, options?.items));
  if (countryPhoto) return { mode: "single", src: catalogUrl(countryPhoto), fallback: null };
  return { mode: "none" };
}

export type FallbackCoverTarget = {
  place: string;
  generatedId: string;
  fallbackPhoto: string;
};

/**
 * Lieu sans photo propre dont le texte du séjour montrait la photo du pays.
 * Le script de régénération s'en sert. Une ville citée (rang 3) n'est pas un repli.
 */
export function fallbackCoverTargets(
  booking: Pick<CrmBooking, "destination" | "title">,
  options?: { items?: CoverPlaceItem[]; places?: string[] }
): FallbackCoverTarget[] {
  const places = arrivalPlaces(booking, options);
  const mentioned = coverMatchInText(stayCoverText(booking, options?.items));
  if (!mentioned || mentioned.rank >= 3) return [];
  const targets: FallbackCoverTarget[] = [];
  const seen = new Set<string>();
  for (const place of places) {
    const id = generatedCoverIdForPlace(place);
    if (!id || seen.has(id) || id === mentioned.photo) continue;
    seen.add(id);
    targets.push({ place, generatedId: id, fallbackPhoto: mentioned.photo });
  }
  return targets;
}

/** Lieux du séjour qui n'ont pas encore d'image à eux. */
export function generatableArrivalPlaces(
  booking: Pick<CrmBooking, "destination" | "title">,
  options?: { items?: CoverPlaceItem[]; places?: string[] }
) {
  const seen = new Set<string>();
  const places: string[] = [];
  for (const place of arrivalPlaces(booking, options)) {
    const id = generatedCoverIdForPlace(place);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    places.push(place);
  }
  return places;
}

/** Texte envoyé au géocodeur quand le catalogue n’a pas de photo. */
export function coverGeocodeQuery(
  booking: Pick<CrmBooking, "destination" | "title">,
  options?: { items?: CoverPlaceItem[]; places?: string[] }
) {
  const bits: string[] = [];
  if (options?.places?.length) bits.push(...options.places);
  else if (booking.destination) bits.push(booking.destination);
  for (const item of options?.items || []) {
    bits.push(
      detailText(item.details, "city"),
      detailText(item.details, "city_to"),
      detailText(item.details, "address"),
      detailText(item.details, "country"),
      detailText(item.details, "region")
    );
  }
  if (!bits.some(Boolean) && booking.title) bits.push(booking.title);
  return bits.filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 160);
}

const CATALOG_PHOTO_ID = /^photo-[A-Za-z0-9_-]{6,80}$/;

/** Choix de couverture : le catalogue du lieu, ou l’effacement d’une photo importée. */
export function catalogCoverChoice(value: string): { clear: true } | { photo: string } | { error: string } {
  const raw = value.trim();
  if (!raw || raw.toLowerCase() === "catalogue") return { clear: true };
  if (CATALOG_PHOTO_ID.test(raw)) {
    if (!isKnownCatalogPhoto(raw)) return { error: "Photo de couverture inconnue." };
    return { photo: raw };
  }
  const key = placeKey(raw);
  const photo = cityCoverPhoto(key) || (isCountryName(key) ? lookupCoverPhoto(key) : null);
  if (!photo || !isKnownCatalogPhoto(photo)) return { error: "Pas de photo pour ce lieu." };
  return { photo };
}

/** Identifiant catalogue d’un plan, quand la photo n’est pas un fichier importé. */
export function catalogPhotoFromPlan(plan: CoverPlan) {
  if (plan.mode === "none") return null;
  const src = plan.mode === "split" ? plan.src : plan.src;
  const match = src.match(/\/api\/covers\/([^/?]+)/);
  return match?.[1] || null;
}

export function placeCoverUrl(booking: Pick<CrmBooking, "destination" | "title">, width = 960) {
  const match = unsplashKeywordMatch(booking);
  return match ? coverDisplayUrl(catalogCoverUrl(match), width) : null;
}

/** Import agence, sinon photo du lieu, sinon image générée. Le pays n'est que le repli. */
export function bookingCoverUrl(
  booking: CoverBooking,
  width = 960,
  access?: { partage?: string | null; items?: CoverPlaceItem[]; places?: string[] }
) {
  const plan = bookingCoverPlan(booking, access);
  if (plan.mode === "none") return null;
  return coverDisplayUrl(plan.src, width);
}
