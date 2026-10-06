import { NextResponse } from "next/server";
import { cronAuthorized, cronSecret } from "@/lib/crm/cron-auth";
import { runUkEtaCron } from "@/lib/crm/uk-eta-run";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"), cronSecret())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const admin = createServiceClient();
    const result = await runUkEtaCron(admin);
    return NextResponse.json(result);
  } catch {
    console.info("[uk-eta] passage ignoré");
    return NextResponse.json({ synced: 0, mailed: 0, clients: 0 });
  }
}
