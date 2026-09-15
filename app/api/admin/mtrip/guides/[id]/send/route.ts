import { NextResponse } from "next/server";
import { requireAdminUser, jsonError } from "@/lib/agency/auth";
import { sendDossierToLead } from "@/lib/agency/send-voyage";
import { siteConfig } from "@/lib/site";
import type { AgencyMtripGuide } from "@/lib/mtrip/guide-types";
import { WhatsAppConfigError } from "@/lib/agency/whatsapp";
import { MtripError } from "@/lib/mtrip/client";

export const runtime = "nodejs";
export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAdminUser();
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;
  const { id } = await params;

  const body = await request.json().catch(() => ({}));
  const autoPublish = body?.publish === true;

  const { data: guideRow, error } = await supabase
    .from("agency_mtrip_guides")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return jsonError(error.message, 500);
  if (!guideRow) return jsonError("Voyage introuvable", 404);

  try {
    const result = await sendDossierToLead(
      supabase,
      user.id,
      guideRow as AgencyMtripGuide,
      { publish: autoPublish }
    );
    return NextResponse.json({
      guide: result.guide,
      message: result.message,
      send: result.send,
      quote_url: result.quote_url,
      expense_url: result.expense_url,
      trip_url: result.trip_url,
      app_links: result.app_links,
      traveler_passwords: result.traveler_passwords,
      business: {
        label: siteConfig.name,
        from: result.send.from_display || siteConfig.whatsappNumber,
        channel: result.send.channel,
      },
    });
  } catch (err) {
    const isConfig = err instanceof WhatsAppConfigError;
    const isMtrip = err instanceof MtripError;
    const status = isConfig
      ? 503
      : isMtrip
        ? err.status >= 400 && err.status < 600
          ? err.status
          : 502
        : 502;
    const message =
      err instanceof MtripError
        ? typeof err.body === "object" &&
          err.body &&
          "message" in err.body &&
          typeof (err.body as { message: unknown }).message === "string"
          ? (err.body as { message: string }).message
          : err.message
        : err instanceof Error
          ? err.message
          : "Envoi WhatsApp impossible";
    return jsonError(message, status);
  }
}
