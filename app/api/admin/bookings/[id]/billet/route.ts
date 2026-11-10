import { NextResponse } from "next/server";
import { jsonError, requireStaff } from "@/lib/crm/auth";
import { attachBookingDocument } from "@/lib/crm/booking-document-write";
import { pdfPlainText } from "@/lib/crm/pdf-raster";
import { emlToText, parseTicketMail, ticketRowsFromRead, type TicketMailRead } from "@/lib/crm/ticket-mail";
import { isUuid } from "@/lib/crm/ids";

type Ctx = { params: Promise<{ id: string }> };

function readOf(text: string): TicketMailRead {
  return parseTicketMail(text);
}

async function fileText(file: File, bytes: Buffer) {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  if (type.includes("pdf") || name.endsWith(".pdf")) {
    const parsed = await pdfPlainText(bytes);
    return parsed.text;
  }
  const raw = bytes.toString("utf8");
  if (type.includes("rfc822") || name.endsWith(".eml") || raw.includes("Content-Type:")) return emlToText(raw);
  return raw;
}

/** Dépose un e-mail ou un PDF de billet sur le vol, et en reprend le PNR s’il est lisible. */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonError("Dossier invalide.", 400);
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("Fichier requis");
  const asked = String(form.get("booking_item_id") || "").trim();
  const bytes = Buffer.from(await file.arrayBuffer());
  const text = await fileText(file, bytes);
  const read = readOf(text);
  const { data: booking, error: bookingError } = await auth.supabase
    .from("crm_bookings")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (bookingError || !booking) return jsonError("Dossier introuvable", 404);

  const { data: flights, error: flightsError } = await auth.supabase
    .from("crm_booking_items")
    .select("id, kind, title, confirmation_ref, amount, details, sort_order, lifecycle")
    .eq("booking_id", id)
    .eq("kind", "flight");
  if (flightsError) return jsonError("Les vols n’ont pas pu être lus.", 400);
  const rows = (flights || []) as {
    id: string;
    confirmation_ref: string | null;
    amount: number | null;
    details: Record<string, unknown> | null;
    sort_order: number | null;
    lifecycle: string | null;
  }[];
  const active = rows.filter((row) => row.lifecycle !== "cancelled" && row.lifecycle !== "superseded");
  const pnr = read.pnr?.toUpperCase() || "";
  const byPnr = pnr
    ? active.find((row) => (row.confirmation_ref || "").toUpperCase() === pnr || String(row.details?.pnr || "").toUpperCase() === pnr)
    : undefined;
  const askedRow = asked ? active.find((row) => row.id === asked) : undefined;
  if (asked && !askedRow) return jsonError("Carte introuvable", 404);

  let itemId = askedRow?.id || byPnr?.id || "";
  let created = false;
  if (!itemId && !read.pnr) return jsonError("Le PNR n’a pas été lu. Ouvrez le vol et déposez le billet dessus.", 400);
  const drafts = ticketRowsFromRead(read);
  let order = active.reduce((max, row) => Math.max(max, row.sort_order || 0), 0) + 1;
  for (const [index, draft] of drafts.entries()) {
    const code = String(draft.details.flight_number || "").toUpperCase().replace(/\s+/g, "");
    const hit =
      active.find((row) => code && String(row.details?.flight_number || "").toUpperCase().replace(/\s+/g, "") === code) ||
      (index === 0 ? askedRow || byPnr : undefined);
    const existing = Array.isArray(hit?.details?.passengers) ? hit.details.passengers : [];
    const details = { ...(hit?.details || {}), ...draft.details, ...(existing.length ? { passengers: existing } : {}) };
    if (hit) {
      const { error } = await auth.supabase
        .from("crm_booking_items")
        .update({
          title: draft.title,
          supplier: draft.supplier,
          confirmation_ref: draft.confirmation_ref,
          start_at: draft.start_at,
          end_at: draft.end_at,
          details,
        })
        .eq("id", hit.id)
        .eq("booking_id", id);
      if (error) return jsonError("Le vol n’a pas pu être mis à jour.", 400);
      if (!itemId) itemId = hit.id;
      continue;
    }
    const { data: inserted, error } = await auth.supabase
      .from("crm_booking_items")
      .insert({
        booking_id: id,
        kind: "flight",
        title: draft.title,
        supplier: draft.supplier,
        confirmation_ref: draft.confirmation_ref || read.pnr,
        start_at: draft.start_at,
        end_at: draft.end_at,
        amount: null,
        sort_order: order,
        visible_to_client: false,
        details,
      })
      .select("id")
      .single();
    order += 1;
    if (error || !inserted?.id) return jsonError("Le vol n’a pas pu être créé.", 400);
    created = true;
    if (!itemId) itemId = String(inserted.id);
  }
  const attached = await attachBookingDocument(auth.supabase, {
    bookingId: id,
    itemId,
    kind: "other",
    visibleToClient: true,
    file: { name: file.name, type: file.type || "application/octet-stream", size: file.size, bytes },
  });
  if ("error" in attached) return jsonError(attached.error, attached.status);
  return NextResponse.json({
    document: attached.document,
    item_id: itemId,
    cree: created,
    pnr: read.pnr,
    billet: read.ticketNumber,
    prix: read.price,
  });
}
