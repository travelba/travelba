import { redactIngestText } from "@/lib/crm/ingest-redact";

/** Journal d’une décision d’import. Jamais de numéro de pièce, de MRZ ni de carte. */

export type IngestAuditDraft = {
  actorKind: "auto" | "human";
  actorId?: string | null;
  action: string;
  emailIngestId?: string | null;
  bookingId?: string | null;
  customerId?: string | null;
  summary: string;
  detail?: Record<string, unknown> | null;
  /** `whatsapp_concierge` : le concierge a écrit à la place du client. */
  source?: string | null;
};

const MRZ_LINE = /^[A-Z0-9<]{28,}$/;

function keepLast3(value: string) {
  const compact = value.replace(/\s/g, "");
  if (compact.length <= 3) return "•••";
  return `•••${compact.slice(-3)}`;
}

/** Masque MRZ, numéros de passeport et cartes. Les trois derniers caractères d’un numéro de pièce restent. */
export function maskAuditText(input: string) {
  const lines = input.split("\n").map((line) => {
    const compact = line.trim().replace(/\s/g, "");
    if (MRZ_LINE.test(compact)) return `MRZ ${keepLast3(compact)}`;
    return line;
  });
  const masked = lines
    .join("\n")
    .replace(/\bP<[A-Z0-9<]{8,}/g, (token) => `P<${keepLast3(token)}`)
    .replace(/\b[A-Z]{1,2}\d{6,9}\b/g, (token) => keepLast3(token));
  return redactIngestText(masked);
}

function maskValue(value: unknown): unknown {
  if (typeof value === "string") return maskAuditText(value);
  if (Array.isArray(value)) return value.map((entry) => maskValue(entry));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (/passport|mrz|pan|cvv|card/i.test(key)) {
        out[key] = typeof entry === "string" ? maskAuditText(entry) : "•••";
        continue;
      }
      out[key] = maskValue(entry);
    }
    return out;
  }
  return value;
}

export function toAuditRow(draft: IngestAuditDraft) {
  const source = (draft.source || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 40);
  return {
    actor_kind: draft.actorKind,
    actor_id: draft.actorId || null,
    action: draft.action.slice(0, 80),
    email_ingest_id: draft.emailIngestId || null,
    booking_id: draft.bookingId || null,
    customer_id: draft.customerId || null,
    summary: maskAuditText(draft.summary).slice(0, 400),
    detail: (maskValue(draft.detail || {}) || {}) as Record<string, unknown>,
    ...(source ? { source } : {}),
  };
}
