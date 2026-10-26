import { NextResponse } from "next/server";
import { jsonError, jsonIssues, requireStaff } from "@/lib/crm/auth";
import { BookingIssuesError } from "@/lib/crm/booking-issues";
import { createServiceClient } from "@/lib/supabase/admin";
import { applyEditedExtractTitle } from "@/lib/crm/ingest-title";
import { isCancellationExtract, parseExtractPayloadSafe } from "@/lib/crm/ingest-types";
import {
  parseExtractPayload,
  persistNewBookingFromExtract,
} from "@/lib/crm/ingest-booking";
import {
  applyIngestCards,
  attachFilesSummary,
  depositEmailAttachments,
  markEmailAttached,
} from "@/lib/crm/email-attach-run";
import { dismissEmailWarnings } from "@/lib/crm/email-duplicates";
import { detachAttachedEmail } from "@/lib/crm/email-detach-run";
import { closeIngestSiblings, loadEmailIngestFiles, noteIngestDecision, rematchEmailIngestRow } from "@/lib/crm/email-ingest";
import { sanitizeEmailHtml } from "@/lib/crm/email-source";
import type { CrmEmailIngest } from "@/lib/crm/types";

export const runtime = "nodejs";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

/** Corps du mail, à l’ouverture d’une carte. La liste ne le charge pas. */
export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const { data, error } = await auth.supabase
    .from("crm_email_ingest")
    .select("body_html, body_text")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return jsonError("Message introuvable", 404);
  return NextResponse.json({
    body_html: sanitizeEmailHtml(data.body_html),
    body_text: data.body_text || "",
  });
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  let body: {
    action?: string;
    customer_id?: string;
    booking_id?: string;
    title?: string;
    extract?: unknown;
    apply_stay_currency?: boolean;
    item_id?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("Requête invalide");
  }
  const action = String(body.action || "");

  const admin = createServiceClient();
  const { data: rowData } = await admin
    .from("crm_email_ingest")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  const row = rowData as CrmEmailIngest | null;
  if (!row) return jsonError("E-mail introuvable", 404);

  try {
    if (action === "refuse") {
      await admin
        .from("crm_email_ingest")
        .update({ status: "refused" })
        .eq("id", id);
      await closeIngestSiblings(admin, row, "refused", auth.user.id);
      await noteIngestDecision(admin, {
        actorKind: "human",
        actorId: auth.user.id,
        action: "refuse",
        emailIngestId: id,
        summary: "Mail refusé",
      });
      return NextResponse.json({ ok: true, status: "refused" });
    }

    if (action === "ignore") {
      await admin
        .from("crm_email_ingest")
        .update({ status: "ignored", ignore_reason: "Ignoré" })
        .eq("id", id);
      await noteIngestDecision(admin, {
        actorKind: "human",
        actorId: auth.user.id,
        action: "ignore",
        emailIngestId: id,
        summary: "Mail ignoré",
      });
      return NextResponse.json({ ok: true, status: "ignored" });
    }

    if (action === "dismiss_duplicate") {
      await admin
        .from("crm_email_ingest")
        .update({ status: "refused", ignore_reason: "Doublon écarté" })
        .eq("id", id);
      await closeIngestSiblings(admin, row, "refused", auth.user.id);
      await noteIngestDecision(admin, {
        actorKind: "human",
        actorId: auth.user.id,
        action: "duplicate",
        emailIngestId: id,
        summary: "Doublon écarté",
      });
      return NextResponse.json({ ok: true, status: "refused" });
    }

    if (action === "restore") {
      await admin
        .from("crm_email_ingest")
        .update({ status: "parsed", ignore_reason: null })
        .eq("id", id);
      await noteIngestDecision(admin, {
        actorKind: "human",
        actorId: auth.user.id,
        action: "restore",
        emailIngestId: id,
        summary: "Mail remis dans la file",
      });
      return NextResponse.json({ ok: true, status: "parsed" });
    }

    if (action === "dismiss") {
      await admin
        .from("crm_email_ingest")
        .update({ warnings: dismissEmailWarnings(row.warnings) })
        .eq("id", id);
      return NextResponse.json({ ok: true });
    }

    if (action === "detach") {
      const result = await detachAttachedEmail(row);
      await admin
        .from("crm_import_proposals")
        .update({ undone_at: new Date().toISOString() })
        .eq("email_ingest_id", id)
        .is("undone_at", null);
      await noteIngestDecision(admin, {
        actorKind: "human",
        actorId: auth.user.id,
        action: "undo",
        emailIngestId: id,
        summary: "Application annulée",
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "rematch") {
      if (!row.extract) return jsonError("Extract introuvable");
      await rematchEmailIngestRow(row);
      const { data: next } = await admin
        .from("crm_email_ingest")
        .select("status, suggested_customer_id, suggested_booking_id, created_booking_id")
        .eq("id", id)
        .maybeSingle();
      return NextResponse.json({ ok: true, row: next });
    }

    const editedTitle = typeof body.title === "string" ? body.title.trim() : null;
    const baseExtract = body.extract ?? row.extract;
    const storedExtract =
      editedTitle != null
        ? applyEditedExtractTitle(
            baseExtract && typeof baseExtract === "object" && !Array.isArray(baseExtract)
              ? (baseExtract as Record<string, unknown>)
              : {},
            editedTitle
          )
        : baseExtract;
    if (editedTitle && !body.extract) {
      await admin.from("crm_email_ingest").update({ extract: storedExtract }).eq("id", id);
    }
    if (action === "save_title") {
      if (!editedTitle) return jsonError("Indiquez le titre du dossier");
      return NextResponse.json({ ok: true });
    }

    const extract = body.extract
      ? parseExtractPayload(storedExtract)
      : parseExtractPayloadSafe(storedExtract);
    const extractPatch = body.extract ? { extract } : {};

    if (action === "attach_booking") {
      const bookingId = String(body.booking_id || "");
      if (!bookingId) return jsonError("Choisissez un voyage");
      const { data: booking } = await admin
        .from("crm_bookings")
        .select("id, customer_id")
        .eq("id", bookingId)
        .maybeSingle();
      if (!booking) return jsonError("Voyage introuvable", 404);
      const deposited = await depositEmailAttachments(admin, bookingId, id, row.attachments);
      const message = attachFilesSummary(deposited);
      await markEmailAttached(admin, row, {
        bookingId,
        customerId: booking.customer_id,
        actorId: auth.user.id,
        summary: message,
        cards: false,
      });
      return NextResponse.json({
        ok: true,
        booking_id: bookingId,
        pieces: deposited.added,
        message,
      });
    }

    if (action === "apply_cards" || action === "replace_booking") {
      const bookingId = String(body.booking_id || "");
      if (!bookingId) return jsonError("Choisissez un voyage");
      const { data: booking } = await admin
        .from("crm_bookings")
        .select("id, customer_id")
        .eq("id", bookingId)
        .maybeSingle();
      if (!booking) return jsonError("Voyage introuvable", 404);
      await applyIngestCards({
        bookingId,
        customerId: booking.customer_id,
        extract,
        staffUserId: auth.user.id,
        emailIngestId: id,
        itemId: body.item_id || null,
        applyStayFields: body.apply_stay_currency === true,
      });
      const deposited = await depositEmailAttachments(admin, bookingId, id, row.attachments);
      if (extractPatch.extract) {
        await admin.from("crm_email_ingest").update(extractPatch).eq("id", id);
      }
      await markEmailAttached(admin, row, {
        bookingId,
        customerId: booking.customer_id,
        actorId: auth.user.id,
        summary: "Cartes mises à jour depuis le mail",
        cards: true,
      });
      return NextResponse.json({
        ok: true,
        booking_id: bookingId,
        pieces: deposited.added,
        message: "Les cartes du séjour sont mises à jour. Les pièces utiles sont déposées.",
      });
    }

    if (action === "new_booking") {
      if (isCancellationExtract(extract)) {
        return jsonError("Une annulation ne crée pas de dossier. Rattachez-la au voyage existant.");
      }
      const customerId = String(body.customer_id || "");
      if (!customerId) return jsonError("Choisissez un client");
      const files = await loadEmailIngestFiles(row);
      const booking = await persistNewBookingFromExtract({
        customerId,
        extract,
        files,
        staffUserId: auth.user.id,
        status: "draft",
        visibleToClient: false,
        emailIngestId: id,
      });
      await admin
        .from("crm_email_ingest")
        .update({ status: "attached", created_booking_id: booking.id, ...extractPatch })
        .eq("id", id);
      await closeIngestSiblings(admin, row, "attached", auth.user.id);
      await noteIngestDecision(admin, {
        actorKind: "human",
        actorId: auth.user.id,
        action: "new_booking",
        emailIngestId: id,
        bookingId: booking.id,
        customerId,
        summary: "Dossier créé depuis le mail",
      });
      return NextResponse.json({ ok: true, booking_id: booking.id });
    }

    return jsonError("Action inconnue");
  } catch (err) {
    if (err instanceof BookingIssuesError) return jsonIssues(err.issues);
    const message = err instanceof Error ? err.message : "Opération impossible";
    return jsonError(message, 400);
  }
}
