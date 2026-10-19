import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/crm/cron-auth";
import { productionOnlySecret } from "@/lib/crm/preview-secrets";
import { resubmitPrepositionTemplates, twilioContentConfigured } from "@/lib/crm/whatsapp-preposition";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Soumet les nouvelles versions des modèles dont la préposition est encore dans le corps.
 * N’envoie aucun WhatsApp et ne retire aucun modèle déjà approuvé.
 * Le jeton est WHATSAPP_TEMPLATE_ARM_TOKEN, distinct du cron. Absent : la route n’existe pas.
 */
export async function POST(request: Request) {
  const secret = productionOnlySecret(process.env.WHATSAPP_TEMPLATE_ARM_TOKEN);
  if (!secret) return NextResponse.json({ error: "Absent" }, { status: 404 });
  if (!cronAuthorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (!twilioContentConfigured()) {
    return NextResponse.json({ error: "Twilio absent", templates: [] }, { status: 200 });
  }
  const templates = await resubmitPrepositionTemplates();
  return NextResponse.json({ templates });
}
