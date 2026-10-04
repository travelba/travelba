import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/admin";
import { siteConfig } from "@/lib/site";
import { agencyEmailHtml } from "@/lib/crm/email-html";
import { connexionMessage, greetingForWhatsapp, sendConnexionWhatsapp } from "@/lib/crm/whatsapp";
import { createEntryLink } from "@/lib/crm/entry-link";
import { tokenMailCc } from "@/lib/crm/outbound-mail";
import { productionOnlySecret } from "@/lib/crm/preview-secrets";
import { padDuration, rateLimitAll, rateLimitKey, requestIp } from "@/lib/crm/rate-limit";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Temps de réponse plancher : la branche « e-mail inconnu » ne doit pas se reconnaître à sa vitesse. */
const MIN_RESPONSE_MS = 400;
const WINDOW_SECONDS = 15 * 60;

function authErrorMessage(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("rate limit") || lower.includes("over_email_send_rate_limit")) {
    return "Trop de tentatives. Réessayez dans quelques minutes.";
  }
  return "Erreur serveur. Réessayez dans un instant.";
}

export async function POST(request: Request) {
  const started = Date.now();
  let body: { email?: string; channel?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const channel = body.channel === "whatsapp" ? "whatsapp" : "email";
  const email = body.email?.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Adresse e-mail invalide" }, { status: 400 });
  }

  const response = await handle(request, email, channel);
  await padDuration(started, MIN_RESPONSE_MS);
  return response;
}

async function handle(request: Request, email: string, channel: "whatsapp" | "email") {
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
      { key: rateLimitKey("otp:email", email), limit: 5, windowSeconds: WINDOW_SECONDS },
      { key: rateLimitKey("otp:ip", requestIp(request.headers)), limit: 20, windowSeconds: WINDOW_SECONDS },
    ]);
    if (!allowed) return NextResponse.json({ ok: true });

    const supabase = createServiceClient();
    const { data: customer } = await supabase
      .from("crm_customers")
      .select("id, auth_user_id, first_name, phone")
      .eq("email", email)
      .maybeSingle();
    if (!customer?.auth_user_id) {
      return NextResponse.json({ ok: true });
    }

    const { data, error } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (error || !data?.properties?.hashed_token) {
      console.info("[auth/otp] generateLink:", error?.message || "no token");
      return NextResponse.json({ ok: true });
    }

    const link = await createEntryLink(supabase, siteUrl, {
      tokenHash: data.properties.hashed_token,
      otpType: "magiclink",
      nextPath: "/mon-compte",
      email,
    });

    if (channel === "whatsapp") {
      // L’opt-in WhatsApp ne se pose jamais depuis une requête anonyme (B-09) :
      // il vient de l’invitation agence ou d’un geste du client connecté.
      const sent = await sendConnexionWhatsapp({
        phone: customer.phone,
        firstName: customer.first_name,
        link,
      });
      if (sent.ok) {
        await supabase.from("crm_whatsapp_messages").insert({
          customer_id: customer.id,
          direction: "outbound",
          template_key: "connexion",
          body: connexionMessage(greetingForWhatsapp(customer.first_name) || ""),
          twilio_sid: sent.sid,
          status: "sent",
        });
      }
      return NextResponse.json({ ok: true });
    }

    if (!apiKey) {
      console.info("[auth/otp] RESEND_API_KEY manquante — e-mail non envoyé");
      return NextResponse.json({ ok: true });
    }

    const resend = new Resend(apiKey);
    const { error: sendError } = await resend.emails.send({
      from: `${siteConfig.shortName} <${fromAddress}>`,
      to: [email],
      cc: tokenMailCc(),
      replyTo: siteConfig.contactEmail,
      subject: `Votre lien de connexion ${siteConfig.shortName}`,
      html: agencyEmailHtml({
        title: "Votre lien de connexion",
        preheader: "Le lien expire sous 24 heures.",
        bodyHtml: `<p style="margin:0;line-height:1.5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#0B192C">Cliquez sur le bouton pour ouvrir votre espace. Le lien expire sous 24&nbsp;heures.</p>`,
        ctaLabel: "Me connecter",
        ctaHref: link,
        footnote: "Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.",
      }),
    });

    if (sendError) {
      console.error("[auth/otp] Resend:", sendError);
      return NextResponse.json({ error: "Échec d’envoi de l’e-mail. Réessayez." }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[auth/otp] Unexpected:", err);
    return NextResponse.json({ error: authErrorMessage(err instanceof Error ? err.message : "Erreur serveur") }, { status: 500 });
  }
}
