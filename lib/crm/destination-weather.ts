import { coverQuery } from "./carnet";

export type WeatherIcon = "sun" | "cloud_sun" | "cloud" | "fog" | "rain" | "snow" | "storm";

export type DestinationWeather = {
  tempC: number;
  label: string;
  icon: WeatherIcon;
};

type GeoHit = {
  name?: string;
  latitude?: number;
  longitude?: number;
  feature_code?: string | null;
};

/** Libellé et icône à partir d’un code WMO Open-Meteo. */
export function weatherFromCode(code: number): { label: string; icon: WeatherIcon } {
  if (code === 0) return { label: "Ensoleillé", icon: "sun" };
  if (code === 1) return { label: "Dégagé", icon: "cloud_sun" };
  if (code === 2) return { label: "Nuageux", icon: "cloud_sun" };
  if (code === 3) return { label: "Couvert", icon: "cloud" };
  if (code === 45 || code === 48) return { label: "Brouillard", icon: "fog" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: "Neige", icon: "snow" };
  if (code >= 95) return { label: "Orage", icon: "storm" };
  if (code >= 51 && code <= 82) return { label: "Pluie", icon: "rain" };
  return { label: "Variable", icon: "cloud" };
}

function placeName(destination: string | null | undefined, title: string | null | undefined) {
  const place = coverQuery(destination ?? null, title ?? null).trim();
  if (!place || place === "voyage") return "";
  return place;
}

/** Météo actuelle à la destination. Rien si le lieu ou le service est indisponible. */
export async function destinationWeather(
  destination: string | null | undefined,
  title: string | null | undefined
): Promise<DestinationWeather | null> {
  const name = placeName(destination, title);
  if (name.length < 2) return null;

  try {
    const geo = new URL("https://geocoding-api.open-meteo.com/v1/search");
    geo.searchParams.set("name", name);
    geo.searchParams.set("count", "5");
    geo.searchParams.set("language", "fr");
    geo.searchParams.set("format", "json");
    const geoRes = await fetch(geo, { signal: AbortSignal.timeout(5000), next: { revalidate: 3600 } });
    if (!geoRes.ok) return null;
    const geoJson = (await geoRes.json()) as { results?: GeoHit[] };
    const hit = (geoJson.results || []).find(
      (row) =>
        typeof row.latitude === "number" &&
        typeof row.longitude === "number" &&
        (!row.feature_code || row.feature_code.startsWith("PPL"))
    );
    if (!hit || hit.latitude == null || hit.longitude == null) return null;

    const forecast = new URL("https://api.open-meteo.com/v1/forecast");
    forecast.searchParams.set("latitude", String(hit.latitude));
    forecast.searchParams.set("longitude", String(hit.longitude));
    forecast.searchParams.set("current", "temperature_2m,weather_code");
    forecast.searchParams.set("timezone", "auto");
    const weatherRes = await fetch(forecast, {
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 1800 },
    });
    if (!weatherRes.ok) return null;
    const weatherJson = (await weatherRes.json()) as {
      current?: { temperature_2m?: number; weather_code?: number };
    };
    const temp = weatherJson.current?.temperature_2m;
    const code = weatherJson.current?.weather_code;
    if (typeof temp !== "number" || typeof code !== "number") return null;
    const face = weatherFromCode(code);
    return { tempC: Math.round(temp), label: face.label, icon: face.icon };
  } catch {
    return null;
  }
}
