export type ExpediaPropertyContent = {
  propertyId: string;
  name: string;
  city: string;
  countryCode: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  stars: number | null;
  image: string | null;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function httpsImage(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("https://") || value.length > 500) return null;
  return value;
}

function firstImage(images: unknown) {
  if (!Array.isArray(images)) return null;
  for (const image of images) {
    const links = record(record(image)?.links);
    if (!links) continue;
    for (const key of ["350px", "70px", "1000px"]) {
      const href = httpsImage(record(links[key])?.href);
      if (href) return href;
    }
    for (const link of Object.values(links)) {
      const href = httpsImage(record(link)?.href);
      if (href) return href;
    }
  }
  return null;
}

function starsOf(ratings: unknown) {
  const property = record(record(ratings)?.property);
  if (!property || property.type !== "Star") return null;
  const rating = Number(property.rating);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) return null;
  return Math.round(rating);
}

export function parseExpediaContent(payload: unknown): ExpediaPropertyContent[] {
  const root = record(payload);
  if (!root) return [];
  const rows: ExpediaPropertyContent[] = [];
  for (const [key, value] of Object.entries(root)) {
    const row = record(value);
    if (!row) continue;
    const propertyId = typeof row.property_id === "string" ? row.property_id : key;
    const name = typeof row.name === "string" ? row.name.replace(/\s+/g, " ").trim() : "";
    if (!propertyId || !name) continue;
    const address = record(row.address);
    const line = typeof address?.line_1 === "string" ? address.line_1 : "";
    const city = typeof address?.city === "string" ? address.city : "";
    const country = typeof address?.country_code === "string" ? address.country_code : null;
    const coordinates = record(record(row.location)?.coordinates);
    const lat = Number(coordinates?.latitude);
    const lng = Number(coordinates?.longitude);
    rows.push({
      propertyId,
      name,
      city,
      countryCode: country,
      address: line || null,
      lat: Number.isFinite(lat) && Math.abs(lat) <= 90 ? lat : null,
      lng: Number.isFinite(lng) && Math.abs(lng) <= 180 ? lng : null,
      stars: starsOf(row.ratings),
      image: firstImage(row.images),
    });
  }
  return rows;
}

export type ExpediaRegion = { id: string; name: string; type: string };

export function parseExpediaRegions(payload: unknown): ExpediaRegion[] {
  const rows = Array.isArray(payload) ? payload : [];
  const regions: ExpediaRegion[] = [];
  for (const item of rows) {
    const row = record(item);
    const id = typeof row?.id === "string" ? row.id : "";
    const name = typeof row?.name === "string" ? row.name : "";
    const type = typeof row?.type === "string" ? row.type : "";
    if (id && name) regions.push({ id, name, type });
  }
  return regions;
}
