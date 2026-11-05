import { frenchLeBenefitLine } from "@/lib/crm/ingest-parse";

const SUITE_PREFIX = /^suite bookings\s*:\s*/i;
const AVAILABILITY = /\(selon disponibilité\)\s*$/i;

export function leRoomLabels(input: {
  room_types?: Array<string | null | undefined> | null;
  rooms?: Array<{ room_type?: string | null; room?: string | null; type?: string | null } | null> | null;
  room?: string | null;
}): string[] {
  const labels: string[] = [];
  const push = (value: string | null | undefined) => {
    const line = (value || "").replace(/\s+/g, " ").trim();
    if (line && !labels.some((row) => row.localeCompare(line, "fr", { sensitivity: "accent" }) === 0)) {
      labels.push(line);
    }
  };
  for (const type of input.room_types || []) push(type);
  for (const room of input.rooms || []) {
    if (!room) continue;
    push(room.room_type);
    push(room.type);
    push(room.room);
  }
  push(input.room);
  return labels;
}

/** La chambre réservée est une suite. Sans type de chambre, les lignes « Suite Bookings » restent de côté. */
export function leRoomIsSuite(labels: string[]): boolean {
  return labels.some((label) => /\bsuites?\b/i.test(label));
}

function prepared(raw: string) {
  const compact = raw.replace(/\s+/g, " ").trim();
  const starred = /\*/.test(compact);
  const line = compact
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .replace(/^(?:[-•]\s*)+/, "")
    .trim();
  return { line, starred };
}

/**
 * Avantages Little Emperors pour `details.included`.
 * Une phrase connue est traduite, les autres restent. L’astérisque devient
 * « (selon disponibilité) ». « Suite Bookings: » ne reste que si la chambre est une suite.
 */
export function leIncludedLines(benefits: string[], rooms: string[] = []): string[] {
  const suite = leRoomIsSuite(rooms);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of benefits) {
    if (typeof raw !== "string") continue;
    const { line, starred } = prepared(raw);
    if (!line) continue;
    const suiteLine = SUITE_PREFIX.test(line);
    if (suiteLine && !suite) continue;
    const body = suiteLine ? line.replace(SUITE_PREFIX, "").trim() : line;
    if (!body) continue;
    let french = frenchLeBenefitLine(body);
    if (!french) continue;
    if (starred && !AVAILABILITY.test(french)) french = `${french} (selon disponibilité)`;
    const key = french.toLocaleLowerCase("fr");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(french);
  }
  return out;
}

function writtenIncluded(details: { included?: unknown } | null | undefined): string[] {
  if (!details || !Array.isArray(details.included)) return [];
  return details.included.map((line) => (typeof line === "string" ? line.trim() : "")).filter(Boolean);
}

/** Pose la liste. Une liste déjà écrite, même d’une seule ligne, n’est pas remplacée. */
export function assignLeIncluded(
  details: Record<string, unknown>,
  benefits: string[],
  rooms: string[] = []
): boolean {
  if (writtenIncluded(details).length) return false;
  const next = leIncludedLines(benefits, rooms);
  if (!next.length) return false;
  details.included = next;
  return true;
}
