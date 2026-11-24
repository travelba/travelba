import { NextResponse } from "next/server";
import { runNewYearExtension } from "@/lib/crm/club-new-year-run";
import { cronAuthorized, cronSecret } from "@/lib/crm/cron-auth";

/** 31 décembre 23 h 30 UTC = 1er janvier 0 h 30, heure de Paris. Éteint sans NEW_YEAR_EXTENSION_ENABLED=1. */
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"), cronSecret())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const result = await runNewYearExtension(new Date());
  return NextResponse.json(result);
}
