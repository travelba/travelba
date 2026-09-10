import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/agency/auth";
import { getWhatsAppBusinessConfig } from "@/lib/agency/whatsapp";
import { siteConfig } from "@/lib/site";

export const runtime = "nodejs";

/** Statut config WhatsApp Twilio TBA (sans exposer le token). */
export async function GET() {
  const auth = await requireAdminUser();
  if (auth instanceof NextResponse) return auth;

  const cfg = getWhatsAppBusinessConfig();
  return NextResponse.json({
    provider: "twilio",
    configured: cfg.configured,
    label: cfg.label,
    display_number: cfg.displayNumber || siteConfig.whatsappNumber,
    display_formatted: siteConfig.whatsappDisplay,
    from_set: Boolean(cfg.from),
    messaging_service_set: Boolean(cfg.messagingServiceSid),
    content_sid_set: Boolean(cfg.contentSid),
    account_sid_set: Boolean(cfg.accountSid),
    auth_token_set: Boolean(cfg.authToken),
    hint: cfg.configured
      ? `Envoi WhatsApp via Twilio (${siteConfig.name})`
      : `Configurer TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_WHATSAPP_FROM (whatsapp:${siteConfig.whatsappDisplay.replace(/\s/g, "")})`,
  });
}
