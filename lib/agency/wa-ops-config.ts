import { normalizeWhatsAppDigits, readEnv } from "@/lib/agency/whatsapp";

const SESSION_TTL_MS = 45 * 60 * 1000;

export function getAgencyOwnerUserId() {
  let id = readEnv("AGENCY_OWNER_USER_ID");
  const uuid = id.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
  );
  if (uuid) id = uuid[0];
  if (!id) {
    throw new Error(
      "AGENCY_OWNER_USER_ID manquant — UUID du compte CRM qui possède les voyages créés par WhatsApp."
    );
  }
  return id;
}

export function getStaffWhatsAppDigits(): string[] {
  const raw = readEnv("AGENCY_STAFF_WHATSAPP");
  if (!raw) return [];
  return raw
    .split(/[,;\s]+/)
    .map((p) => normalizeWhatsAppDigits(p))
    .filter((d): d is string => Boolean(d));
}

export function isStaffSender(fromDigits: string) {
  const staff = getStaffWhatsAppDigits();
  if (!staff.length) return false;
  const needle = fromDigits.replace(/\D/g, "");
  return staff.some((s) => s === needle || s.endsWith(needle.slice(-9)) || needle.endsWith(s.slice(-9)));
}

export function sessionTtlMs() {
  const raw = Number(process.env.AGENCY_WA_OPS_TTL_MINUTES || 45);
  const minutes = Number.isFinite(raw) && raw > 0 ? raw : 45;
  return minutes * 60 * 1000;
}

export { SESSION_TTL_MS };

export function adminGuideUrl(guideId: string) {
  const base = (
    readEnv("NEXT_PUBLIC_SITE_URL") ||
    readEnv("NEXT_PUBLIC_APP_URL") ||
    "https://travelba.fr"
  ).replace(/\/$/, "");
  const origin = base.startsWith("http") ? base : `https://${base}`;
  return `${origin}/admin/mtrip/${guideId}`;
}
