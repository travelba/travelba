import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import {
  issueHotelSearchCard,
  lockHotelSearchCard,
  refuseHotelSearchRequest,
} from "@/lib/crm/hotel-search-card-run";

export const runtime = "nodejs";
export const maxDuration = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const body = (await request.json().catch(() => null)) as { id?: unknown; action?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  const action = body?.action;
  if (!UUID.test(id)) return jsonError("Demande introuvable.", 404);
  if (action !== "issue" && action !== "refuse" && action !== "lock") return jsonError("Action inconnue", 400);
  try {
    const result =
      action === "issue"
        ? await issueHotelSearchCard({ requestId: id, staffId: auth.staff.id })
        : action === "refuse"
          ? await refuseHotelSearchRequest({ requestId: id, staffId: auth.staff.id })
          : await lockHotelSearchCard({ requestId: id });
    if (!result.ok) return jsonError(result.message, 400);
    return NextResponse.json({ ok: true, message: result.message });
  } catch {
    return jsonError("Action impossible.", 500);
  }
}
