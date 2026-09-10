import {
  fetchCursorAgent,
  parseCursorWebhook,
  verifyCursorWebhookSignature,
} from "@/lib/agency/cursor-cloud";
import {
  findSessionByCursorAgentId,
  parseSessionNotes,
  saveSessionNotes,
} from "@/lib/agency/wa-ops-session";
import { sendWhatsAppReply } from "@/lib/agency/whatsapp";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  return new Response("Travelba Cursor agent webhook", { status: 200 });
}

export async function POST(request: Request) {
  const raw = await request.text();
  const skip =
    process.env.CURSOR_WEBHOOK_VALIDATE === "0" ||
    process.env.CURSOR_WEBHOOK_VALIDATE === "false";
  const signature =
    request.headers.get("x-webhook-signature") ||
    request.headers.get("x-cursor-signature") ||
    "";
  if (!skip && !verifyCursorWebhookSignature(raw, signature)) {
    return new Response("Invalid signature", { status: 403 });
  }

  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const event = parseCursorWebhook(body);
  if (!event) {
    return new Response("Ignored", { status: 200 });
  }

  const status = event.status.toUpperCase();
  if (status !== "FINISHED" && status !== "ERROR" && status !== "FAILED") {
    return new Response("OK", { status: 200 });
  }

  const supabase = createServiceClient();
  const session = await findSessionByCursorAgentId(supabase, event.id);
  if (!session) {
    console.warn("[cursor-webhook] session introuvable", event.id);
    return new Response("OK", { status: 200 });
  }

  let prUrl = event.prUrl;
  if (!prUrl) {
    const live = await fetchCursorAgent(event.id);
    prUrl = live?.target?.prUrl || live?.target?.url || null;
  }

  const notes = parseSessionNotes(session.notes);
  notes.cursorStatus = status === "FINISHED" ? "finished" : "error";
  if (notes.awaiting === "cursor_confirm") notes.awaiting = null;
  await saveSessionNotes(supabase, session, notes);

  const ok = status === "FINISHED";
  const text = ok
    ? prUrl
      ? `PR prête : ${prUrl}`
      : "L’agent Cursor a fini. Je n’ai pas encore le lien PR — regarde le dashboard Cursor."
    : "L’agent Cursor a échoué. Tu peux reformuler, je relancerai une PR.";

  try {
    await sendWhatsAppReply({ toPhone: session.from_digits, body: text });
  } catch (err) {
    console.error("[cursor-webhook] whatsapp", err);
  }

  return new Response("OK", { status: 200 });
}
