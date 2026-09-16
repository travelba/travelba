import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/admin";
import { siteConfig } from "@/lib/site";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function authErrorMessage(message: string) {
  const lower = message.toLowerCase();
  if (
    lower.includes("rate limit") ||
    lower.includes("over_email_send_rate_limit")
  ) {
    return "Trop de tentatives. Réessayez dans quelques minutes.";
  }
  return message;
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
    return NextResponse.json(
      { error: "Adresse e-mail invalide" },
      { status: 400 }
    );
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Envoi e-mail non configuré (RESEND_API_KEY)." },
      { status: 503 }
    );
  }

  const fromAddress =
    process.env.CONTACT_FROM_EMAIL?.trim() || "contact@travelba.fr";
  const requestOrigin = (() => {
    try {
      return new URL(request.url).origin;
    } catch {
      return "";
    }
  })();
  const siteUrl = (
    requestOrigin ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    siteConfig.url ||
    "https://travelba.fr"
  ).replace(/\/$/, "");

  try {
    const supabase = createServiceClient();
    const { data: customer, error: customerError } = await supabase
      .from("crm_customers")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (customerError) {
      console.error("[auth/otp] customer lookup:", customerError.message);
      return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
    if (!customer) {
      // Uniform response avoids exposing the agency's customer list.
      return NextResponse.json({ ok: true, digits: 6 });
    }

    const recipientHash = createHash("sha256").update(email).digest("hex");
    const forwardedFor =
      request.headers.get("x-vercel-forwarded-for") ||
      request.headers.get("x-forwarded-for") ||
      "unknown";
    const ip = forwardedFor.split(",", 1)[0]?.trim() || "unknown";
    const ipHash = createHash("sha256").update(ip).digest("hex");
    const { data: allowed, error: rateLimitError } = await supabase.rpc(
      "crm_allow_otp_request",
      {
        p_email_hash: recipientHash,
        p_ip_hash: ipHash,
      }
    );
    if (rateLimitError) {
      console.error("[auth/otp] rate limit:", rateLimitError.message);
      return NextResponse.json(
        { error: "Service de connexion temporairement indisponible." },
        { status: 503 }
      );
    }
    if (!allowed) {
      return NextResponse.json(
        { error: "Un code vient déjà d’être envoyé. Patientez une minute." },
        { status: 429 }
      );
    }

    const { data, error } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent("/mon-compte")}`,
      },
    });

    if (error) {
      console.error("[auth/otp] generateLink:", error.message);
      return NextResponse.json(
        { error: authErrorMessage(error.message) },
        { status: 400 }
      );
    }

    const otp = data.properties?.email_otp;
    if (!otp) {
      return NextResponse.json(
        { error: "Impossible de générer le code." },
        { status: 500 }
      );
    }

    const resend = new Resend(apiKey);
    const minuteBucket = Math.floor(Date.now() / 60_000);
    const { error: sendError } = await resend.emails.send(
      {
        from: `${siteConfig.shortName} <${fromAddress}>`,
        to: [email],
        subject: `Votre code de connexion ${siteConfig.shortName}`,
        text: `Votre code de connexion ${siteConfig.shortName} : ${otp}\n\nIl expire dans quelques minutes.`,
        html: `
        <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0b1f3a">
          <p style="margin:0 0 8px;font-size:14px;color:#64748b">Connexion sécurisée</p>
          <h1 style="margin:0 0 16px;font-size:22px">Votre code ${siteConfig.shortName}</h1>
          <p style="margin:0 0 20px;font-size:36px;font-weight:800;letter-spacing:0.2em">${otp}</p>
          <p style="margin:0;font-size:13px;color:#64748b">Ce code expire dans quelques minutes. Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.</p>
        </div>
      `,
      },
      { idempotencyKey: `login-otp/${recipientHash}/${minuteBucket}` }
    );

    if (sendError) {
      console.error("[auth/otp] Resend:", sendError);
      if (sendError.statusCode === 409) {
        return NextResponse.json(
          { error: "Un code vient déjà d’être envoyé. Patientez une minute." },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { error: "Échec d’envoi de l’e-mail. Réessayez." },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, digits: String(otp).length });
  } catch (err) {
    console.error("[auth/otp] Unexpected:", err);
    const message = err instanceof Error ? err.message : "";
    if (message.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return NextResponse.json(
        {
          error:
            "Configuration serveur incomplète (clé service). Utilisez le dernier déploiement Preview ou contactez l’agence.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
