import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liens universels de l’application TBA. 404 tant que APPLE_TEAM_ID n’est pas posé :
 * un fichier avec un mauvais identifiant d’équipe casserait l’association.
 */
export function GET() {
  const team = (process.env.APPLE_TEAM_ID || "").trim();
  if (!/^[A-Z0-9]{10}$/.test(team)) {
    return new NextResponse(null, { status: 404 });
  }
  const body = {
    applinks: {
      apps: [],
      details: [
        {
          appIDs: [`${team}.fr.travelba.client`],
          components: [
            { "/": "/connexion", comment: "connexion" },
            { "/": "/connexion/*" },
            { "/": "/mon-compte" },
            { "/": "/mon-compte/*" },
            { "/": "/auth/*" },
            { "/": "/e/*", comment: "lien court" },
            { "/": "/acces/*" },
          ],
        },
      ],
    },
  };
  return NextResponse.json(body, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
