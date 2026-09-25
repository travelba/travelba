import { NextResponse } from "next/server";
import { flushConcierge } from "@/lib/crm/concierge-send";
import { cronAuthorized, cronSecret } from "@/lib/crm/cron-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"), cronSecret())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const result = await flushConcierge();
  return NextResponse.json(result);
}
