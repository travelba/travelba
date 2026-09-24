import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/crm/cron-auth";
import { openEtaIlPortal } from "@/lib/crm/eta-il-browser";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Sonde preview : le portail officiel s’ouvre. Aucun dossier, aucun passeport. */
export async function GET(request: Request) {
  const preview = process.env.VERCEL_ENV === "preview";
  const cron = cronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET?.trim());
  if (!preview && !cron) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const portal = await openEtaIlPortal();
  if (!portal) return NextResponse.json({ ok: false });
  try {
    const host = new URL(portal.url()).hostname;
    return NextResponse.json({ ok: host === "israel-entry.piba.gov.il", host });
  } finally {
    await portal.close();
  }
}
