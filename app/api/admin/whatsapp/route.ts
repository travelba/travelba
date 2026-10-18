import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { toE164 } from "@/lib/crm/phone";
import { isVercelPreview } from "@/lib/crm/preview-secrets";
import { createServiceClient } from "@/lib/supabase/admin";
import { agencySignoff, nextParisMorning } from "@/lib/crm/whatsapp-takeover";
import { sendWhatsappSession, sessionAddress } from "@/lib/crm/whatsapp-session";

export const runtime = "nodejs";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const body = (await request.json().catch(() => null)) as {
    action?: string;
    customerId?: string;
    phone?: string;
    text?: string;
    requestId?: string;
  } | null;
  const action = body?.action;
  const phone = toE164(body?.phone || "", "FR");
  const customerId = body?.customerId && ID.test(body.customerId) ? body.customerId : null;
  const requestId = body?.requestId && ID.test(body.requestId) ? body.requestId : null;
  if (action !== "reply" && action !== "resume" && action !== "done") {
    return jsonError("Action inconnue", 400);
  }
  if ((action === "reply" || action === "resume") && !phone) return jsonError("Téléphone manquant", 400);

  let admin: ReturnType<typeof createServiceClient>;
  try {
    admin = createServiceClient();
  } catch {
    return jsonError("Service indisponible", 503);
  }

  if (action === "done") {
    if (!requestId) return jsonError("Demande manquante", 400);
    const { error } = await admin
      .from("crm_whatsapp_requests")
      .update({ status: "done", resolved_at: new Date().toISOString() })
      .eq("id", requestId);
    if (error) return jsonError("La migration WhatsApp n’est pas encore appliquée.", 503);
    return NextResponse.json({ ok: true });
  }

  if (action === "resume") {
    const { error } = await admin
      .from("crm_whatsapp_threads")
      .update({ paused_at: null, paused_until: null, paused_by: null, updated_at: new Date().toISOString() })
      .eq("phone", phone);
    if (error) return jsonError("La migration WhatsApp n’est pas encore appliquée.", 503);
    return NextResponse.json({ ok: true });
  }

  const text = agencySignoff((body?.text || "").trim());
  if (text.length < 10 || text.length > 1200) return jsonError("Message trop court", 400);
  if (isVercelPreview()) return jsonError("Envoi coupé sur l’aperçu.", 403);

  const to = sessionAddress(phone!);
  if (!to) return jsonError("Téléphone manquant", 400);
  const sent = await sendWhatsappSession({ to, body: text });
  if (!sent.ok) return jsonError("WhatsApp n’a pas accepté le message.", 502);

  const now = new Date();
  await admin.from("crm_whatsapp_messages").insert({
    customer_id: customerId,
    direction: "outbound",
    template_key: "staff",
    body: text,
    twilio_sid: sent.sid,
    status: "sent",
    error: null,
  });
  const { error: pauseError } = await admin.from("crm_whatsapp_threads").upsert({
    phone,
    customer_id: customerId,
    paused_at: now.toISOString(),
    paused_until: nextParisMorning(now).toISOString(),
    paused_by: auth.staff.id,
    updated_at: now.toISOString(),
  });
  if (pauseError) console.error("[whatsapp-concierge] pause", pauseError.code || "error");
  return NextResponse.json({ ok: true });
}
