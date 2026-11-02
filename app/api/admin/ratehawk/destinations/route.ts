import { CERTIFICATION_HOTELS, CERTIFICATION_REGION } from "@/lib/crm/ratehawk/catalog";
import { ratehawkJson, staffOrResponse } from "@/lib/crm/ratehawk/http";
import { ratehawkDb } from "@/lib/crm/ratehawk/store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function likeSafe(value: string) {
  return value.replace(/[%_\\,().]/g, "").slice(0, 80);
}

export async function GET(request: Request) {
  const auth = await staffOrResponse();
  if (auth instanceof Response) return auth;
  const q = likeSafe(new URL(request.url).searchParams.get("q") || "");
  const hotels = CERTIFICATION_HOTELS.filter((hotel) => !q || hotel.name.toLowerCase().includes(q.toLowerCase()) || String(hotel.hid) === q).map((hotel) => ({
    kind: "hotel" as const,
    hid: hotel.hid,
    name: hotel.name,
    region_id: hotel.region_id,
    region_name: hotel.region_name,
  }));
  const regions = !q || CERTIFICATION_REGION.name.toLowerCase().includes(q.toLowerCase()) || String(CERTIFICATION_REGION.id) === q
    ? [{ kind: "region" as const, id: CERTIFICATION_REGION.id, name: CERTIFICATION_REGION.name_fr, country_code: CERTIFICATION_REGION.country_code }]
    : [];
  try {
    const supabase = ratehawkDb();
    if (q) {
      const [regionRows, hotelRows] = await Promise.all([
        supabase.from("crm_ratehawk_regions").select("id, name, name_fr, country_code, type").ilike("name", `%${q}%`).limit(12),
        supabase.from("crm_ratehawk_hotels").select("hid, name, region_id, region_name").or(`name.ilike.%${q}%,hid.eq.${Number(q) || 0}`).limit(12),
      ]);
      for (const row of regionRows.data || []) {
        if (!regions.some((region) => region.id === row.id)) {
          regions.push({ kind: "region", id: row.id, name: row.name_fr || row.name, country_code: row.country_code });
        }
      }
      for (const row of hotelRows.data || []) {
        if (!hotels.some((hotel) => hotel.hid === row.hid)) {
          hotels.push({ kind: "hotel", hid: row.hid, name: row.name, region_id: row.region_id, region_name: row.region_name });
        }
      }
    }
  } catch {
    // Les deux hôtels de certification restent proposés sans base.
  }
  return ratehawkJson({ regions, hotels });
}
