import { appleAppSiteAssociation, appleTeamId } from "@/lib/crm/espace-app";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(appleAppSiteAssociation(appleTeamId()), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
}
