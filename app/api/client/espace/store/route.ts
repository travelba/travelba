import { NextResponse } from "next/server";
import { espaceStoreListing } from "@/lib/crm/espace-app";

export const runtime = "nodejs";

/** Fiche App Store publique — pas de secrets, pas de compte reviewer. */
export async function GET() {
  return NextResponse.json(espaceStoreListing(), {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
