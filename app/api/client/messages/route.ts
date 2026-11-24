import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import {
  AppMessagesUnavailable,
  agencyMessageNotice,
  customerUnreadCount,
  messageFilePath,
  postCustomerMessage,
  sniffPhoto,
} from "@/lib/crm/app-messages";
import { appMessageDb } from "@/lib/crm/app-messages-db";
import { agencyEmailHtml } from "@/lib/crm/email-html";
import { uploadCrmFile } from "@/lib/crm/files";
import { applyClientBookingScope } from "@/lib/crm/company-role";
import { clientBookingScope } from "@/lib/crm/company-peers";
import { RATE_LIMITED_MESSAGE, rateLimit, rateLimitKey } from "@/lib/crm/rate-limit";
import { productionOnlySecret } from "@/lib/crm/preview-secrets";
import { customerFullName, type CrmCustomer } from "@/lib/crm/types";
import { createServiceClient } from "@/lib/supabase/admin";
import { siteConfig } from "@/lib/site";

export const runtime = "nodejs";

function unavailable() {
  return jsonError("La messagerie n’est pas encore ouverte.", 503);
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function stayId(customer: CrmCustomer, reference: string) {
  if (!/^TB-\d{4}-\d{4}$/i.test(reference)) return null;
  try {
    const admin = createServiceClient();
    const { data } = await applyClientBookingScope(
      admin
        .from("crm_bookings")
        .select("id")
        .eq("reference", reference.toUpperCase())
        .eq("visible_to_client", true)
        .limit(1),
      await clientBookingScope(customer)
    );
    const id = data?.[0]?.id;
    return typeof id === "string" ? id : null;
  } catch {
    return null;
  }
}

async function notifyAgency(input: { name: string; preview: string; threadId: string }) {
  const apiKey = productionOnlySecret(process.env.RESEND_API_KEY);
  const to = (process.env.CONTACT_TO_EMAIL || siteConfig.contactEmail).trim();
  if (!apiKey || !to) return;
  const notice = agencyMessageNotice(input);
  const href = `${siteConfig.url}/admin/boite?onglet=messages&fil=${input.threadId}`;
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: `${siteConfig.name} <${process.env.CONTACT_FROM_EMAIL || "onboarding@resend.dev"}>`,
      to: [to],
      subject: notice.subject,
      html: agencyEmailHtml({
        title: "Message dans l’application",
        preheader: notice.text,
        bodyHtml: `<p style="margin:0;line-height:1.5">${escapeHtml(notice.text)}</p>`,
        ctaLabel: "Ouvrir le fil",
        ctaHref: href,
      }),
    });
  } catch {
    console.error("[messages] avis agence non envoyé");
  }
}

/** Compteur du bandeau. N’accuse pas réception. */
export async function GET(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const countOnly = new URL(request.url).searchParams.get("compte") === "1";
  if (!countOnly) return jsonError("Compteur seulement.", 400);
  try {
    const unread = await customerUnreadCount(appMessageDb(), auth.customer.id);
    return NextResponse.json({ unread, available: true });
  } catch (error) {
    if (error instanceof AppMessagesUnavailable) return NextResponse.json({ unread: 0, available: false });
    console.error("[messages]", error instanceof Error ? error.message.slice(0, 80) : "lecture");
    return jsonError("Les messages n’ont pas pu être lus.");
  }
}

export async function POST(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const allowed = await rateLimit({ key: rateLimitKey("app-message", auth.customer.id), limit: 30, windowSeconds: 900 });
  if (!allowed) return jsonError(RATE_LIMITED_MESSAGE, 429);

  let body = "";
  let sejour = "";
  let photo: { bytes: Uint8Array; mime: "image/jpeg" | "image/png" | "image/webp"; name: string } | null = null;
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    const json = (await request.json().catch(() => null)) as { body?: unknown; sejour?: unknown } | null;
    body = typeof json?.body === "string" ? json.body : "";
    sejour = typeof json?.sejour === "string" ? json.sejour : "";
  } else {
    const form = await request.formData().catch(() => null);
    if (!form) return jsonError("Message illisible.");
    body = typeof form.get("body") === "string" ? String(form.get("body")) : "";
    sejour = typeof form.get("sejour") === "string" ? String(form.get("sejour")) : "";
    const file = form.get("photo");
    if (file instanceof File && file.size > 0) {
      if (file.size > 8 * 1024 * 1024) return jsonError("La photo est trop lourde.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mime = sniffPhoto(bytes, file.type || "");
      if (!mime) return jsonError("Choisissez une photo JPEG, PNG ou WebP.");
      photo = { bytes, mime, name: "photo" };
    }
  }

  const messageId = randomUUID();
  let attachmentPath: string | null = null;
  if (photo) {
    attachmentPath = messageFilePath(auth.customer.id, messageId, photo.mime);
    if (!attachmentPath) return jsonError("La photo n’a pas pu être jointe.");
    try {
      await uploadCrmFile(attachmentPath, Buffer.from(photo.bytes), photo.mime);
    } catch {
      return jsonError("La photo n’a pas pu être jointe.");
    }
  }

  try {
    const bookingId = await stayId(auth.customer, sejour);
    const sent = await postCustomerMessage(appMessageDb(), {
      customerId: auth.customer.id,
      body,
      bookingId,
      messageId,
      attachmentPath,
      attachmentMime: photo?.mime || null,
      attachmentName: photo ? "photo" : null,
    });
    if (!sent.ok) return jsonError(sent.error);
    await notifyAgency({ name: customerFullName(auth.customer), preview: sent.preview, threadId: sent.thread.id });
    return NextResponse.json({ ok: true, id: sent.message.id });
  } catch (error) {
    if (error instanceof AppMessagesUnavailable) return unavailable();
    console.error("[messages]", error instanceof Error ? error.message.slice(0, 80) : "envoi");
    return jsonError("Le message n’a pas été envoyé.");
  }
}
