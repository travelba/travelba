import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/admin";
import { siteConfig } from "@/lib/site";
import { customerFullName, type CrmCustomer } from "@/lib/crm/types";
import { SET_PASSWORD_PATH, mustSetPassword } from "@/lib/crm/session";
import { inviteClientMail } from "@/lib/crm/client-mails";
import { createEntryLink } from "@/lib/crm/entry-link";
import { STAFF_ACCOUNT_BLOCK, clientLinkToken, isStaffAccount } from "@/lib/crm/client-account";
import { tokenMailCc } from "@/lib/crm/outbound-mail";
import { sendAgencyAccessNotice } from "@/lib/crm/access-notice";
import { productionOnlySecret } from "@/lib/crm/preview-secrets";

export type PortalAccess = {
  status: "none" | "invited" | "ready";
  lastSignInAt: string | null;
};

export type InviteResult = {
  customer: CrmCustomer;
  delivered: boolean;
  link: string;
  notice: string;
};

export const INVITE_NOTICE = {
  sent: "Invitation envoyée par e-mail. Le WhatsApp « Enchanté » partira dès que le mot de passe sera enregistré.",
  copy: "E-mail non envoyé : copiez le lien ci-dessous. Le WhatsApp partira une fois le mot de passe enregistré.",
} as const;

/** Copie affichée après « Inviter ». Jamais de WhatsApp à ce stade : le lien crée le mot de passe. */
export function inviteNotice(delivered: boolean) {
  return delivered ? INVITE_NOTICE.sent : INVITE_NOTICE.copy;
}

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

async function sendInviteEmail(customer: CrmCustomer, link: string, origin: string) {
  const apiKey = productionOnlySecret(process.env.RESEND_API_KEY);
  if (!apiKey) {
    console.info("[invite] RESEND_API_KEY manquante — e-mail non envoyé, lien renvoyé à l’écran admin");
    return false;
  }

  const from = process.env.CONTACT_FROM_EMAIL || "onboarding@resend.dev";
  const resend = new Resend(apiKey);
  // Jamais de copie agence : l’e-mail porte le lien de connexion (B-02).
  const mail = inviteClientMail({ firstName: customer.first_name, link });
  const { error } = await resend.emails.send({
    from: `${siteConfig.name} <${from}>`,
    to: [customer.email],
    cc: tokenMailCc(),
    replyTo: siteConfig.contactEmail,
    subject: mail.subject,
    html: mail.html,
  });
  if (error) {
    console.error("[invite] Resend error:", error);
    throw new Error("L’envoi de l’invitation a échoué");
  }
  await sendAgencyAccessNotice({ apiKey, from, kind: "client", firstName: customer.first_name, origin });
  return true;
}

export async function getPortalAccess(customer: CrmCustomer): Promise<PortalAccess> {
  if (!customer.auth_user_id) return { status: "none", lastSignInAt: null };
  try {
    const admin = createServiceClient();
    const { data, error } = await admin.auth.admin.getUserById(customer.auth_user_id);
    if (error || !data.user) return { status: "none", lastSignInAt: null };
    let lastSignInAt = data.user.last_sign_in_at ?? null;
    const { data: latest, error: loginError } = await admin
      .from("crm_customer_logins")
      .select("created_at")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!loginError && typeof latest?.created_at === "string") {
      lastSignInAt = latest.created_at;
    }
    return {
      status: mustSetPassword(data.user) ? "invited" : "ready",
      lastSignInAt,
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
  const email = (customer.email || "").trim().toLowerCase();
  if (!email) throw new Error("Cette fiche n'a pas d'e-mail.");
  const metadata = {
    first_name: customer.first_name,
    last_name: customer.last_name,
    full_name: customerFullName(customer),
  };

  // Une fiche déjà rattachée à un compte de l’agence n’est jamais invitée : le lien ouvrirait /admin.
  if (customer.auth_user_id && (await isStaffAccount(admin, customer.auth_user_id))) {
    throw new Error(STAFF_ACCOUNT_BLOCK);
  }

  let linkType: "invite" | "recovery" = "invite";
  let generated = await clientLinkToken(admin, { type: "invite", email, data: metadata });

  if (!generated.ok && generated.reason === "error" && isAlreadyRegistered(generated.message)) {
    linkType = "recovery";
    generated = await clientLinkToken(admin, { type: "recovery", email });
  }

  if (!generated.ok) {
    throw new Error(
      generated.reason === "staff" ? STAFF_ACCOUNT_BLOCK : generated.message || "Impossible de générer l’invitation"
    );
  }

  const authUser = generated.user;
  const hashedToken = generated.hashedToken;
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
    email,
    channel: "email",
  });
  // L’invitation (définir le mot de passe) part par e-mail seulement. Le WhatsApp « Enchanté »,
  // avec un lien magique, part de /api/client/password une fois le mot de passe enregistré.
  try {
    await admin
      .from("crm_customers")
      .update({ whatsapp_opt_in_at: new Date().toISOString() })
      .eq("id", linked.id)
      .is("whatsapp_opt_in_at", null);
  } catch (err) {
    console.error("[invite] opt-in WhatsApp:", err instanceof Error ? err.message : "échec");
  }
  let delivered = false;
  try {
    delivered = await sendInviteEmail(linked, link, origin);
  } catch (err) {
    console.error("[invite] e-mail:", err instanceof Error ? err.message : "échec");
  }
  return {
    customer: linked,
    delivered,
    link,
    notice: inviteNotice(delivered),
  };
}
