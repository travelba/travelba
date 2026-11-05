import { proxyMapboxGet } from "@/lib/crm/mapbox-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Relais Mapbox. Le Referer autorisé est ajouté ici. Le jeton n’est pas journalisé. */
export async function GET(request: Request) {
  return proxyMapboxGet({
    requestUrl: request.url,
    token: process.env.NEXT_PUBLIC_MAPBOX_TOKEN || null,
  });
}
