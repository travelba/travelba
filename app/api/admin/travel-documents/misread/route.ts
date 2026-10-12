import { NextResponse } from "next/server";
import { dbError, jsonError, requireStaff } from "@/lib/crm/auth";
import { misreadHasSignal, misreadRecord } from "@/lib/crm/passport-misread";
import { createPassportFixAgent } from "@/lib/crm/passport-misread-run";
import { RATE_LIMITED_MESSAGE, rateLimit, rateLimitKey } from "@/lib/crm/rate-limit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Lecture illisible.");
  }
  const raw = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  let customerId: string | null = null;
  if (raw.customer_id != null && raw.customer_id !== "") {
    if (typeof raw.customer_id !== "string" || !UUID.test(raw.customer_id)) {
      return jsonError("Client inconnu.");
    }
    customerId = raw.customer_id;
  }

  const record = misreadRecord({
    staffId: auth.staff.id,
    customerId,
    read: raw.read,
    corrected: raw.corrected,
    note: raw.note,
  });
  if (!misreadHasSignal(record)) return jsonError("Indiquez ce qui est faux.");

  const allowed = await rateLimit({
    key: rateLimitKey("passport-misread", auth.staff.id),
    limit: 4,
    windowSeconds: 60 * 60,
  });
  if (!allowed) return jsonError(RATE_LIMITED_MESSAGE, 429);

  const { data, error } = await auth.supabase
    .from("crm_passport_misreads")
    .insert(record)
    .select("id")
    .single();
  if (error || !data?.id) return dbError(error, 400, "La correction n’a pas pu être notée.");

  const agent = await createPassportFixAgent({ symptom: record.symptom, note: record.note });
  const status = agent.ok ? "sent" : "failed";
  const { error: updateError } = await auth.supabase
    .from("crm_passport_misreads")
    .update({ status, cursor_agent_id: agent.ok ? agent.agentId : null })
    .eq("id", data.id);
  if (updateError) console.error("[passport-misread] statut", updateError.code || "db");

  return NextResponse.json({
    status,
    message: agent.ok
      ? "Correction notée. Cursor prépare une mise à jour."
      : "Correction notée. La demande Cursor n’a pas pu partir.",
  });
}
