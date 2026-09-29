import { isPlaceholderTraveler, type PersonName } from "./person-match";
import { documentMatchesTraveler, travelerDisplayName } from "./trip-documents";
import type { CrmBookingTraveler, CrmTravelDocument } from "./types";

export type PrecheckPiece = {
  id: string;
  label: "Passeport" | "Carte d'identité";
  path: string;
  fileName: string;
};

export type PrecheckTraveler = {
  id: string;
  name: string;
  pieces: PrecheckPiece[];
};

const IDENTITY = [
  ["passport", "Passeport"],
  ["id_card", "Carte d'identité"],
] as const;

/** Une pièce d'identité par voyageur et par type, celle du séjour en priorité. */
export function precheckParty(
  travelers: CrmBookingTraveler[],
  docs: CrmTravelDocument[],
  holder?: PersonName | null
): PrecheckTraveler[] {
  const named = travelers.filter((traveler) => !isPlaceholderTraveler(traveler.first_name, traveler.last_name));
  const party = named.length ? named : travelers;
  const seen = new Set<string>();
  return party.map((traveler) => {
    const pieces: PrecheckPiece[] = [];
    for (const [type, label] of IDENTITY) {
      const matches = docs.filter(
        (doc) => doc.doc_type === type && Boolean(doc.storage_path) && documentMatchesTraveler(doc, traveler, holder)
      );
      const doc = matches.find((row) => row.booking_id === traveler.booking_id) || matches[0] || null;
      if (!doc?.storage_path || seen.has(doc.id)) continue;
      seen.add(doc.id);
      pieces.push({
        id: doc.id,
        label,
        path: doc.storage_path,
        fileName: doc.file_name || label,
      });
    }
    return { id: traveler.id, name: travelerDisplayName(traveler), pieces };
  });
}

export function selectedPrecheckPieces(party: PrecheckTraveler[], ids: string[]) {
  const wanted = new Set(ids);
  return party.flatMap((traveler) => traveler.pieces.filter((piece) => wanted.has(piece.id)).map((piece) => ({ ...piece, traveler: traveler.name })));
}

function pdfEscape(value: string) {
  return value.replace(/[^\n]/g, (char) => {
    if (char === "\\") return "\\\\";
    if (char === "(") return "\\(";
    if (char === ")") return "\\)";
    const code = char.charCodeAt(0);
    if (code >= 32 && code <= 126) return char;
    if (code <= 255) return `\\${code.toString(8).padStart(3, "0")}`;
    return "?";
  });
}

function grouped(pan: string) {
  return pan.replace(/\D/g, "").replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

/** PDF d'envoi uniquement. Ne pas l'écrire dans le dossier. */
export function checkinCardPdf(input: { holder: string; pan: string; expiry: string; cvc: string; lang: "fr" | "en" }) {
  const lines =
    input.lang === "fr"
      ? [
          "Carte pour l'enregistrement",
          `Titulaire : ${input.holder}`,
          `Numéro : ${grouped(input.pan)}`,
          `Expiration : ${input.expiry}`,
          `Cryptogramme : ${input.cvc}`,
        ]
      : [
          "Card for check-in",
          `Cardholder: ${input.holder}`,
          `Number: ${grouped(input.pan)}`,
          `Expiry: ${input.expiry}`,
          `Security code: ${input.cvc}`,
        ];
  const commands = ["BT", "/F1 14 Tf", "48 760 Td"];
  lines.forEach((line, index) => {
    if (index) commands.push("0 -26 Td");
    commands.push(`(${pdfEscape(line)}) Tj`);
  });
  commands.push("ET");
  const stream = commands.join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n",
    `4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj\n`,
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(pdf.length);
    pdf += object;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}
