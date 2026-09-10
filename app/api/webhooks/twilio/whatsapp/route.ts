import { after } from "next/server";
import {
  emptyTwiml,
  parseTwilioInbound,
} from "@/lib/agency/twilio-inbound";
import { handleTwilioWhatsAppInbound } from "@/lib/agency/wa-ops-agent";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  return new Response("Travelba WhatsApp webhook", { status: 200 });
}

export async function POST(request: Request) {
  let parsed;
  try {
    parsed = await parseTwilioInbound(request);
  } catch (err) {
    console.error("[wa-webhook] parse", err);
    return emptyTwiml();
  }

  if (!parsed.signatureOk) {
    return new Response("Invalid signature", { status: 403 });
  }

  const inbound = parsed.inbound;
  after(async () => {
    try {
      await handleTwilioWhatsAppInbound(inbound);
    } catch (err) {
      console.error("[wa-webhook] handle", err);
    }
  });

  return emptyTwiml();
}
