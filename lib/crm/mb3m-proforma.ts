import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { mb3mFactureHref } from "@/lib/crm/mb3m-account";
import { mb3mRealm } from "@/lib/crm/mb3m";
import { formatDateFr, formatMoney } from "@/lib/crm/money";
import { pdfSafe } from "@/lib/crm/statement-pdf";
import { siteConfig } from "@/lib/site";
import { createServiceClient } from "@/lib/supabase/admin";

export type Mb3mProformaLine = { label: string; amount: number };

export type Mb3mProformaModel = {
  number: string;
  reference: string;
  title: string;
  dates: string;
  billTo: string[];
  lines: Mb3mProformaLine[];
  total: number;
};

export function mb3mProformaCopy(model: Mb3mProformaModel) {
  return {
    kicker: "Facture pro forma",
    number: `N° ${model.number.trim()}`,
    notice: "Non imprimée. Elle se valide dans MB3M.",
    stay: [model.title, model.reference, model.dates].map((line) => line.trim()).filter(Boolean),
    billTo: model.billTo.map((line) => line.trim()).filter(Boolean),
    lines: model.lines.map((line) => ({
      label: (line.label.trim() || "Prestation").slice(0, 72),
      amount: formatMoney(line.amount, "EUR"),
    })),
    total: formatMoney(model.total, "EUR"),
  };
}

export async function renderMb3mProformaPdf(model: Mb3mProformaModel) {
  const copy = mb3mProformaCopy(model);
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0x0b / 255, 0x19 / 255, 0x2c / 255);
  const gold = rgb(0xc5 / 255, 0xa8 / 255, 0x80 / 255);
  const muted = rgb(0x5c / 255, 0x65 / 255, 0x70 / 255);
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 40;
  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const text = (value: string, size: number, font: typeof regular, color = navy, x = margin) => {
    const safe = pdfSafe(font, value);
    if (!safe) return;
    page.drawText(safe, { x, y, size, font, color });
  };
  const nextPage = () => {
    page = doc.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
  };
  const ensure = (height: number) => {
    if (y - height < 72) nextPage();
  };

  text(siteConfig.legal.legalName, 11, bold);
  y -= 18;
  text(copy.kicker, 22, bold);
  y -= 16;
  text(copy.number, 12, regular);
  y -= 16;
  text(copy.notice, 10, regular, muted);
  y -= 22;
  page.drawRectangle({ x: margin, y, width: pageWidth - margin * 2, height: 1, color: gold });
  y -= 22;

  text("Séjour", 9, bold, gold);
  y -= 14;
  for (const line of copy.stay) {
    ensure(16);
    text(line, 11, regular);
    y -= 15;
  }
  y -= 8;
  text("Facturé à", 9, bold, gold);
  y -= 14;
  for (const line of copy.billTo) {
    ensure(16);
    text(line, 11, regular);
    y -= 15;
  }
  y -= 12;
  ensure(28);
  text("Prestation", 9, bold, muted);
  text("Montant", 9, bold, muted, pageWidth - margin - 70);
  y -= 8;
  page.drawRectangle({ x: margin, y, width: pageWidth - margin * 2, height: 0.4, color: muted });
  y -= 16;

  for (const line of copy.lines) {
    ensure(18);
    text(line.label, 11, regular);
    const amount = pdfSafe(regular, line.amount);
    const width = regular.widthOfTextAtSize(amount, 11);
    page.drawText(amount, { x: pageWidth - margin - width, y, size: 11, font: regular, color: navy });
    y -= 16;
  }

  y -= 6;
  ensure(24);
  page.drawRectangle({ x: margin, y: y + 12, width: pageWidth - margin * 2, height: 0.4, color: navy });
  text("Total", 12, bold);
  const total = pdfSafe(bold, copy.total);
  const totalWidth = bold.widthOfTextAtSize(total, 12);
  page.drawText(total, { x: pageWidth - margin - totalWidth, y, size: 12, font: bold, color: navy });
  y -= 28;
  ensure(32);
  text("Aperçu de la pièce préparée dans MB3M.", 9, regular, muted);
  y -= 12;
  ensure(14);
  text("L'impression dans MB3M en fait la facture définitive.", 9, regular, muted);

  return doc.save();
}

type PieceRow = {
  booking_id: string;
  piece_number: string | null;
  document_id: string | null;
  transaction_ids: string[] | null;
  printed_at: string | null;
  amount: number | string | null;
};

