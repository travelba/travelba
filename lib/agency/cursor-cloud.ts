import { createHmac, timingSafeEqual } from "crypto";
import { readEnv } from "@/lib/agency/whatsapp";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE =
  /(?:\+|00)?(?:33|32|41|44|1)?[\s./-]?(?:\d[\s./-]?){8,12}/g;
const MRZ_RE = /\bP[<][A-Z0-9<]{20,}\b/gi;

export function sanitizeProductBrief(text: string): string {
  let s = (text || "").replace(/\r/g, "");
  s = s.replace(EMAIL_RE, "[email]");
  s = s.replace(PHONE_RE, "[tel]");
  s = s.replace(/\b[A-Z]{1,2}\d{6,9}\b/g, "[id]");
  s = s.replace(MRZ_RE, "[mrz]");
  s = s.replace(/\s+/g, " ").trim();
  return s.slice(0, 800);
}

export function cursorCloudConfigured() {
  return Boolean(readEnv("CURSOR_API_KEY"));
}

function cursorRepo() {
  return (
    readEnv("CURSOR_AGENT_REPO") || "https://github.com/travelba/travelba"
  );
}

function cursorWebhookUrl() {
  const site = (
    readEnv("CURSOR_WEBHOOK_URL") ||
    `${(readEnv("NEXT_PUBLIC_SITE_URL") || "https://travelba.fr").replace(/\/$/, "")}/api/webhooks/cursor/agents`
  ).trim();
  return site;
}

function authHeader() {
  const key = readEnv("CURSOR_API_KEY");
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

export type CursorAgentLaunch = {
  id: string;
  status: string;
  url?: string | null;
};

export async function launchCursorAgent(input: {
  brief: string;
}): Promise<CursorAgentLaunch> {
  const brief = sanitizeProductBrief(input.brief);
  if (!brief) throw new Error("Brief produit vide après nettoyage");
  if (!cursorCloudConfigured()) {
    throw new Error("CURSOR_API_KEY manquant");
  }

  const webhookSecret = readEnv("CURSOR_WEBHOOK_SECRET");
  const webhookUrl = cursorWebhookUrl();
  const prompt = [
    "Tu travailles sur Travelba, CRM agence de voyage FR (Next.js).",
    "Lis `.cursor/skills/travelba-voyage-crm/SKILL.md` puis le skill domaine.",
    "Demande staff (déjà nettoyée, sans PII client) :",
    brief,
    "",
    "Contraintes :",
    "- UI / copy client en français.",
    "- Ne pas changer la copy Concierge client.",
    "- Allowlist staff WhatsApp, opt-in puis dossier, pas de /v/ sans publish mTrip.",
    "- Titres devis métier, jamais Capture/Screenshot.",
    "- Secrets uniquement en env, jamais commit.",
    "- Ouvre une PR, ne merge pas.",
  ].join("\n");

  const body: Record<string, unknown> = {
    prompt: { text: prompt },
    source: {
      repository: cursorRepo(),
      ref: "main",
    },
    target: {
      autoCreatePr: true,
    },
  };
  if (webhookUrl.startsWith("https://") && webhookSecret.length >= 32) {
    body.webhook = { url: webhookUrl, secret: webhookSecret };
  } else if (webhookUrl.startsWith("https://")) {
    body.webhook = { url: webhookUrl };
  }

  const res = await fetch("https://api.cursor.com/v0/agents", {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as {
    id?: string;
    status?: string;
    target?: { url?: string; prUrl?: string };
    error?: { message?: string };
    message?: string;
  } | null;
  if (!res.ok || !json?.id) {
    throw new Error(
      json?.error?.message ||
        json?.message ||
        `Cursor Cloud Agent ${res.status}`
    );
  }
  return {
    id: json.id,
    status: json.status || "CREATING",
    url: json.target?.prUrl || json.target?.url || null,
  };
}

export async function fetchCursorAgent(id: string) {
  const res = await fetch(`https://api.cursor.com/v0/agents/${id}`, {
    headers: { Authorization: authHeader() },
  });
  const json = (await res.json().catch(() => null)) as {
    id?: string;
    status?: string;
    target?: { url?: string; prUrl?: string; branchName?: string };
    summary?: string;
  } | null;
  if (!res.ok || !json) return null;
  return json;
}

export function verifyCursorWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
) {
  const secret = readEnv("CURSOR_WEBHOOK_SECRET");
  if (!secret) return false;
  if (!signatureHeader) return false;
  const hex = signatureHeader.replace(/^sha256=/i, "").trim();
  const digest = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");
  try {
    const a = Buffer.from(hex, "hex");
    const b = Buffer.from(digest, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export type CursorWebhookEvent = {
  id: string;
  status: string;
  prUrl: string | null;
  summary: string | null;
};

export function parseCursorWebhook(body: unknown): CursorWebhookEvent | null {
  if (!body || typeof body !== "object") return null;
  const rec = body as Record<string, unknown>;
  const target =
    rec.target && typeof rec.target === "object"
      ? (rec.target as Record<string, unknown>)
      : {};
  const id = String(rec.id || rec.agentId || "");
  if (!id) return null;
  const prUrl =
    (typeof target.prUrl === "string" && target.prUrl) ||
    (typeof target.url === "string" && target.url.includes("github.com")
      ? target.url
      : null) ||
    (typeof rec.prUrl === "string" ? rec.prUrl : null);
  return {
    id,
    status: String(rec.status || ""),
    prUrl,
    summary: typeof rec.summary === "string" ? rec.summary : null,
  };
}
