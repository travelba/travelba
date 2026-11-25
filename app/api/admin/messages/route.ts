import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { AppMessagesUnavailable, agencyReplyPush, postAgencyReply } from "@/lib/crm/app-messages";
import { appMessageDb } from "@/lib/crm/app-messages-db";
import { sendCustomerPush } from "@/lib/crm/push-notices";
import { RATE_LIMITED_MESSAGE, rateLimit, rateLimitKey } from "@/lib/crm/rate-limit";

export const runtime = "nodejs";

/** Réponse de l’agence dans le fil de l’application. Le client est prévenu par notification. */
export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const allowed = await rateLimit({ key: rateLimitKey("app-reply", auth.staff.id), limit: 60, windowSeconds: 900 });
  if (!allowed) return jsonError(RATE_LIMITED_MESSAGE, 429);
  const body = (await request.json().catch(() => null)) as { threadId?: unknown; body?: unknown } | null;
  const threadId = typeof body?.threadId === "string" ? body.threadId : "";
  const text = typeof body?.body === "string" ? body.body : "";
  try {
    const sent = await postAgencyReply(appMessageDb(), { threadId, staffId: auth.staff.id, body: text });
    if (!sent.ok) return jsonError(sent.error, sent.error === "Fil introuvable." ? 404 : 400);
    const copy = agencyReplyPush(sent.preview);
    await sendCustomerPush({
      customerId: sent.thread.customerId,
      kind: "messages",
      title: copy.title,
      body: copy.body,
      url: "/mon-compte/messages",
      idempotencyKey: `app-msg:${sent.message.id}`,
      bookingId: sent.thread.bookingId,
    });
    return NextResponse.json({ ok: true, id: sent.message.id });
  } catch (error) {
    if (error instanceof AppMessagesUnavailable) return jsonError("La messagerie n’est pas encore ouverte.", 503);
    console.error("[messages]", error instanceof Error ? error.message.slice(0, 80) : "réponse");
    return jsonError("La réponse n’a pas été envoyée.");
  }
}
