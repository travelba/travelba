import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/crm/auth";
import { recordAgencyJournal } from "@/lib/crm/agency-log";

export const runtime = "nodejs";

/** Le secret TOTP reste dans le navigateur. On ne journalise que le geste. */
export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => null);
  const removed = body?.action === "unenroll";
  await recordAgencyJournal({
    staffId: auth.staff.id,
    action: "update",
    entityType: "session",
    summary: removed ? "Double authentification retirée." : "Double authentification activée.",
    path: "/api/admin/securite",
  });
  return NextResponse.json({ ok: true });
}
