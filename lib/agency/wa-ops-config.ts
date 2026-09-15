import { normalizeWhatsAppDigits } from "@/lib/agency/whatsapp";

const SESSION_TTL_MS = 45 * 60 * 1000;

export function getAgencyOwnerUserId() {
  const id = (process.env.AGENCY_OWNER_USER_ID || "").trim();
  if (!id) {
    throw new Error(
      "AGENCY_OWNER_USER_ID manquant — UUID du compte CRM qui possède les voyages créés par WhatsApp."
    );
  }
  return id;
}

export function getStaffWhatsAppDigits(): string[] {
  const raw = (process.env.AGENCY_STAFF_WHATSAPP || "").trim();
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
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://travelba.fr"
  ).replace(/\/$/, "");
  const origin = base.startsWith("http") ? base : `https://${base}`;
  return `${origin}/admin/mtrip/${guideId}`;
}
