import { NextResponse } from "next/server";
import { cronAuthorized, cronSecret } from "@/lib/crm/cron-auth";
import { kickHotelResearch } from "@/lib/crm/hotel-research-run";

/** Reprend les fiches hôtel encore en attente. Une recherche à la fois. */
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"), cronSecret())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const result = await kickHotelResearch();
  return NextResponse.json(result);
}
