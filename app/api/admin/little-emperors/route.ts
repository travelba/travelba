import { NextResponse } from "next/server";
import { BookingIssuesError } from "@/lib/crm/booking-issues";
import { dbError, jsonError, jsonIssues, requireStaff } from "@/lib/crm/auth";
import { LittleEmperorsError, requestLittleEmperorsSso } from "@/lib/crm/little-emperors";
import {
  attachLittleEmperorsBooking,
  cancelLittleEmperorsFromCrm,
  syncLittleEmperorsBookings,
} from "@/lib/crm/little-emperors-sync";

export const runtime = "nodejs";
export const maxDuration = 300;

function failure(err: unknown) {
  if (err instanceof BookingIssuesError) return jsonIssues(err.issues, 400, err.message);
  if (err instanceof LittleEmperorsError) return jsonError(err.message, err.status);
  console.error("[little-emperors]", err instanceof Error ? err.message : "error");
  return jsonError("Opération Little Emperors impossible.", 502);
}

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || "");
  try {
    if (action === "sync") {
      const result = await syncLittleEmperorsBookings();
      if (!result.ok) return jsonError(result.message || "Lecture impossible.", result.status || 502);
      return NextResponse.json(result);
    }
    if (action === "init") {
      const result = await requestLittleEmperorsSso({
        email: String(body.email || ""),
        name: String(body.name || ""),
      });
      return NextResponse.json(result);
    }
    if (action === "attach") {
      const result = await attachLittleEmperorsBooking({
        id: String(body.id || ""),
        customerId: String(body.customer_id || ""),
        referenceClient: auth.supabase,
      });
      return NextResponse.json(result);
    }
    if (action === "cancel") {
      return NextResponse.json(await cancelLittleEmperorsFromCrm(String(body.id || "")));
    }
  } catch (err) {
    if (err instanceof LittleEmperorsError || err instanceof BookingIssuesError) return failure(err);
    if (err && typeof err === "object" && "code" in err) {
      return dbError(err as { code?: string; message?: string });
    }
    return failure(err);
  }
  return jsonError("Action inconnue");
}
