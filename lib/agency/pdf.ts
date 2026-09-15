import { siteConfig } from "@/lib/site";
import type { AgencyRoomOccupancy } from "@/lib/agency/types";
import { formatMoney } from "@/lib/agency/types";

export type HotelsQuotePayload = {
  clientName?: string | null;
  destination: string;
  startDate: string;
  endDate: string;
  rooms: AgencyRoomOccupancy[];
  currency: string;
  hotels: Array<{
    name: string;
    location?: string | null;
    fromPrice?: number | null;
    currency?: string | null;
  }>;
};

export type RoomsQuotePayload = {
  clientName?: string | null;
  hotelName: string;
  location?: string | null;
  startDate: string;
  endDate: string;
  rooms: AgencyRoomOccupancy[];
  currency: string;
  roomTypes: Array<{
    name: string;
    description?: string | null;
    rates: Array<{
      title?: string | null;
      total?: number | null;
      currency?: string | null;
      cancellation?: string | null;
      benefits?: string[];
    }>;
  }>;
};

function occupancyLabel(rooms: AgencyRoomOccupancy[]) {
  return rooms
    .map((room, index) => {
      const children = room.children?.length
        ? ` + ${room.children.length} enf.`
        : "";
      return `Ch. ${index + 1}: ${room.adults} ad.${children}`;
    })
    .join(" · ");
}

function escapePdfText(value: string) {
  return value.replace(/[()\\]/g, "\\$&");
}

/** Minimal single-page PDF generator (no external binary). */
function buildSimplePdf(lines: string[]): Buffer {
  const contentLines = [
    "BT",
    "/F1 11 Tf",
    "50 780 Td",
    "14 TL",
    ...lines.map((line, i) => {
      const safe = escapePdfText(line.slice(0, 110));
      return i === 0 ? `(${safe}) Tj` : `T* (${safe}) Tj`;
    }),
    "ET",
  ].join("\n");

  const objects: string[] = [];
  objects.push("1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj");
  objects.push("2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj");
  objects.push(
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj"
  );
  objects.push(
    `4 0 obj<< /Length ${Buffer.byteLength(contentLines, "utf8")} >>stream\n${contentLines}\nendstream\nendobj`
  );
  objects.push("5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj");

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += obj + "\n";
  }
  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

export function buildHotelsQuotePdf(payload: HotelsQuotePayload): Buffer {
  const lines = [
    siteConfig.name.toUpperCase(),
    "Proposition hoteliere",
    "",
    payload.clientName ? `Client: ${payload.clientName}` : "Client: —",
    `Destination: ${payload.destination}`,
    `Sejour: ${payload.startDate} → ${payload.endDate}`,
    `Occupation: ${occupancyLabel(payload.rooms)}`,
    "",
    "Hotels disponibles (tarif a partir de)",
    "----------------------------------------",
    ...payload.hotels.map(
      (hotel) =>
        `${hotel.name} — ${formatMoney(hotel.fromPrice, hotel.currency || payload.currency)}${hotel.location ? ` (${hotel.location})` : ""}`
    ),
    "",
    "Tarifs indicatifs Little Emperors. Sous reserve de disponibilite.",
    `Document genere le ${new Date().toLocaleDateString("fr-FR")}.`,
  ];
  return buildSimplePdf(lines);
}

export function buildRoomsQuotePdf(payload: RoomsQuotePayload): Buffer {
  const rateLines = payload.roomTypes.flatMap((room) => {
    const header = [`${room.name}`, room.description || ""].filter(Boolean);
    const rates = room.rates.map(
      (rate) =>
        `  - ${rate.title || "Tarif"}: ${formatMoney(rate.total, rate.currency || payload.currency)}${rate.cancellation ? ` | ${rate.cancellation}` : ""}`
    );
    return [...header, ...rates, ""];
  });

  const lines = [
    siteConfig.name.toUpperCase(),
    "Proposition chambres",
    "",
    payload.clientName ? `Client: ${payload.clientName}` : "Client: —",
    `Hotel: ${payload.hotelName}`,
    payload.location ? `Lieu: ${payload.location}` : "",
    `Sejour: ${payload.startDate} → ${payload.endDate}`,
    `Occupation: ${occupancyLabel(payload.rooms)}`,
    "",
    "Chambres et tarifs",
    "----------------------------------------",
    ...rateLines,
    "Tarifs Little Emperors. Sous reserve de disponibilite.",
    `Document genere le ${new Date().toLocaleDateString("fr-FR")}.`,
  ].filter((line) => line !== undefined);

  return buildSimplePdf(lines);
}

export type TripQuotePdfPayload = {
  clientName?: string | null;
  title: string;
  startDate?: string | null;
  endDate?: string | null;
  lines: Array<{
    title: string;
    kind?: string | null;
    confirmation?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    amount?: number | null;
    currency?: string | null;
  }>;
};

export function buildTripQuotePdf(payload: TripQuotePdfPayload): Buffer {
  const lines = [
    siteConfig.name.toUpperCase(),
    "Devis voyage (simplifie)",
    "",
    payload.clientName ? `Client: ${payload.clientName}` : "Client: —",
    `Voyage: ${payload.title}`,
    payload.startDate && payload.endDate
      ? `Dates: ${payload.startDate} → ${payload.endDate}`
      : "Dates: a confirmer",
    "",
    "Lignes (1 par reservation)",
    "----------------------------------------",
    ...payload.lines.map((line, i) => {
      const money =
        line.amount != null
          ? formatMoney(line.amount, line.currency || "EUR")
          : "—";
      const conf = line.confirmation ? ` [${line.confirmation}]` : "";
      const dates =
        line.start_date || line.end_date
          ? ` (${line.start_date || "?"} → ${line.end_date || "?"})`
          : "";
      return `${i + 1}. ${line.title}${conf}${dates} — ${money}`;
    }),
    "",
    "Document genere automatiquement depuis les confirmations.",
    `Genere le ${new Date().toLocaleDateString("fr-FR")}.`,
  ];
  return buildSimplePdf(lines);
}
