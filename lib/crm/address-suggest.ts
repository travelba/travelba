import { resolveCountryCode } from "./countries";

export type AddressHit = {
  id: string;
  title: string;
  subtitle: string;
  label: string;
  /** Voie, sans ville. La saisie libre reprend ce champ, ou le texte tapé. */
  line: string;
  postal: string;
  city: string;
  /** ISO2. Vide si la source ne le donne pas. */
  country: string;
};

export type AddressEntry = {
  line: string;
  postal: string;
  city: string;
  country: string;
  fromSuggestion: boolean;
};

type BanProps = {
  name?: string;
  housenumber?: string;
  street?: string;
  postcode?: string;
  city?: string;
};

type PhotonProps = BanProps & {
  country?: string;
  countrycode?: string;
};

const cityCache = new Map<string, { lat: number; lon: number } | null>();

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

/** Ville déjà connue sur la carte : « CDG · Paris », « 69002 Lyon, FR ». */
export function addressCity(value: string | null | undefined) {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  const dotted = trimmed
    .split("·")
    .map((part) => part.trim())
    .filter(Boolean);
  if (dotted.length > 1) return dotted[dotted.length - 1];
  const parts = trimmed
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return "";
  let last = parts[parts.length - 1];
  if (/^[A-Za-z]{2}$/.test(last) && parts.length > 1) last = parts[parts.length - 2];
  return last.replace(/^\d{4,5}\s+/, "").trim();
}

function toHit(
  title: string,
  subtitle: string,
  extra?: Partial<Pick<AddressHit, "line" | "postal" | "city" | "country">>
): AddressHit | null {
  const name = title.trim();
  const place = subtitle.trim();
  if (!name) return null;
  const label = place ? `${name}, ${place}` : name;
  return {
    id: label.toLocaleLowerCase("fr"),
    title: name,
    subtitle: place,
    label,
    line: extra?.line?.trim() || name,
    postal: extra?.postal?.trim() || "",
    city: extra?.city?.trim() || "",
    country: extra?.country?.trim() || "",
  };
}

/**
 * Une suggestion remplit les champs. Sans suggestion, le texte tapé reste :
 * l’enregistrement n’attend pas un choix dans la liste.
 */
export function resolveAddressEntry(input: {
  typedLine: string;
  typedPostal: string;
  typedCity: string;
  typedCountry: string;
  picked: AddressHit | null;
}): AddressEntry {
  const country = resolveCountryCode(input.typedCountry) || input.typedCountry.trim();
  if (!input.picked) {
    return {
      line: input.typedLine,
      postal: input.typedPostal.trim(),
      city: input.typedCity.trim(),
      country,
      fromSuggestion: false,
    };
  }
  const pickedCountry = input.picked.country || country;
  const abroad = Boolean(pickedCountry) && pickedCountry !== "FR";
  return {
    line: input.picked.line || input.typedLine,
    postal: abroad ? input.picked.postal.trim() : input.picked.postal.trim() || input.typedPostal.trim(),
    city: input.picked.city || input.typedCity.trim(),
    country: pickedCountry,
    fromSuggestion: true,
  };
}

export function formatBanFeature(properties: BanProps | null | undefined) {
  if (!properties) return null;
  const title =
    [text(properties.housenumber), text(properties.street)].filter(Boolean).join(" ") || text(properties.name);
  const subtitle = [text(properties.postcode), text(properties.city)].filter(Boolean).join(" ");
  return toHit(title, subtitle, {
    line: title,
    postal: text(properties.postcode),
    city: text(properties.city),
    country: "FR",
  });
}

export function formatPhotonFeature(properties: PhotonProps | null | undefined) {
  if (!properties) return null;
  const street = [text(properties.housenumber), text(properties.street)].filter(Boolean).join(" ");
  const title = street || text(properties.name);
  const countryName = text(properties.country);
  const cityName = text(properties.city);
  const postal = text(properties.postcode);
  const city = [postal, cityName].filter(Boolean).join(" ");
  const abroad = countryName && countryName.toLocaleLowerCase("fr") !== "france" ? countryName : "";
  const iso =
    resolveCountryCode(text(properties.countrycode)) ||
    resolveCountryCode(countryName) ||
    (countryName.toLocaleLowerCase("fr") === "france" ? "FR" : "");
  return toHit(title, [city, abroad].filter(Boolean).join(", "), {
    line: title,
    postal,
    city: cityName,
    country: iso,
  });
}

