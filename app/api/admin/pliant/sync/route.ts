import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { pliantConfigured } from "@/lib/crm/pliant";
import { syncPliantSpend } from "@/lib/crm/pliant-sync";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  if (!pliantConfigured()) return jsonError("Pliant n’est pas branché.", 400);
  try {
    const result = await syncPliantSpend(createServiceClient());
    return NextResponse.json(result);
  } catch (err) {
    console.error("[pliant-sync]", err instanceof Error ? err.message : "échec");
    return jsonError("Synchronisation Pliant échouée.", 502);
  }
}
