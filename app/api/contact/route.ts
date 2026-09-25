import { NextResponse } from "next/server";
import { Resend } from "resend";
import { siteConfig } from "@/lib/site";
import { productionOnlySecret } from "@/lib/crm/preview-secrets";

export const runtime = "nodejs";

type ContactPayload = {
  name?: string;
  email?: string;
  phone?: string;
  service?: string;
  message?: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(request: Request) {
  let body: ContactPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const name = body.name?.trim();
  const email = body.email?.trim();
  const message = body.message?.trim();

  if (!name || !email || !message) {
    return NextResponse.json(
      { error: "Nom, e-mail et message requis" },
      { status: 400 }
    );
  }

  const phone = body.phone?.trim() || "—";
  const service = body.service?.trim() || "—";

  const apiKey = productionOnlySecret(process.env.RESEND_API_KEY);
  // Sans RESEND_API_KEY (dev), la demande n’est pas envoyée ; on ne logue pas les
  // coordonnées du visiteur.
  if (!apiKey) {
    console.warn("[contact] RESEND_API_KEY manquante — demande non livrée");
    return NextResponse.json({ ok: true, delivered: false });
  }

  const resend = new Resend(apiKey);
  const from = process.env.CONTACT_FROM_EMAIL || "onboarding@resend.dev";
  const to = process.env.CONTACT_TO_EMAIL || siteConfig.contactEmail;

  try {
    const { error } = await resend.emails.send({
      from: `${siteConfig.name} <${from}>`,
      to: [to],
      replyTo: email,
      subject: `Nouvelle demande — ${service} — ${name}`,
      html: `
        <h2>Nouvelle demande de contact</h2>
        <p><strong>Nom :</strong> ${escapeHtml(name)}</p>
        <p><strong>E-mail :</strong> ${escapeHtml(email)}</p>
        <p><strong>Téléphone :</strong> ${escapeHtml(phone)}</p>
        <p><strong>Service :</strong> ${escapeHtml(service)}</p>
        <p><strong>Message :</strong></p>
        <p>${escapeHtml(message).replace(/\n/g, "<br/>")}</p>
      `,
    });

    if (error) {
      console.error("[contact] Resend error:", error);
      return NextResponse.json({ error: "Envoi impossible" }, { status: 502 });
    }

    return NextResponse.json({ ok: true, delivered: true });
  } catch (err) {
    console.error("[contact] Unexpected error:", err);
    return NextResponse.json({ error: "Envoi impossible" }, { status: 500 });
  }
}
