import { NextResponse } from "next/server";
import { requireAdminUser, jsonError } from "@/lib/agency/auth";
import { sendOptInToLead } from "@/lib/agency/send-voyage";
import { siteConfig } from "@/lib/site";
import type { AgencyMtripGuide } from "@/lib/mtrip/guide-types";
import { WhatsAppConfigError } from "@/lib/agency/whatsapp";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

/**
 * Message 1 du plan WhatsApp Business : opt-in Concierge
 * (« Veux-tu recevoir ton dossier voyage ? » + boutons Oui / Non merci).
 */
export async function POST(_request: Request, { params }: Params) {
  const auth = await requireAdminUser();
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;
  const { id } = await params;

  const { data: guideRow, error } = await supabase
    .from("agency_mtrip_guides")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return jsonError(error.message, 500);
  if (!guideRow) return jsonError("Voyage introuvable", 404);

  try {
    const result = await sendOptInToLead(
      supabase,
      user.id,
      guideRow as AgencyMtripGuide
    );
    return NextResponse.json({
      guide: result.guide,
      message: result.body,
      send: result.send,
      used_buttons: result.send.used_buttons,
      business: {
        label: siteConfig.name,
        from: result.send.from_display || siteConfig.whatsappNumber,
        channel: result.send.channel,
      },
    });
  } catch (err) {
    const isConfig = err instanceof WhatsAppConfigError;
    return jsonError(
      err instanceof Error ? err.message : "Envoi opt-in WhatsApp impossible",
      isConfig ? 503 : 502
    );
  }
}
