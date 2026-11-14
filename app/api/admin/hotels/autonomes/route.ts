import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/crm/auth";
import { readSelfServiceSettings, writeSelfServiceSettings } from "@/lib/crm/self-signup-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  if (auth.staff.role !== "admin") return jsonError("Réservé aux administrateurs.", 403);
  return NextResponse.json(await readSelfServiceSettings());
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => null);
  const saved = await writeSelfServiceSettings(auth.staff.role, auth.staff.id, body);
  if (!saved.ok) return jsonError(saved.message, 403);
  return NextResponse.json(saved.settings);
}
