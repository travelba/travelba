import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { issueConciergeMagicLink } from "@/lib/crm/whatsapp-access";
import { createWhatsappSupabaseStore, receiveWhatsappWebhook } from "@/lib/crm/whatsapp-inbound";
import { sendWhatsappSession } from "@/lib/crm/whatsapp-session";
import { twilioWebhookUrl } from "@/lib/crm/twilio-signature";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const raw = await request.text();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim() || "";
  if (!token) return new NextResponse(null, { status: 503 });

  let store: ReturnType<typeof createWhatsappSupabaseStore>;
  try {
    store = createWhatsappSupabaseStore(createServiceClient());
  } catch {
    return new NextResponse(null, { status: 503 });
  }

  try {
    const result = await receiveWhatsappWebhook({
      url: twilioWebhookUrl(request),
      signature: request.headers.get("x-twilio-signature"),
      params: new URLSearchParams(raw),
      authToken: token,
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      burstWaitMs: 1200,
      store,
      openAccess: (customer) => issueConciergeMagicLink(createServiceClient(), customer.email),
      send: (message) => sendWhatsappSession({ to: message.to, body: message.body }),
    });
    return new NextResponse(null, { status: result.status });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}
