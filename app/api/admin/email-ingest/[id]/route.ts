import { NextResponse } from "next/server";
import { jsonError, jsonIssues, requireStaff } from "@/lib/crm/auth";
import { BookingIssuesError } from "@/lib/crm/booking-issues";
import { createServiceClient } from "@/lib/supabase/admin";
import { applyEditedExtractTitle } from "@/lib/crm/ingest-title";
import { parseExtractPayloadSafe } from "@/lib/crm/ingest-types";
import {
  applyExtractToBooking,
  persistNewBookingFromExtract,
} from "@/lib/crm/ingest-booking";
import { loadEmailIngestFiles, rematchEmailIngestRow } from "@/lib/crm/email-ingest";
import type { CrmEmailIngest } from "@/lib/crm/types";

export const runtime = "nodejs";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  let body: { action?: string; customer_id?: string; booking_id?: string; title?: string };
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
    const storedExtract =
      editedTitle != null
        ? applyEditedExtractTitle(
            row.extract && typeof row.extract === "object" && !Array.isArray(row.extract)
              ? (row.extract as Record<string, unknown>)
              : {},
            editedTitle
          )
        : row.extract;
    if (editedTitle) {
      await admin.from("crm_email_ingest").update({ extract: storedExtract }).eq("id", id);
    }
    if (action === "save_title") {
      if (!editedTitle) return jsonError("Indiquez le titre du dossier");
      return NextResponse.json({ ok: true });
    }

    const extract = parseExtractPayloadSafe(storedExtract);
    const files = await loadEmailIngestFiles(row);

    if (action === "attach_booking") {
      const bookingId = String(body.booking_id || "");
      if (!bookingId) return jsonError("Choisissez un voyage");
      const { data: booking } = await admin
        .from("crm_bookings")
        .select("id, customer_id")
        .eq("id", bookingId)
        .maybeSingle();
      if (!booking) return jsonError("Voyage introuvable", 404);
      await applyExtractToBooking({
        bookingId,
        customerId: booking.customer_id,
        extract,
        files,
        staffUserId: auth.user.id,
        visibleToClient: false,
      });
      await admin
        .from("crm_email_ingest")
        .update({ status: "attached", created_booking_id: bookingId })
        .eq("id", id);
      return NextResponse.json({ ok: true, booking_id: bookingId });
    }

    if (action === "new_booking") {
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
      });
      await admin
        .from("crm_email_ingest")
        .update({ status: "attached", created_booking_id: booking.id })
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
