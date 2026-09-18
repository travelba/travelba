import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/admin";
import { siteConfig } from "@/lib/site";
import { SET_PASSWORD_PATH } from "@/lib/crm/session";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
      html: `
        <div style="font-family:Georgia,serif;background:#F2F4F8;padding:32px 16px">
          <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;color:#002157">
            <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#E81932">Espace voyageur</p>
            <h1 style="margin:0 0 16px;font-size:24px">${escapeHtml(siteConfig.shortName)}</h1>
            <p style="margin:0 0 16px;line-height:1.5">
              Cliquez sur le bouton pour choisir un nouveau mot de passe.
            </p>
            <p style="margin:24px 0">
              <a href="${escapeHtml(callback.toString())}" style="display:inline-block;background:#E81932;color:#fff;text-decoration:none;padding:14px 22px;border-radius:999px;font-weight:600">
                Définir mon mot de passe
              </a>
            </p>
            <p style="margin:0;font-size:13px;color:#5b6475">
              Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.
            </p>
          </div>
        </div>
      `,
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
