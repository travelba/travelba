import { NextResponse } from "next/server";
import { jsonError, jsonIssues, requireStaff } from "@/lib/crm/auth";
import { BookingIssuesError } from "@/lib/crm/booking-issues";
import { createServiceClient } from "@/lib/supabase/admin";
import { applyEditedExtractTitle } from "@/lib/crm/ingest-title";
import { isCancellationExtract, parseExtractPayloadSafe } from "@/lib/crm/ingest-types";
import {
  applyCancellationToBooking,
  applyExtractToBooking,
  parseExtractPayload,
  persistNewBookingFromExtract,
} from "@/lib/crm/ingest-booking";
import { dismissEmailWarnings } from "@/lib/crm/email-duplicates";
import { detachAttachedEmail } from "@/lib/crm/email-detach-run";
import { loadEmailIngestFiles, rematchEmailIngestRow } from "@/lib/crm/email-ingest";
import type { CrmEmailIngest } from "@/lib/crm/types";

export const runtime = "nodejs";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

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
      return NextResponse.json({ ok: true, status: "refused" });
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
    const files = await loadEmailIngestFiles(row);
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
      if (isCancellationExtract(extract)) {
        await applyCancellationToBooking({
          bookingId,
          customerId: booking.customer_id,
          extract,
          files,
          staffUserId: auth.user.id,
          visibleToClient: false,
        });
      } else {
        await applyExtractToBooking({
          bookingId,
          customerId: booking.customer_id,
          extract,
          files,
          staffUserId: auth.user.id,
          visibleToClient: false,
          applyStayFields: body.apply_stay_currency === true,
          emailIngestId: id,
        });
      }
      await admin
        .from("crm_email_ingest")
        .update({ status: "attached", created_booking_id: bookingId, ...extractPatch })
        .eq("id", id);
      return NextResponse.json({ ok: true, booking_id: bookingId });
    }

    if (action === "new_booking") {
      if (isCancellationExtract(extract)) {
        return jsonError("Une annulation ne crée pas de dossier. Rattachez-la au voyage existant.");
      }
      const customerId = String(body.customer_id || "");
      if (!customerId) return jsonError("Choisissez un client");
      const booking = await persistNewBookingFromExtract({
        customerId,
        extract,
        files,
        staffUserId: auth.user.id,
        referenceClient: auth.supabase,
        status: "draft",
        visibleToClient: false,
        emailIngestId: id,
      });
      await admin
        .from("crm_email_ingest")
        .update({ status: "attached", created_booking_id: booking.id, ...extractPatch })
        .eq("id", id);
      return NextResponse.json({ ok: true, booking_id: booking.id });
    }

    return jsonError("Action inconnue");
  } catch (err) {
    if (err instanceof BookingIssuesError) return jsonIssues(err.issues);
    const message = err instanceof Error ? err.message : "Opération impossible";
    return jsonError(message, 400);
  }
}
