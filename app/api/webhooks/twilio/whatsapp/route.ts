import { after, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { notifyConciergeRequest } from "@/lib/crm/whatsapp-alert";
import { issueConciergeMagicLink } from "@/lib/crm/whatsapp-access";
import { generateConciergeReply } from "@/lib/crm/whatsapp-conversation";
import { settleTakeoverIdle } from "@/lib/crm/whatsapp-handoff";
import { conciergeAutoreplyEnabled, createWhatsappSupabaseStore, receiveWhatsappWebhook } from "@/lib/crm/whatsapp-inbound";
import { sendWhatsappSession } from "@/lib/crm/whatsapp-session";
import { rateLimit, rateLimitKey } from "@/lib/crm/rate-limit";
import { formParams, twilioWebhookUrl, verifyTwilioSignature } from "@/lib/crm/twilio-signature";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const raw = await request.text();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim() || "";
  if (!token) return new NextResponse(null, { status: 503 });

  const params = new URLSearchParams(raw);
  const url = twilioWebhookUrl(request);
  if (
    !verifyTwilioSignature({
      authToken: token,
      url,
      params: formParams(params),
      signature: request.headers.get("x-twilio-signature"),
    })
  ) {
    return new NextResponse(null, { status: 403 });
  }
  const sid = (params.get("MessageSid") || "").trim();
  if (!sid) return new NextResponse(null, { status: 400 });

  let store: ReturnType<typeof createWhatsappSupabaseStore>;
  let admin: ReturnType<typeof createServiceClient>;
  try {
    admin = createServiceClient();
    store = createWhatsappSupabaseStore(admin);
  } catch {
    return new NextResponse(null, { status: 503 });
  }

  after(async () => {
    try {
      await receiveWhatsappWebhook({
        url,
        signature: request.headers.get("x-twilio-signature"),
        params,
        authToken: token,
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        burstWaitMs: 1200,
        agencyFrom: process.env.TWILIO_WHATSAPP_FROM,
        typingFetch: fetch,
        allow: (phone) =>
          rateLimit({ key: rateLimitKey("whatsapp", phone), limit: 20, windowSeconds: 600 }),
        alert: (row) => notifyConciergeRequest(row).then(() => undefined),
        store,
        beforeReply: async (phone) => {
          try {
            const settled = await settleTakeoverIdle(admin, phone);
            return settled.handled ? "stop" : "continue";
          } catch {
            console.error("[whatsapp-handoff] entree");
            return "continue";
          }
        },
        openAccess: (customer) => issueConciergeMagicLink(admin, customer.email),
        converse: generateConciergeReply,
        send: (message) =>
          sendWhatsappSession({ to: message.to, body: message.body, mediaUrl: message.mediaUrl }),
        autoreply: conciergeAutoreplyEnabled(),
      });
    } catch (err) {
      console.error("[whatsapp-concierge] async", err instanceof Error ? err.name : "error");
    }
  });
  return new NextResponse(null, { status: 200 });
}
