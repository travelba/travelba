import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/admin";
import { siteConfig } from "@/lib/site";
import { SET_PASSWORD_PATH } from "@/lib/crm/session";
import { createEntryLink } from "@/lib/crm/entry-link";
import { agencyEmailHtml } from "@/lib/crm/email-html";
import { productionOnlySecret } from "@/lib/crm/preview-secrets";
import { padDuration, rateLimitAll, rateLimitKey, requestIp } from "@/lib/crm/rate-limit";
import { staffResetDecision } from "@/lib/crm/staff-reset";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_RESPONSE_MS = 400;
const WINDOW_SECONDS = 15 * 60;

export async function POST(request: Request) {
  const started = Date.now();
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }
  const email = body.email?.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Adresse e-mail invalide" }, { status: 400 });
  }
  const response = await handle(request, email);
  await padDuration(started, MIN_RESPONSE_MS);
  return response;
}

async function handle(request: Request, email: string) {
  try {
    const allowed = await rateLimitAll([
      { key: rateLimitKey("staff-reset:email", email), limit: 5, windowSeconds: WINDOW_SECONDS },
      { key: rateLimitKey("staff-reset:ip", requestIp(request.headers)), limit: 20, windowSeconds: WINDOW_SECONDS },
    ]);
    if (!allowed) return NextResponse.json({ ok: true });

    const supabase = createServiceClient();
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email,
    });
    const userId = !error && data?.user?.id ? data.user.id : null;
    const { data: staff } = userId
      ? await supabase.from("crm_staff").select("id").eq("auth_user_id", userId).maybeSingle()
      : { data: null };
    if (staffResetDecision({ userId, staffId: staff?.id || null }) !== "send") {
      return NextResponse.json({ ok: true });
    }
    if (!data?.properties?.hashed_token) return NextResponse.json({ ok: true });

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || siteConfig.url || "https://travelba.fr").replace(/\/$/, "");
    const link = await createEntryLink(supabase, siteUrl, {
      tokenHash: data.properties.hashed_token,
      otpType: "recovery",
      nextPath: SET_PASSWORD_PATH,
      email,
      channel: "email",
    });
    const apiKey = productionOnlySecret(process.env.RESEND_API_KEY);
    if (!apiKey) return NextResponse.json({ ok: true });

    const fromAddress = process.env.CONTACT_FROM_EMAIL?.trim() || "contact@travelba.fr";
    const resend = new Resend(apiKey);
    const html = agencyEmailHtml({
      title: "Mot de passe de l’espace agence",
      preheader: "Lien réservé à l’équipe. Il ne crée pas de compte.",
      bodyHtml: `<p style="margin:0;line-height:1.5;font-family:Helvetica,Arial,sans-serif;color:#0B192C">Un lien pour choisir un nouveau mot de passe de l’espace agence. Il ne crée pas de compte.</p>`,
      ctaLabel: "Choisir un mot de passe",
      ctaHref: link,
      footnote: "Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.",
    });
    const { error: sendError } = await resend.emails.send({
      from: `${siteConfig.shortName} <${fromAddress}>`,
      to: [email],
      replyTo: siteConfig.contactEmail,
      subject: "Mot de passe de l’espace agence",
      html,
    });
    if (sendError) return NextResponse.json({ error: "Envoi impossible. Réessayez." }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
