import { NextResponse } from "next/server";
import { BookingIssuesError } from "@/lib/crm/booking-issues";
import { dbError, jsonError, jsonIssues, requireLittleEmperorsActor } from "@/lib/crm/auth";
import { LittleEmperorsError, littleEmperorsActionAllowed, littleEmperorsPartnerMessage } from "@/lib/crm/little-emperors";
import {
  attachLittleEmperorsBooking,
  cancelLittleEmperorsFromCrm,
  syncLittleEmperorsBookings,
} from "@/lib/crm/little-emperors-sync";

export const runtime = "nodejs";
export const maxDuration = 300;

function failure(err: unknown, partner: boolean) {
  if (err instanceof BookingIssuesError) return jsonIssues(err.issues, 400, err.message);
  if (err instanceof LittleEmperorsError) {
    return jsonError(partner ? littleEmperorsPartnerMessage(err.code) : err.message, err.status);
  }
  console.error("[little-emperors]", err instanceof Error ? err.message : "error");
  return jsonError(partner ? "The test environment could not be read." : "Opération Little Emperors impossible.", 502);
}

export async function POST(request: Request) {
  const auth = await requireLittleEmperorsActor();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || "");
  const partner = auth.staff.role === "partner";
  if (!littleEmperorsActionAllowed(auth.staff.role, action)) {
    return jsonError(partner ? "This action is not available." : "Accès réservé à l’agence", 403);
  }
  try {
    if (action === "sync") {
      const result = await syncLittleEmperorsBookings();
      const probeMessage = result.ok
        ? null
        : partner
          ? littleEmperorsPartnerMessage(result.code || "")
          : result.message || "Lecture impossible.";
      const { error: probeError } = await auth.supabase.rpc("crm_record_le_probe", {
        p_status: result.ok ? 200 : result.status || 502,
        p_error: probeMessage,
        p_ok_at: result.ok ? new Date().toISOString() : null,
      });
      if (probeError) console.error("[little-emperors] probe", probeError.code || "error");
      if (!result.ok) return jsonError(probeMessage || "Lecture impossible.", result.status || 502);
      return NextResponse.json(result);
    }
    if (action === "attach") {
      const result = await attachLittleEmperorsBooking({
        id: String(body.id || ""),
        customerId: String(body.customer_id || ""),
      });
      return NextResponse.json(result);
    }
    if (action === "cancel") {
      return NextResponse.json(await cancelLittleEmperorsFromCrm(String(body.id || "")));
    }
  } catch (err) {
    if (err instanceof LittleEmperorsError || err instanceof BookingIssuesError) return failure(err, partner);
    if (!partner && err && typeof err === "object" && "code" in err) {
      return dbError(err as { code?: string; message?: string });
    }
    return failure(err, partner);
  }
  return jsonError(partner ? "Unknown action." : "Action inconnue");
}
