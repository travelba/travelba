import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { clearClientStayCard, issueHotelCheckinCard, restoreHotelRequest, saveHotelRequest, saveUploadedClientCard, sendHotelMessage, sendHotelRequest, skipHotelRequest } from "@/lib/crm/hotel-desk-run";
import { HOTEL_DESK_KINDS } from "@/lib/crm/types";
import type { HotelDeskKind } from "@/lib/crm/types";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const CARD_MIME = /^(image\/jpeg|image\/png|image\/webp|application\/pdf)$/;
const MAX_CARD = 4_000_000;

function kindOf(value: unknown): HotelDeskKind | null {
  return HOTEL_DESK_KINDS.includes(value as HotelDeskKind) ? (value as HotelDeskKind) : null;
}

function textList(value: unknown) {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function documentIds(value: unknown) {
  return textList(value).map((id) => id.trim()).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
}

function contactRows(value: unknown) {
  let raw = value;
  if (typeof value === "string") {
    try {
      raw = JSON.parse(value) as unknown;
    } catch {
      raw = [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((person) => person && typeof person === "object" && typeof (person as { email?: string }).email === "string")
    .map((person) => {
      const row = person as { email?: string; firstName?: string; lastName?: string; role?: string };
      return {
        email: row.email || "",
        firstName: typeof row.firstName === "string" ? row.firstName : "",
        lastName: typeof row.lastName === "string" ? row.lastName : "",
        role: typeof row.role === "string" ? row.role : "",
      };
    });
}

function cardFileName(name: string) {
  const base = (name.split(/[/\\]/).pop() || "carte-client").replace(/\d{6,}/g, "");
  const clean = base.replace(/[^\w.\- ]+/g, "").trim().slice(0, 60);
  return clean || "carte-client";
}

async function readPayload(request: Request) {
  const type = request.headers.get("content-type") || "";
  if (!type.includes("multipart/form-data")) {
    const json = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    return { ...(json || {}), clientCard: null as { filename: string; content: Buffer; mime?: string } | null };
  }
  const form = await request.formData();
  const file = form.get("clientCard");
  let clientCard: { filename: string; content: Buffer; mime?: string } | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_CARD) throw new Error("La carte dépasse 4 Mo. Déposez une photo plus légère.");
    if (!CARD_MIME.test(file.type)) throw new Error("Déposez une photo ou un PDF de la carte.");
    clientCard = { filename: cardFileName(file.name), content: Buffer.from(await file.arrayBuffer()), mime: file.type };
  }
  return {
    action: String(form.get("action") || ""),
    itemId: String(form.get("itemId") || ""),
    kind: String(form.get("kind") || ""),
    subject: String(form.get("subject") || ""),
    body: String(form.get("body") || ""),
    recipients: textList(form.get("recipients")),
    cardChoice: String(form.get("cardChoice") || ""),
    contacts: contactRows(form.get("contacts")),
    identityDocumentIds: documentIds(form.get("identityDocumentIds")),
    clientCard,
  };
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  let body: Awaited<ReturnType<typeof readPayload>>;
  try {
    body = await readPayload(request);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Action impossible", 400);
  }
  const itemId = String(body?.itemId || "").trim();
  const kind = kindOf(body?.kind);
  const action = body?.action;
  if (!itemId || !action) return jsonError("Action incomplète", 400);
  const admin = createServiceClient();
  if (action === "send-message") {
    try {
      await sendHotelMessage(admin, {
        bookingId: id,
        itemId,
        subject: typeof body?.subject === "string" ? body.subject : "",
        body: typeof body?.body === "string" ? body.body : "",
        recipients: Array.isArray(body?.recipients)
          ? body.recipients.filter((value): value is string => typeof value === "string")
          : undefined,
      });
      return NextResponse.json({ ok: true });
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : "Action impossible", 400);
    }
  }
  if (action === "save-client-card") {
    if (!body.clientCard?.content?.length) return jsonError("Déposez la carte du client.", 400);
    try {
      const saved = await saveUploadedClientCard(admin, id, itemId, body.clientCard);
      return NextResponse.json({ ok: true, name: saved.name });
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : "Action impossible", 400);
    }
  }
  if (action === "clear-client-card") {
    await clearClientStayCard(admin, id, itemId);
    return NextResponse.json({ ok: true });
  }
  if (!kind) return jsonError("Action incomplète", 400);
  const rawChoice = body?.cardChoice;
  const cardChoice: "pliant" | "client" | null = rawChoice === "client" || rawChoice === "pliant" ? rawChoice : null;
  const identityDocumentIds = documentIds(body?.identityDocumentIds);
  try {
    if (action === "skip") {
      await skipHotelRequest(admin, id, itemId, kind);
      return NextResponse.json({ ok: true });
    }
    if (action === "restore") {
      await restoreHotelRequest(admin, id, itemId, kind);
      return NextResponse.json({ ok: true });
    }
    if (action === "issue-card") {
      if (kind !== "precheckin") return jsonError("Action incomplète", 400);
      const card = await issueHotelCheckinCard(admin, id, itemId);
      return NextResponse.json({ ok: true, last4: card.last4, holder: card.holder });
    }
    const letter = {
      bookingId: id,
      itemId,
      kind,
      subject: body?.subject || "",
      body: body?.body || "",
      recipients: Array.isArray(body?.recipients) ? body.recipients : [],
      cardChoice,
      identityDocumentIds: body?.identityDocumentIds ? identityDocumentIds : undefined,
      clientCard: body?.clientCard || null,
      contacts: contactRows(body?.contacts),
    };
    if (action === "save") {
      await saveHotelRequest(admin, letter);
      return NextResponse.json({ ok: true });
    }
    if (action === "send") {
      await sendHotelRequest(admin, letter);
      return NextResponse.json({ ok: true });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Action impossible";
    return jsonError(message, 400);
  }
  return jsonError("Action inconnue", 400);
}
