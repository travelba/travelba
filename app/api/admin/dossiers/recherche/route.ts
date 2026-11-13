import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { searchDossiersForMove } from "@/lib/crm/le-reattach";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Dossiers ouverts pour un déplacement : client, voyageur, destination ou titre. */
export async function GET(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const url = new URL(request.url);
  const q = url.searchParams.get("q") || "";
  const sauf = url.searchParams.get("sauf") || "";
  try {
    const dossiers = await searchDossiersForMove(q, sauf, { admin: createServiceClient() });
    return NextResponse.json({ dossiers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Recherche impossible.";
    return jsonError(message, 500);
  }
}
