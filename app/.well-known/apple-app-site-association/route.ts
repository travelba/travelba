import { NextResponse } from "next/server";
import { appleAppSiteAssociation } from "@/lib/native/apple-app-site";

/** Liens universels : le lien magique et l’espace s’ouvrent dans l’app, pas dans Safari. */
export function GET() {
  return NextResponse.json(appleAppSiteAssociation(process.env.APPLE_TEAM_ID));
}
