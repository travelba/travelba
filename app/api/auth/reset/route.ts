import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/admin";
import { siteConfig } from "@/lib/site";
import { SET_PASSWORD_PATH } from "@/lib/crm/session";
import { agencyEmailHtml } from "@/lib/crm/email-html";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
      type: "recovery",
      email,
    });

    if (error || !data?.user || !data.properties?.hashed_token) {
      console.info("[auth/reset] generateLink indisponible");
      return NextResponse.json({ ok: true });
    }

    const { data: fresh } = await supabase.auth.admin.getUserById(data.user.id);
    const meta = fresh.user?.app_metadata || data.user.app_metadata || {};
    await supabase.auth.admin.updateUserById(data.user.id, {
      app_metadata: { ...meta, must_set_password: true },
    });

    const callback = new URL("/auth/callback", siteUrl);
    callback.searchParams.set("token_hash", data.properties.hashed_token);
    callback.searchParams.set("type", "recovery");
    callback.searchParams.set("next", SET_PASSWORD_PATH);

    if (!apiKey) {
      console.info("[auth/reset] RESEND_API_KEY manquante — e-mail non envoyé");
      return NextResponse.json({ ok: true });
    }

    const resend = new Resend(apiKey);
    const { error: sendError } = await resend.emails.send({
      from: `${siteConfig.shortName} <${fromAddress}>`,
      to: [email],
      replyTo: siteConfig.contactEmail,
      subject: `Réinitialiser votre mot de passe ${siteConfig.shortName}`,
      html: agencyEmailHtml({
        title: siteConfig.shortName,
        bodyHtml: `<p style="margin:0 0 16px;line-height:1.5">Cliquez sur le bouton pour choisir un nouveau mot de passe.</p>`,
        ctaLabel: "Définir mon mot de passe",
        ctaHref: callback.toString(),
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
