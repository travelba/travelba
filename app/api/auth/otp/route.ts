import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/admin";
import { siteConfig } from "@/lib/site";
import { agencyEmailHtml } from "@/lib/crm/email-html";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function authErrorMessage(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("rate limit") || lower.includes("over_email_send_rate_limit")) {
    return "Trop de tentatives. Réessayez dans quelques minutes.";
  }
  return "Erreur serveur. Réessayez dans un instant.";
}

export async function POST(request: Request) {
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

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromAddress =
    process.env.CONTACT_FROM_EMAIL?.trim() || "contact@travelba.fr";
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    siteConfig.url ||
    "https://travelba.fr"
  ).replace(/\/$/, "");

  try {
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
      type: "magiclink",
      email,
    });

    if (error || !data?.properties?.hashed_token) {
      console.info("[auth/otp] generateLink:", error?.message || "no token");
      return NextResponse.json({ ok: true });
    }

    const callback = new URL("/auth/callback", siteUrl);
    callback.searchParams.set("token_hash", data.properties.hashed_token);
    callback.searchParams.set("type", "magiclink");
    callback.searchParams.set("next", "/mon-compte");

    if (!apiKey) {
      console.info("[auth/otp] RESEND_API_KEY manquante — e-mail non envoyé");
      return NextResponse.json({ ok: true });
    }

    const resend = new Resend(apiKey);
    const { error: sendError } = await resend.emails.send({
      from: `${siteConfig.shortName} <${fromAddress}>`,
      to: [email],
      replyTo: siteConfig.contactEmail,
      subject: `Votre lien de connexion ${siteConfig.shortName}`,
      html: agencyEmailHtml({
        title: "Votre lien de connexion",
        preheader: "Le lien expire sous 24 heures.",
        bodyHtml: `<p style="margin:0;line-height:1.5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#0B192C">Cliquez sur le bouton pour ouvrir votre espace. Le lien expire sous 24&nbsp;heures.</p>`,
        ctaLabel: "Me connecter",
        ctaHref: callback.toString(),
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
