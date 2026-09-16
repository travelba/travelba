import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

type PdfLine = { label: string; detail?: string; amount?: number };

function safeText(value: unknown) {
  return String(value ?? "")
    .replace(/[\u202f\u2007]/g, " ")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

export async function createBusinessPdf({
  title,
  reference,
  customer,
  metadata = [],
  lines = [],
  total,
  currency = "EUR",
  footer,
}: {
  title: string;
  reference: string;
  customer: string;
  metadata?: string[];
  lines?: PdfLine[];
  total?: number;
  currency?: string;
  footer?: string;
}) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  let page = document.addPage([595.28, 841.89]);
  let y = 790;
  const navy = rgb(0, 0.13, 0.34);

  const draw = (text: string, size = 10, isBold = false, x = 50) => {
    if (y < 70) {
      page = document.addPage([595.28, 841.89]);
      y = 790;
    }
    page.drawText(safeText(text).slice(0, 105), { x, y, size, font: isBold ? bold : regular, color: navy });
    y -= size + 7;
  };

  draw("TRAVELBA", 13, true);
  draw(title, 22, true);
  draw(reference, 11, true);
  y -= 8;
  draw(`Client : ${customer}`, 11);
  metadata.forEach((entry) => draw(entry, 9));
  y -= 10;
  page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 1, color: rgb(0.82, 0.87, 0.93) });
  y -= 20;

  for (const line of lines) {
    draw(line.label, 10, true);
    if (line.detail) draw(line.detail, 8, false, 65);
    if (line.amount != null) {
      draw(line.amount.toLocaleString("fr-FR", { style: "currency", currency }), 10, true, 410);
    }
    y -= 5;
  }
  if (total != null) {
    y -= 8;
    page.drawLine({ start: { x: 350, y }, end: { x: 545, y }, thickness: 1, color: navy });
    y -= 22;
    draw(`TOTAL : ${total.toLocaleString("fr-FR", { style: "currency", currency })}`, 14, true, 350);
  }
  if (footer) {
    y -= 20;
    draw(footer, 8);
  }
  page.drawText("Document généré par Travelba", { x: 50, y: 35, size: 8, font: regular, color: rgb(0.4, 0.45, 0.52) });
  return Buffer.from(await document.save());
}

export function pdfResponse(bytes: Buffer, fileName: string) {
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName.replace(/[^\w.-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
