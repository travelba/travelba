import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/admin";
import { siteConfig } from "@/lib/site";
import { customerFullName, type CrmCustomer } from "@/lib/crm/types";
import { SET_PASSWORD_PATH, mustSetPassword } from "@/lib/crm/session";
import { agencyEmailHtml, escapeHtml } from "@/lib/crm/email-html";
import {
  connexionMessage,
  greetingForWhatsapp,
  inviteWhatsappNotice,
  sendConnexionWhatsapp,
  type WhatsappSendResult,
} from "@/lib/crm/whatsapp";
import { createEntryLink } from "@/lib/crm/entry-link";
import { greetingGivenName } from "@/lib/crm/identity";

export type PortalAccess = {
  status: "none" | "invited" | "ready";
  lastSignInAt: string | null;
};

export type InviteResult = {
  customer: CrmCustomer;
  delivered: boolean;
  link: string;
  whatsapp: WhatsappSendResult;
  notice: string;
};

export function appOrigin(request: Request) {
  const env = (process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/$/, "");
  if (env) return env;
  return new URL(request.url).origin;
}

function isAlreadyRegistered(message: string) {
  return /already been registered|already registered|email_exists|user already exists/i.test(
    message
  );
}

function inviteEmailHtml(customer: CrmCustomer, link: string) {
  const who = greetingGivenName(customer.first_name);
  const hello = who ? `Bonjour ${escapeHtml(who)},` : "Bonjour,";
  return agencyEmailHtml({
    title: "Votre espace est prêt",
    preheader: "Définissez votre mot de passe — le lien reste valable 30 jours.",
    bodyHtml: `
      <p style="margin:0 0 16px;line-height:1.5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#0B192C">${hello}</p>
      <p style="margin:0;line-height:1.5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#0B192C">
        Votre espace ${escapeHtml(siteConfig.name)} est prêt.
        Définissez votre mot de passe pour y accéder — le lien reste valable 30&nbsp;jours.
      </p>
    `,
    ctaLabel: "Accéder à mon espace",
    ctaHref: link,
    footnote:
      "Si vous n’êtes pas à l’origine de cette invitation, ignorez cet e-mail.",
  });
}

async function sendInviteEmail(customer: CrmCustomer, link: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.info("[invite] RESEND_API_KEY manquante — e-mail non envoyé, lien renvoyé à l’écran admin");
    return false;
  }

  const from = process.env.CONTACT_FROM_EMAIL || "onboarding@resend.dev";
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: `${siteConfig.name} <${from}>`,
    to: [customer.email],
    replyTo: siteConfig.contactEmail,
    subject: "Votre espace voyageur est prêt",
    html: inviteEmailHtml(customer, link),
  });
  if (error) {
    console.error("[invite] Resend error:", error);
    throw new Error("L’envoi de l’invitation a échoué");
  }
  return true;
}

export async function getPortalAccess(customer: CrmCustomer): Promise<PortalAccess> {
  if (!customer.auth_user_id) return { status: "none", lastSignInAt: null };
  try {
    const admin = createServiceClient();
    const { data, error } = await admin.auth.admin.getUserById(customer.auth_user_id);
    if (error || !data.user) return { status: "none", lastSignInAt: null };
    return {
      status: mustSetPassword(data.user) ? "invited" : "ready",
      lastSignInAt: data.user.last_sign_in_at ?? null,
    };
  } catch {
    return { status: "none", lastSignInAt: null };
  }
}

export async function inviteCustomer(
  customer: CrmCustomer,
  origin: string
): Promise<InviteResult> {
  const admin = createServiceClient();
  const email = customer.email.trim().toLowerCase();
  const metadata = {
    first_name: customer.first_name,
    last_name: customer.last_name,
    full_name: customerFullName(customer),
  };

  let linkType: "invite" | "recovery" = "invite";
  let generated = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: metadata },
  });

  if (generated.error && isAlreadyRegistered(generated.error.message)) {
    linkType = "recovery";
    generated = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
    });
  }

  if (generated.error || !generated.data?.user || !generated.data.properties?.hashed_token) {
    throw new Error(generated.error?.message || "Impossible de générer l’invitation");
  }

  const authUser = generated.data.user;
  const hashedToken = generated.data.properties.hashed_token;
  const { data: fresh } = await admin.auth.admin.getUserById(authUser.id);
  const currentMeta = fresh.user?.app_metadata || authUser.app_metadata || {};

  const { error: metaError } = await admin.auth.admin.updateUserById(authUser.id, {
    user_metadata: { ...authUser.user_metadata, ...metadata },
    app_metadata: { ...currentMeta, must_set_password: true, crm_role: "client" },
  });
  if (metaError) throw new Error(metaError.message);

  let linked = customer;
  if (customer.auth_user_id !== authUser.id) {
    const { data: updated, error: linkError } = await admin
      .from("crm_customers")
      .update({ auth_user_id: authUser.id })
      .eq("id", customer.id)
      .select("*")
      .single();
    if (linkError) throw new Error(linkError.message);
    linked = updated as CrmCustomer;
  }

  const link = await createEntryLink(admin, origin, {
    tokenHash: hashedToken,
    otpType: linkType,
    nextPath: SET_PASSWORD_PATH,
  });
  let whatsapp: WhatsappSendResult = { ok: false, reason: "rejected" };
  try {
    await admin
      .from("crm_customers")
      .update({ whatsapp_opt_in_at: new Date().toISOString() })
      .eq("id", linked.id)
      .is("whatsapp_opt_in_at", null);
    whatsapp = await sendConnexionWhatsapp({
      phone: linked.phone,
      firstName: linked.first_name,
      link,
    });
    if (!whatsapp.ok && whatsapp.reason === "not_configured") {
      console.info("[invite] TWILIO_CONTENT_CONNEXION absente — WhatsApp non envoyé");
    }
    if (whatsapp.ok || (!whatsapp.ok && whatsapp.reason === "rejected")) {
      const { error: logError } = await admin.from("crm_whatsapp_messages").insert({
        customer_id: linked.id,
        direction: "outbound",
        template_key: "connexion",
        body: connexionMessage(greetingForWhatsapp(linked.first_name) || ""),
        twilio_sid: whatsapp.ok ? whatsapp.sid : null,
        status: whatsapp.ok ? "sent" : "failed",
        error: whatsapp.ok ? null : whatsapp.detail || whatsapp.reason,
      });
      if (logError) console.error("[invite] journal WhatsApp:", logError.message);
    }
  } catch (err) {
    console.error("[invite] WhatsApp:", err instanceof Error ? err.message : "échec");
    whatsapp = { ok: false, reason: "rejected" };
  }
  let delivered = false;
  try {
    delivered = await sendInviteEmail(linked, link);
  } catch (err) {
    console.error("[invite] e-mail:", err instanceof Error ? err.message : "échec");
  }
  return {
    customer: linked,
    delivered,
    link,
    whatsapp,
    notice: inviteWhatsappNotice(whatsapp),
  };
}
