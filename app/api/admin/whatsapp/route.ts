import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { conciergeContentSid, conciergeContentVariables } from "@/lib/crm/concierge-notices";
import { uploadCrmFile } from "@/lib/crm/files";
import { toE164 } from "@/lib/crm/phone";
import { isVercelPreview } from "@/lib/crm/preview-secrets";
import { stayDestinationLine } from "@/lib/crm/stay-phrase";
import { createServiceClient } from "@/lib/supabase/admin";
import { draftTemplateRefused, readStamp } from "@/lib/crm/whatsapp-inbox";
import { loadDockSnapshot, loadDockThread } from "@/lib/crm/whatsapp-dock-load";
import { agencySignoff, nextParisMorning } from "@/lib/crm/whatsapp-takeover";
import { sendContentTemplate } from "@/lib/crm/whatsapp";
import { sendWhatsappSession, sessionAddress } from "@/lib/crm/whatsapp-session";

export const runtime = "nodejs";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const fil = new URL(request.url).searchParams.get("fil")?.trim() || "";
  try {
    if (!fil) {
      const snapshot = await loadDockSnapshot();
      return NextResponse.json(snapshot);
    }
    if (fil.length > 40) return jsonError("Fil inconnu", 400);
    const thread = await loadDockThread(fil);
    return NextResponse.json(thread);
  } catch {
    return jsonError("Service indisponible", 503);
  }
}

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const body = (await request.json().catch(() => null)) as {
    action?: string;
    customerId?: string;
    bookingId?: string;
    phone?: string;
    text?: string;
    body?: string;
    template?: string;
    requestId?: string;
    firstName?: string;
    lastName?: string;
    mediaName?: string;
    mediaType?: string;
    mediaBase64?: string;
  } | null;
  const action = body?.action;
  const phone = toE164(body?.phone || "", "FR");
  const customerId = body?.customerId && ID.test(body.customerId) ? body.customerId : null;
  const bookingId = body?.bookingId && ID.test(body.bookingId) ? body.bookingId : null;
  const requestId = body?.requestId && ID.test(body.requestId) ? body.requestId : null;
  if (action !== "reply" && action !== "resume" && action !== "done" && action !== "create-client" && action !== "read") {
    return jsonError("Action inconnue", 400);
  }
  if ((action === "reply" || action === "resume" || action === "read") && !phone) return jsonError("Téléphone manquant", 400);

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

  if (action === "create-client") {
    if (!phone) return jsonError("Téléphone manquant", 400);
    const firstName = (body?.firstName || "").trim();
    const lastName = (body?.lastName || "").trim();
    if (firstName.length < 2 || lastName.length < 2) return jsonError("Prénom et nom requis", 400);
    const created = await admin
      .from("crm_customers")
      .insert({ first_name: firstName, last_name: lastName, phone, email: null, language: "fr" })
      .select("id")
      .single();
    if (created.error || !created.data) return jsonError("La fiche n’a pas été créée.", 400);
    const id = created.data.id as string;
    await admin.from("crm_whatsapp_messages").update({ customer_id: id }).eq("phone", phone);
    await admin.from("crm_whatsapp_threads").update({ customer_id: id }).eq("phone", phone);
    return NextResponse.json({ ok: true, customerId: id, invited: false });
  }

  if (action === "read") {
    const marked = await admin.from("crm_whatsapp_threads").upsert({
      phone,
      customer_id: customerId,
      staff_read_at: readStamp(),
      updated_at: readStamp(),
    });
    if (marked.error && !/column|schema cache/i.test(marked.error.message || "")) {
      console.error("[whatsapp] lu", marked.error.code || "error");
    }
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

  const template = (body?.template || "").trim();
  const text = agencySignoff((body?.body || body?.text || "").trim());
  if (isVercelPreview()) return jsonError("Envoi coupé sur l’aperçu.", 403);
  if (template && draftTemplateRefused(template)) {
    return jsonError("Ce modèle n’est pas soumis à Meta.", 400);
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recent = await admin
    .from("crm_whatsapp_messages")
    .select("id")
    .eq("direction", "inbound")
    .eq("phone", phone)
    .gte("created_at", since)
    .limit(1);
  let windowOpen = !recent.error && (recent.data || []).length > 0;
  if (recent.error && customerId) {
    const byCustomer = await admin
      .from("crm_whatsapp_messages")
      .select("created_at")
      .eq("customer_id", customerId)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1);
    const at = (byCustomer.data?.[0] as { created_at?: string } | undefined)?.created_at || "";
    windowOpen = Boolean(at && at >= since);
  }
  const to = sessionAddress(phone || "");
  if (!to) return jsonError("Téléphone manquant", 400);

  let sentBody = text;
  let sentSid: string | null = null;
  let mediaPath: string | null = null;
  if (body?.mediaBase64 && body.mediaType && /^image\/|^application\/pdf$/.test(body.mediaType)) {
    const bytes = Buffer.from(body.mediaBase64, "base64");
    if (bytes.length > 0 && bytes.length < 8_000_000) {
      const ext = body.mediaType === "application/pdf" ? "pdf" : "jpg";
      mediaPath = `whatsapp/${(phone || "").replace(/\D/g, "")}/${crypto.randomUUID()}.${ext}`;
      await uploadCrmFile(mediaPath, bytes, body.mediaType);
    }
  }

  if (template) {
    const key = template as "sejour_texte" | "rappel";
    const sid = conciergeContentSid(key);
    if (!sid || !bookingId) return jsonError("Ce modèle approuvé a besoin du séjour.", 400);
    const booking = await admin.from("crm_bookings").select("reference, title, destination, share_code").eq("id", bookingId).maybeSingle();
    const reference = booking.data?.reference || "";
    const place = booking.data ? stayDestinationLine(booking.data) : "";
    const suffix = "";
    const variables = conciergeContentVariables({ template: key, buttonSuffix: suffix, place, reference });
    if (!variables) return jsonError("Hors des 24 heures. Le modèle approuvé attend le lien du séjour.", 400);
    const sent = await sendContentTemplate({ phone, contentSid: sid, variables });
    if (!sent.ok) return jsonError("WhatsApp n’a pas accepté le modèle.", 502);
    sentSid = sent.sid;
    sentBody = text || `Modèle ${template}`;
  } else {
    if (!windowOpen) return jsonError("Hors des 24 heures. Choisissez un modèle approuvé.", 400);
    if (text.length < 2 || text.length > 1200) return jsonError("Message trop court", 400);
    const sent = await sendWhatsappSession({ to, body: text });
    if (!sent.ok) return jsonError("WhatsApp n’a pas accepté le message.", 502);
    sentSid = sent.sid;
  }

  const now = new Date();
  const inserted = await admin.from("crm_whatsapp_messages").insert({
    customer_id: customerId,
    booking_id: bookingId,
    direction: "outbound",
    template_key: template || "staff",
    body: sentBody,
    twilio_sid: sentSid,
    status: "sent",
    error: null,
    phone,
    author_staff_id: auth.staff.id,
    media_path: mediaPath,
  });
  if (inserted.error && /column|schema cache/i.test(inserted.error.message || "")) {
    await admin.from("crm_whatsapp_messages").insert({
      customer_id: customerId,
      booking_id: bookingId,
      direction: "outbound",
      template_key: template || "staff",
      body: sentBody,
      twilio_sid: sentSid,
      status: "sent",
      error: null,
    });
  }
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