export function mergeAddressHits(primary: AddressHit[], extra: AddressHit[], limit = 5) {
  const seen = new Set<string>();
  const rows: AddressHit[] = [];
  for (const row of [...primary, ...extra]) {
    const key = row.label
      .toLocaleLowerCase("fr")
      .normalize("NFD")
      .replace(/\p{M}/gu, "");
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
    if (rows.length >= limit) break;
  }
  return rows;
}

function featuresOf(payload: unknown) {
  const rows = payload && typeof payload === "object" ? (payload as { features?: unknown }).features : null;
  return Array.isArray(rows) ? rows : [];
}

async function cityPoint(city: string, fetchImpl: typeof fetch) {
  const key = city.trim().toLocaleLowerCase("fr");
  if (key.length < 2) return null;
  if (cityCache.has(key)) return cityCache.get(key) ?? null;
  const url = new URL("https://api-adresse.data.gouv.fr/search/");
  url.searchParams.set("q", city.trim());
  url.searchParams.set("type", "municipality");
  url.searchParams.set("limit", "1");
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) {
      cityCache.set(key, null);
      return null;
    }
    const json = (await res.json()) as { features?: { geometry?: { coordinates?: number[] } }[] };
    const coords = json.features?.[0]?.geometry?.coordinates;
    const lon = coords?.[0];
    const lat = coords?.[1];
    if (typeof lat !== "number" || typeof lon !== "number") {
      cityCache.set(key, null);
      return null;
    }
    const point = { lat, lon };
    cityCache.set(key, point);
    return point;
  } catch {
    return null;
  }
}

/**
 * Adresses françaises d’abord, puis les lieux ailleurs (terminal, hôtel). Classées près de `near`.
 * Hors France, la base française n’est pas interrogée : une saisie à Dubaï ne se noie pas sous des rues de Paris.
 * Une liste vide n’invalide pas le texte tapé.
 */
export async function searchAddresses(
  query: string,
  near?: string | null,
  fetchImpl: typeof fetch = fetch,
  country?: string | null
) {
  const q = query.trim().replace(/\s+/g, " ");
  if (q.length < 2 || q.length > 80) return [] as AddressHit[];
  const iso = country ? resolveCountryCode(country) : null;
  const france = !iso || iso === "FR";
  const bias = france && near ? await cityPoint(near, fetchImpl) : null;
  const ban = new URL("https://api-adresse.data.gouv.fr/search/");
  ban.searchParams.set("q", q);
  ban.searchParams.set("limit", "5");
  ban.searchParams.set("autocomplete", "1");
  const photon = new URL("https://photon.komoot.io/api/");
  photon.searchParams.set("q", q);
  photon.searchParams.set("lang", "fr");
  photon.searchParams.set("limit", "5");
  if (bias) {
    ban.searchParams.set("lat", String(bias.lat));
    ban.searchParams.set("lon", String(bias.lon));
    photon.searchParams.set("lat", String(bias.lat));
    photon.searchParams.set("lon", String(bias.lon));
  }
  const init = { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(2500) };
  const [banRes, photonRes] = await Promise.allSettled([
    france ? fetchImpl(ban, init) : Promise.resolve(new Response(null, { status: 204 })),
    fetchImpl(photon, init),
  ]);
  const read = async (result: PromiseSettledResult<Response>) => {
    if (result.status !== "fulfilled" || !result.value.ok) return [];
    return featuresOf(await result.value.json().catch(() => null));
  };
  const [banRows, photonRows] = await Promise.all([read(banRes), read(photonRes)]);
  const photonHits = photonRows
    .map((row) => formatPhotonFeature((row as { properties?: PhotonProps }).properties))
    .filter((row): row is AddressHit => Boolean(row));
  if (!france && iso) {
    const matching = photonHits.filter((hit) => !hit.country || hit.country === iso);
    return mergeAddressHits(matching, []);
  }
  return mergeAddressHits(
    banRows
      .map((row) => formatBanFeature((row as { properties?: BanProps }).properties))
      .filter((row): row is AddressHit => Boolean(row)),
    photonHits
  );
}
