import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { siteConfig } from "@/lib/site";
import { greetingGivenName } from "@/lib/crm/identity";
import { createEntryLink, entryButtonSuffix, entryCodeFromLink } from "@/lib/crm/entry-link";
import {
  conciergeContentVariables,
  conciergeExemplars,
  liveStayCover,
  stayCoverUrl,
  stayHasPublishedCover,
  stayPlaceName,
  type ConciergeTemplate,
} from "@/lib/crm/concierge-notices";
import { sendContentTemplate } from "@/lib/crm/whatsapp";

export const runtime = "nodejs";
export const maxDuration = 300;

const PHONE = "+33772158257";
const EMAIL = "benjamin@travelba.fr";
const REFERENCE = "TB-2026-0028";
const CONTENT_URL = "https://content.twilio.com/v1/Content";

function authorized(header: string | null) {
  const expected = process.env.WHATSAPP_PROBE_TOKEN?.trim() || "";
  const got = (header || "").replace(/^Bearer\s+/i, "").trim();
  if (!expected || got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(got));
}

function authHeader() {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim() || "";
  const token = process.env.TWILIO_AUTH_TOKEN?.trim() || "";
  return `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`;
}

function safeMessage(payload: { message?: string } | null, status: number) {
  return (payload?.message || `HTTP ${status}`)
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\+?\d{8,}/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

async function twilio(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: authHeader(),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const payload = (await response.json().catch(() => null)) as {
    sid?: string;
    message?: string;
    whatsapp?: { status?: string };
    contents?: { sid?: string; friendly_name?: string }[];
    meta?: { next_page_url?: string | null };
  } | null;
  return { response, payload };
}

async function findExisting(name: string) {
  let page: string | null = `${CONTENT_URL}?PageSize=50`;
  while (page) {
    const { response, payload } = await twilio(page);
    if (!response.ok) throw new Error(safeMessage(payload, response.status));
    const found = payload?.contents?.find((row) => row.friendly_name === name && row.sid);
    if (found?.sid) return found.sid;
    page = payload?.meta?.next_page_url || null;
  }
  return "";
}

async function ensureContent(draft: ReturnType<typeof conciergeExemplars>[number]) {
  const existing = await findExisting(draft.friendlyName);
  if (existing) return existing;
  const { response, payload } = await twilio(CONTENT_URL, {
    method: "POST",
    body: JSON.stringify(draft.create),
  });
  if (!response.ok || !payload?.sid) throw new Error(safeMessage(payload, response.status));
  return payload.sid;
}

async function submit(sid: string, name: string) {
  const { response, payload } = await twilio(`${CONTENT_URL}/${sid}/ApprovalRequests/whatsapp`, {
    method: "POST",
    body: JSON.stringify({ name, category: "UTILITY" }),
  });
  if (response.ok) return;
  const message = safeMessage(payload, response.status);
  if (/already|submitted|approved/i.test(message)) return;
  throw new Error(message);
}

async function approval(sid: string) {
  const { response, payload } = await twilio(`${CONTENT_URL}/${sid}/ApprovalRequests`);
  if (!response.ok) return "inconnu";
  const status = payload?.whatsapp?.status || "";
  if (status === "approved") return "approuvé";
  if (status === "rejected") return "refusé";
  if (status === "pending" || status === "received") return "en revue";
  return status || "en revue";
}

function phraseOf(
  draft: ReturnType<typeof conciergeExemplars>[number],
  variables: Record<string, string>
) {
  const types = draft.create.types as {
    "whatsapp/card"?: { body?: string; media?: string[]; actions?: { title?: string }[] };
    "twilio/call-to-action"?: { body?: string; actions?: { title?: string }[] };
  };
  const card = types["whatsapp/card"] || types["twilio/call-to-action"];
  let body = card?.body || "";
  for (const [key, value] of Object.entries(variables)) {
    if (/^https?:|^c\//i.test(value)) continue;
    body = body.replaceAll(`{{${key}}}`, value);
  }
  return {
    phrase: body.replace(/\s+\n/g, "\n").trim(),
    button: card?.actions?.[0]?.title || "",
    image: types["whatsapp/card"]?.media?.length ? "couverture du séjour" : "aucune",
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: Request) {
  if (!authorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (!process.env.TWILIO_ACCOUNT_SID?.trim() || !process.env.TWILIO_AUTH_TOKEN?.trim()) {
    return NextResponse.json({ error: "Twilio absent" }, { status: 422 });
  }

  const admin = createServiceClient();
  const { data: booking } = await admin
    .from("crm_bookings")
    .select("id, reference, destination, title, cover_image_path, visible_to_client")
    .eq("reference", REFERENCE)
    .maybeSingle();
  if (!booking?.visible_to_client) {
    return NextResponse.json({ error: "Séjour introuvable" }, { status: 404 });
  }
  const place = stayPlaceName(booking.destination, booking.title);
  if (!place) return NextResponse.json({ error: "Lieu absent" }, { status: 422 });
  const mediaUrl = await liveStayCover(
    stayHasPublishedCover(booking) ? stayCoverUrl(booking.reference, true) : null
  );
  if (!mediaUrl) return NextResponse.json({ error: "Image absente" }, { status: 422 });

  const { data: customer } = await admin
    .from("crm_customers")
    .select("id, first_name")
    .eq("email", EMAIL)
    .maybeSingle();
  const firstName = greetingGivenName(customer?.first_name) || "Voyageur";

  const generated = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
  const tokenHash = generated.data?.properties?.hashed_token;
  if (generated.error || !tokenHash) {
    return NextResponse.json({ error: "Lien absent" }, { status: 422 });
  }
  const link = await createEntryLink(admin, siteConfig.url, {
    tokenHash,
    otpType: "magiclink",
    nextPath: `/mon-compte/reservations/${booking.reference}`,
  });
  const code = entryCodeFromLink(link);
  const suffix = code ? entryButtonSuffix(code) : "";
  if (!suffix) return NextResponse.json({ error: "Lien absent" }, { status: 422 });

  const sent: {
    nom: string;
    env: string;
    sid: string;
    bouton: string;
    phrase: string;
    image: string;
    approval: string;
    envoi: string;
  }[] = [];

  for (const draft of conciergeExemplars()) {
    const dedupe = `catalogue-bouton:${draft.friendlyName}`;
    const { data: prior } = await admin
      .from("crm_whatsapp_messages")
      .select("status")
      .eq("dedupe_key", dedupe)
      .maybeSingle();
    let sid = "";
    try {
      sid = await ensureContent(draft);
      await submit(sid, draft.friendlyName);
    } catch (err) {
      const message = err instanceof Error ? err.message : "échec";
      sent.push({
        nom: draft.friendlyName,
        env: draft.env,
        sid,
        bouton: "",
        phrase: "",
        image: draft.template === "sejour" ? "couverture du séjour" : "aucune",
        approval: "inconnu",
        envoi: message,
      });
      continue;
    }
    const status = await approval(sid);
    const variables = variablesFor(draft.template, {
      suffix,
      place,
      reference: booking.reference,
      mediaUrl,
      firstName,
    });
    const copy = variables
      ? phraseOf(draft, variables)
      : { phrase: "", button: "", image: "aucune" };
    if (prior?.status === "sent") {
      sent.push({
        nom: draft.friendlyName,
        env: draft.env,
        sid,
        bouton: copy.button,
        phrase: copy.phrase,
        image: copy.image,
        approval: status,
        envoi: "déjà",
      });
      continue;
    }
    if (!variables) {
      sent.push({
        nom: draft.friendlyName,
        env: draft.env,
        sid,
        bouton: copy.button,
        phrase: copy.phrase,
        image: copy.image,
        approval: status,
        envoi: "variables absentes",
      });
      continue;
    }
    const result = await sendContentTemplate({ phone: PHONE, contentSid: sid, variables });
    if (result.ok) {
      await admin.from("crm_whatsapp_messages").insert({
        customer_id: customer?.id || null,
        booking_id: booking.id,
        dedupe_key: dedupe,
        direction: "outbound",
        template_key: draft.template,
        body: copy.phrase,
        payload: {},
        status: "sent",
        twilio_sid: result.sid,
      });
    }
    sent.push({
      nom: draft.friendlyName,
      env: draft.env,
      sid,
      bouton: copy.button,
      phrase: copy.phrase,
      image: copy.image,
      approval: status,
      envoi: result.ok ? "envoyé" : result.detail || result.reason,
    });
    await sleep(400);
  }

  return NextResponse.json({
    lieu: place,
    reference: booking.reference,
    telephone: PHONE,
    modeles: sent,
  });
}

function variablesFor(
  template: ConciergeTemplate,
  input: { suffix: string; place: string; reference: string; mediaUrl: string; firstName: string }
) {
  const variable =
    template === "connexion_carte"
      ? input.firstName
      : template === "formalite_prete_carte"
        ? "ESTA"
        : template === "formalite_manquante_carte"
          ? "visa"
          : null;
  return conciergeContentVariables({
    template,
    buttonSuffix: input.suffix,
    place: input.place,
    reference: input.reference,
    mediaUrl: input.mediaUrl,
    variable,
  });
}
