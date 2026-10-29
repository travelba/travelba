import { NextResponse } from "next/server";
import { cronAuthorized, cronSecret } from "@/lib/crm/cron-auth";
import { ratehawkConfigured } from "@/lib/crm/ratehawk/config";
import { syncRatehawkContent } from "@/lib/crm/ratehawk/content";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"), cronSecret())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (!ratehawkConfigured()) return NextResponse.json({ skipped: true, reason: "not_configured" });
  const result = await syncRatehawkContent();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
