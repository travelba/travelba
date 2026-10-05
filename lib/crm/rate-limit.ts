import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const RATE_LIMITED_MESSAGE = "Trop de tentatives. Réessayez plus tard.";

export type RateLimitRule = { key: string; limit: number; windowSeconds: number };

/** Clé bornée, sans donnée en clair : `otp:email:<sha256 tronqué>`. */
export function rateLimitKey(scope: string, subject: string) {
  const normalized = (subject || "").trim().toLowerCase() || "unknown";
  const digest = createHash("sha256").update(normalized).digest("hex").slice(0, 32);
  return `${scope.trim().toLowerCase()}:${digest}`;
}

/**
 * Miroir pur de `crm_rate_limit_hit` : une tentative de plus dans la fenêtre,
 * ou une fenêtre neuve si l’ancienne est passée. Sert aux tests et documente la règle SQL.
 */
export function rateWindow(input: {
  hits: number;
  windowStartedAt: Date | null;
  now: Date;
  limit: number;
  windowSeconds: number;
}) {
  const started = input.windowStartedAt;
  const expired = !started || started.getTime() + input.windowSeconds * 1000 <= input.now.getTime();
  const hits = expired ? 1 : input.hits + 1;
  return {
    allowed: hits <= input.limit,
    hits,
    windowStartedAt: expired ? input.now : (started as Date),
  };
}

let warned = false;

type RpcClient = Pick<SupabaseClient, "rpc">;

async function serviceClient(): Promise<RpcClient> {
  const { createServiceClient } = await import("@/lib/supabase/admin");
  return createServiceClient();
}

/**
 * Une tentative de plus pour cette clé. `true` = autorisée.
 * Sans la migration (ou base indisponible), on laisse passer et on prévient une fois :
 * un limiteur en panne ne doit pas couper la connexion des clients.
 */
export async function rateLimit(rule: RateLimitRule, client?: RpcClient): Promise<boolean> {
  try {
    const rpc = client ?? (await serviceClient());
    const { data, error } = await rpc.rpc("crm_rate_limit_hit", {
      p_key: rule.key,
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    });
    if (error) throw new Error(error.message || "rpc");
    return data !== false;
  } catch {
    if (!warned) {
      warned = true;
      console.warn("[rate-limit] migration rate_limits non appliquée ou base indisponible : limite non appliquée");
    }
    return true;
  }
}

/** Toutes les règles comptent (chaque compteur avance) ; refus dès qu’une dépasse. */
export async function rateLimitAll(rules: RateLimitRule[], client?: RpcClient): Promise<boolean> {
  const results = await Promise.all(rules.map((rule) => rateLimit(rule, client)));
  return results.every(Boolean);
}

/** Lisse le temps de réponse : attend jusqu’à `minMs` depuis `startedAt`. */
export async function padDuration(startedAt: number, minMs: number) {
  const remaining = minMs - (Date.now() - startedAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}

/** Première adresse de la chaîne x-forwarded-for, sinon x-real-ip, sinon « unknown ». */
export function requestIp(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first.slice(0, 64);
  const real = headers.get("x-real-ip")?.trim();
  return real ? real.slice(0, 64) : "unknown";
}