export async function loadMb3mProforma(bookingId: string) {
  const admin = createServiceClient();
  const { data: open, error } = await admin
    .from("crm_mb3m_pieces")
    .select("booking_id, piece_number, document_id, transaction_ids, printed_at, amount")
    .eq("booking_id", bookingId)
    .eq("realm", mb3mRealm())
    .eq("kind", "invoice")
    .is("printed_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const piece = open as PieceRow | null;
  if (piece?.piece_number) {
    const pdf = await renderMb3mProformaPdf(await proformaModel(admin, piece));
    return { kind: "preview" as const, pdf, number: piece.piece_number };
  }
  const { data: printed, error: printedError } = await admin
    .from("crm_mb3m_pieces")
    .select("booking_id, piece_number, document_id, transaction_ids, printed_at, amount")
    .eq("booking_id", bookingId)
    .eq("realm", mb3mRealm())
    .eq("kind", "invoice")
    .not("printed_at", "is", null)
    .order("printed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (printedError) throw new Error(printedError.message);
  const issued = printed as PieceRow | null;
  const number = (issued?.piece_number || "").trim();
  if (!issued || !number || !issued.document_id) return null;
  const { data: document, error: documentError } = await admin
    .from("crm_booking_documents")
    .select("storage_path")
    .eq("id", issued.document_id)
    .maybeSingle();
  if (documentError) throw new Error(documentError.message);
  const path = (document as { storage_path?: string | null } | null)?.storage_path;
  if (!path) return null;
  return { kind: "official" as const, href: mb3mFactureHref(path, number), number };
}

async function proformaModel(
  admin: ReturnType<typeof createServiceClient>,
  piece: PieceRow
): Promise<Mb3mProformaModel> {
  const ids = (piece.transaction_ids || []).filter(Boolean);
  const { data: booking, error: bookingError } = await admin
    .from("crm_bookings")
    .select("reference, title, start_date, end_date, payer_kind, billing_company_id, billing_customer_id, customer_id")
    .eq("id", piece.booking_id)
    .maybeSingle();
  if (bookingError) throw new Error(bookingError.message);
  const stay = booking as {
    reference: string;
    title: string | null;
    start_date: string | null;
    end_date: string | null;
    payer_kind: string | null;
    billing_company_id: string | null;
    billing_customer_id: string | null;
    customer_id: string | null;
  } | null;
  const payerId = stay?.billing_customer_id || stay?.customer_id;
  const [{ data: charges }, { data: payer }, { data: company }] = await Promise.all([
    ids.length
      ? admin.from("crm_transactions").select("id, label, amount").in("id", ids)
      : Promise.resolve({ data: [] as { id: string; label: string | null; amount: number | null }[] }),
    payerId
      ? admin
          .from("crm_customers")
          .select(
            "first_name, last_name, billing_address_line, billing_postal_code, billing_city, billing_country, address_line, postal_code, city, country"
          )
          .eq("id", payerId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    stay?.payer_kind === "company" && stay.billing_company_id
      ? admin
          .from("crm_billing_companies")
          .select("company_name, billing_address_line, billing_postal_code, billing_city, billing_country")
          .eq("id", stay.billing_company_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const byId = new Map(
    ((charges || []) as { id: string; label: string | null; amount: number | null }[]).map((row) => [row.id, row])
  );
  const lines = ids.flatMap((id) => {
    const row = byId.get(id);
    if (!row) return [];
    return [{ label: (row.label || "").trim() || "Prestation", amount: Number(row.amount) || 0 }];
  });
  const total = lines.reduce((sum, line) => sum + line.amount, 0) || Number(piece.amount) || 0;
  const person = payer as {
    first_name: string | null;
    last_name: string | null;
    billing_address_line: string | null;
    billing_postal_code: string | null;
    billing_city: string | null;
    billing_country: string | null;
    address_line: string | null;
    postal_code: string | null;
    city: string | null;
    country: string | null;
  } | null;
  const firm = company as {
    company_name: string | null;
    billing_address_line: string | null;
    billing_postal_code: string | null;
    billing_city: string | null;
    billing_country: string | null;
  } | null;
  const personName = [person?.first_name, person?.last_name].filter(Boolean).join(" ").trim();
  const billTo = firm
    ? addressLines(firm.company_name, firm.billing_address_line, firm.billing_postal_code, firm.billing_city, firm.billing_country)
    : addressLines(
        personName,
        person?.billing_address_line || person?.address_line,
        person?.billing_postal_code || person?.postal_code,
        person?.billing_city || person?.city,
        person?.billing_country || person?.country
      );
  const dates = [stay?.start_date ? formatDateFr(stay.start_date) : "", stay?.end_date ? formatDateFr(stay.end_date) : ""]
    .filter(Boolean)
    .join(" — ");
  return {
    number: String(piece.piece_number),
    reference: stay?.reference || "",
    title: (stay?.title || "").trim() || stay?.reference || "Séjour",
    dates,
    billTo,
    lines,
    total: Math.round(total * 100) / 100,
  };
}

function addressLines(
  name: string | null | undefined,
  line: string | null | undefined,
  postal: string | null | undefined,
  city: string | null | undefined,
  country: string | null | undefined
) {
  const place = [postal, city].map((part) => (part || "").trim()).filter(Boolean).join(" ");
  return [name, line, place, country].map((part) => (part || "").trim()).filter(Boolean);
}
