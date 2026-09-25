import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/crm/cron-auth";
import { littleEmperorsConfigured } from "@/lib/crm/little-emperors";
import { syncLittleEmperorsBookings } from "@/lib/crm/little-emperors-sync";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!cronAuthorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (!littleEmperorsConfigured()) {
    return NextResponse.json({ skipped: true, reason: "not_configured" });
  }
  const result = await syncLittleEmperorsBookings();
  if (!result.ok) {
    return NextResponse.json(result, { status: result.status && result.status >= 400 ? result.status : 502 });
  }
  return NextResponse.json(result);
}
