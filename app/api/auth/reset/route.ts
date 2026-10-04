import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/admin";
import { siteConfig } from "@/lib/site";
import { SET_PASSWORD_PATH } from "@/lib/crm/session";
import { agencyEmailHtml } from "@/lib/crm/email-html";
import { createEntryLink } from "@/lib/crm/entry-link";
import { tokenMailCc } from "@/lib/crm/outbound-mail";
import { productionOnlySecret } from "@/lib/crm/preview-secrets";
import { padDuration, rateLimitAll, rateLimitKey, requestIp } from "@/lib/crm/rate-limit";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Temps de réponse plancher : la branche « e-mail inconnu » ne doit pas se reconnaître à sa vitesse. */
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
  const apiKey = productionOnlySecret(process.env.RESEND_API_KEY);
  const fromAddress =
    process.env.CONTACT_FROM_EMAIL?.trim() || "contact@travelba.fr";
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    siteConfig.url ||
    "https://travelba.fr"
  ).replace(/\/$/, "");

  try {
    // 5 envois par e-mail et 20 par adresse IP sur 15 min. Au-delà : même réponse, rien n’est envoyé.
    const allowed = await rateLimitAll([
      { key: rateLimitKey("reset:email", email), limit: 5, windowSeconds: WINDOW_SECONDS },
      { key: rateLimitKey("reset:ip", requestIp(request.headers)), limit: 20, windowSeconds: WINDOW_SECONDS },
    ]);
    if (!allowed) return NextResponse.json({ ok: true });

    const supabase = createServiceClient();
    const { data: customer } = await supabase
      .from("crm_customers")
      .select("id, auth_user_id")
      .eq("email", email)
      .maybeSingle();
    if (!customer?.auth_user_id) {
      return NextResponse.json({ ok: true });
    }

    const { data, error } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email,
    });

    if (error || !data?.user || !data.properties?.hashed_token) {
      console.info("[auth/reset] generateLink indisponible");
      return NextResponse.json({ ok: true });
    }

    // Le drapeau est posé à l’ouverture du lien (recovery), pas ici :
    // sinon un mot de passe déjà connu renvoie vers la page de définition.
    const link = await createEntryLink(supabase, siteUrl, {
      tokenHash: data.properties.hashed_token,
      otpType: "recovery",
      nextPath: SET_PASSWORD_PATH,
      email,
    });

    if (!apiKey) {
      console.info("[auth/reset] RESEND_API_KEY manquante — e-mail non envoyé");
      return NextResponse.json({ ok: true });
    }

    const resend = new Resend(apiKey);
    const { error: sendError } = await resend.emails.send({
      from: `${siteConfig.shortName} <${fromAddress}>`,
      to: [email],
      cc: tokenMailCc(),
      replyTo: siteConfig.contactEmail,
      subject: `Réinitialiser votre mot de passe ${siteConfig.shortName}`,
      html: agencyEmailHtml({
        title: "Choisissez un nouveau mot de passe",
        preheader: "Ce lien ouvre la page pour définir votre mot de passe.",
        bodyHtml: `<p style="margin:0;line-height:1.5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#0B192C">Cliquez sur le bouton pour choisir un nouveau mot de passe.</p>`,
        ctaLabel: "Définir mon mot de passe",
        ctaHref: link,
        footnote: "Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.",
      }),
    });

    if (sendError) {
      console.error("[auth/reset] Resend:", sendError.name);
      return NextResponse.json({ error: "Échec d’envoi de l’e-mail. Réessayez." }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[auth/reset] Unexpected");
    return NextResponse.json(
      { error: err instanceof Error && /rate limit/i.test(err.message) ? "Trop de tentatives. Réessayez dans quelques minutes." : "Erreur serveur" },
      { status: 500 }
    );
  }
}
