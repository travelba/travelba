import { NextRequest } from "next/server";
import { isAllowedOfficialUrl, getFiche } from "@/lib/og";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url") ?? "";
  if (!isAllowedOfficialUrl(url)) {
    return Response.json({ ok: false, error: "url-non-autorisee" }, { status: 400 });
  }
  const fiche = await getFiche(url);
  return Response.json(fiche);
}
