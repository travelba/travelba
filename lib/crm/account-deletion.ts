import "server-only";

import { agencyEmailHtml } from "@/lib/crm/email-html";
import { productionOnlySecret } from "@/lib/crm/preview-secrets";
import { recordCustomerActivity } from "@/lib/crm/customer-activity";
import { siteConfig } from "@/lib/site";

// Le client service role. La chaîne de filtres reste celle de supabase-js.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DeletionDb = { from: (table: string) => any };

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Demande de suppression. Aucun dossier n’est effacé. L’agence traite sous 30 jours. */
export async function requestAccountDeletion(input: {
  admin: DeletionDb;
  customerId: string;
  authUserId: string;
  name: string;
  email: string;
}) {
  const existing = await input.admin
    .from("crm_customer_activity")
    .select("id")
    .eq("customer_id", input.customerId)
    .eq("action", "account_deletion")
    .limit(1);
  if (existing.error) return { ok: false as const, error: "La demande n’a pas pu être enregistrée." };
  const already = Boolean(existing.data?.length);

  if (!already) {
    await recordCustomerActivity({
      customerId: input.customerId,
      authUserId: input.authUserId,
      action: "account_deletion",
      summary: "A demandé la suppression de son compte",
      detail: "Traitement sous 30 jours. Aucun séjour n’est effacé par cette demande.",
    });
    await sendDeletionMail({ name: input.name, email: input.email, customerId: input.customerId });
  }
  return { ok: true as const, already };
}

async function sendDeletionMail(input: { name: string; email: string; customerId: string }) {
  const apiKey = productionOnlySecret(process.env.RESEND_API_KEY);
  const to = (process.env.CONTACT_TO_EMAIL || siteConfig.contactEmail).trim();
  if (!apiKey || !to) return;
  const from = process.env.CONTACT_FROM_EMAIL || "onboarding@resend.dev";
  const who = input.name.trim() || "Un client";
  const body = `${who} demande la suppression de son compte. À traiter sous 30 jours. Aucun séjour n’a été effacé.`;
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: `${siteConfig.name} <${from}>`,
      to: [to],
      subject: "Demande de suppression de compte",
      html: agencyEmailHtml({
        title: "Suppression de compte",
        preheader: "Demande à traiter sous 30 jours.",
        bodyHtml: `<p style="margin:0 0 8px;line-height:1.5">${escapeHtml(body)}</p><p style="margin:0;line-height:1.5">E-mail : ${escapeHtml(input.email || "non renseigné")}<br>Fiche : ${escapeHtml(input.customerId)}</p>`,
      }),
    });
  } catch {
    console.error("[compte] demande de suppression non envoyée");
  }
}
