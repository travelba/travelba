import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/crm/auth";
import { writeHotelButtonVisibility } from "@/lib/crm/hotel-access-run";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const body = (await request.json().catch(() => null)) as { value?: unknown } | null;
  const saved = await writeHotelButtonVisibility("admin", auth.staff.id, body?.value);
  if (!saved.ok) return jsonError(saved.error, 400);
  return NextResponse.json({ ok: true, value: saved.value });
}
