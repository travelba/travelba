import { attachedEmailLabel } from "@/lib/crm/email-detach";

export const EMAIL_DISMISS_MARK = { file: "staff", message: "écarté" } as const;

type Warning = { file?: string | null; message?: string | null };

export type GroupableEmail = {
  id: string;
  subject?: string | null;
  received_at?: string | null;
  extract?: unknown;
  warnings?: Warning[] | null;
};

export function isDismissedEmail(row: { warnings?: Warning[] | null }) {
  return (row.warnings || []).some(
    (warning) => warning?.file === EMAIL_DISMISS_MARK.file && warning?.message === EMAIL_DISMISS_MARK.message
  );
}

export function dismissEmailWarnings(warnings: Warning[] | null | undefined) {
  const next = (warnings || [])
    .filter((warning) => warning && typeof warning.file === "string" && typeof warning.message === "string")
    .map((warning) => ({ file: warning.file as string, message: warning.message as string }));
  if (!isDismissedEmail({ warnings: next })) next.push({ ...EMAIL_DISMISS_MARK });
  return next;
}

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/milano/g, "milan")
    .replace(/\bhotel\b/g, " ")
    .replace(/[^a-z0-9/]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function stripForward(subject: string) {
  return subject.replace(/^((fw|fwd|tr|re)\s*:\s*)+/i, "").trim();
}

function isForward(subject: string) {
  return /^(fw|fwd)\s*:/i.test(subject.trim());
}

type ExtractItem = {
  kind?: string;
  title?: string | null;
  confirmation_ref?: string | null;
  start_at?: string | null;
  details?: { hotel_name?: string | null; city?: string | null } | null;
};

function extractItems(row: GroupableEmail): ExtractItem[] {
  const extract =
    row.extract && typeof row.extract === "object"
      ? (row.extract as { items?: ExtractItem[] })
      : null;
  return Array.isArray(extract?.items) ? extract.items : [];
}

function ticketKey(row: GroupableEmail) {
  const subject = stripForward(row.subject || "");
  const match = subject.match(/([a-z][a-z'’.-]{1,40}\s*\/\s*[a-z][a-z'’.-]{1,40})\s+(\d{2}[a-z]{3}\d{4})/i);
  if (!match) return null;
  return `ticket:${fold(match[1])}:${match[2].toLowerCase()}`;
}

function hotelKey(row: GroupableEmail) {
  const hotel = extractItems(row).find((item) => item?.kind === "hotel");
  if (!hotel) return null;
  const name = fold(hotel.details?.hotel_name || hotel.title || "");
  const day = (hotel.start_at || "").slice(0, 10);
  if (!name) return null;
  return `hotel:${name}:${/^\d{4}-\d{2}-\d{2}$/.test(day) ? day : ""}`;
}

function groupKey(row: GroupableEmail) {
  return ticketKey(row) || hotelKey(row);
}

function duplicateLabel(row: GroupableEmail) {
  const subject = row.subject || "";
  const ticket = subject.match(/([A-Za-z][A-Za-z'’.-]+)\s*\/\s*[A-Za-z]/);
  if (/billet|e-ticket|ticket|reçu/i.test(subject) && ticket) {
    const name = ticket[1].toUpperCase();
    return isForward(subject) ? `Fw: reçu de billet ${name}` : `Reçu de billet ${name}`;
  }
  const hotel = attachedEmailLabel(row);
  return isForward(subject) ? `Fw: ${hotel}` : hotel;
}

function byReceived(a: GroupableEmail, b: GroupableEmail) {
  return (a.received_at || "").localeCompare(b.received_at || "");
}

export type EmailGroupView = {
  sources: { id: string; label: string }[];
  duplicates: { id: string; label: string }[];
};

/**
 * Le mail qui a rempli la carte reste avec les pièces.
 * Les copies (transfert, second envoi du même hôtel) sont des doublons à écarter.
 */
export function groupAttachedEmails(rows: GroupableEmail[]): EmailGroupView {
  const active = rows.filter((row) => row.id && !isDismissedEmail(row));
  const buckets = new Map<string, GroupableEmail[]>();
  const alone: GroupableEmail[] = [];
  for (const row of active) {
    const key = groupKey(row);
    if (!key) {
      alone.push(row);
      continue;
    }
    const bucket = buckets.get(key) || [];
    bucket.push(row);
    buckets.set(key, bucket);
  }

  const sources: EmailGroupView["sources"] = [];
  const duplicates: EmailGroupView["duplicates"] = [];

  for (const bucket of buckets.values()) {
    const ordered = bucket.slice().sort(byReceived);
    const canonical = ordered.find((row) => !isForward(row.subject || "")) || ordered[0];
    sources.push({ id: canonical.id, label: attachedEmailLabel(canonical) });
    for (const row of ordered) {
      if (row.id === canonical.id) continue;
      duplicates.push({ id: row.id, label: duplicateLabel(row) });
    }
  }

  for (const row of alone.sort(byReceived)) {
    sources.push({ id: row.id, label: attachedEmailLabel(row) });
  }

  return { sources, duplicates };
}
