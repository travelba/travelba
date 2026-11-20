import { randomUUID } from "node:crypto";
import { setDefaultResultOrder } from "node:dns";
import { gunzipSync } from "node:zlib";
import { loadExpediaConfig, type ExpediaConfig } from "./config";
import { eanAuthorization } from "./signature";

// Vercel tente d’abord l’IPv6. test.ean.com y reste muet, puis le délai tombe.
setDefaultResultOrder("ipv4first");

export class ExpediaError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number
  ) {
    super(code);
  }
}

function clip(value: string, max = 180) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function decodeBody(buffer: Buffer, encoding: string) {
  const gzip = encoding.includes("gzip") || (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b);
  if (!gzip) return buffer.toString("utf8");
  try {
    return gunzipSync(buffer).toString("utf8");
  } catch {
    return buffer.toString("utf8");
  }
}

async function readBody(response: Response) {
  const buffer = Buffer.from(await response.arrayBuffer());
  return decodeBody(buffer, response.headers.get("content-encoding") || "");
}

function expediaType(parsed: unknown) {
  if (!parsed || typeof parsed !== "object") return "";
  const type = (parsed as { type?: unknown }).type;
  if (typeof type !== "string") return "";
  return type.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 40);
}

function expediaFields(parsed: unknown) {
  if (!parsed || typeof parsed !== "object") return "";
  const errors = (parsed as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) return "";
  const names: string[] = [];
  for (const item of errors) {
    const fields = item && typeof item === "object" ? (item as { fields?: unknown }).fields : null;
    if (!Array.isArray(fields)) continue;
    for (const field of fields) {
      const name = field && typeof field === "object" ? (field as { name?: unknown }).name : null;
      if (typeof name !== "string" || !/^[a-z0-9_.-]{1,40}$/i.test(name)) continue;
      const clean = name.toLowerCase();
      if (!names.includes(clean)) names.push(clean);
    }
  }
  return names.slice(0, 3).join("_");
}

function transportCode(caught: unknown) {
  if (!(caught instanceof Error)) return "network";
  if (caught.name === "TimeoutError" || caught.name === "AbortError") return "timeout";
  const cause = (caught as { cause?: { code?: unknown } }).cause;
  const code = typeof cause?.code === "string" ? cause.code : "";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "dns";
  if (code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT" || code === "UND_ERR_HEADERS_TIMEOUT") return "timeout";
  return "network";
}

async function writeLog(config: ExpediaConfig, row: { endpoint: string; httpStatus: number; durationMs: number; error: string | null }) {
  try {
    const { createServiceClient } = await import("@/lib/supabase/admin");
    await createServiceClient()
      .from("crm_expedia_logs")
      .insert({
        environment: config.environment,
        endpoint: row.endpoint,
        http_status: row.httpStatus,
        duration_ms: row.durationMs,
        error: row.error,
      });
  } catch {
    // Le journal ne bloque pas la lecture. Aucun secret n’y est écrit.
  }
}

export async function eanGet(
  path: string,
  query: URLSearchParams,
  options: { timeoutMs?: number; signal?: AbortSignal; customerIp?: string | null; fetchImpl?: typeof fetch } = {},
  config = loadExpediaConfig()
) {
  if (!config.apiKey || !config.sharedSecret) throw new ExpediaError("not_configured", 0);
  const endpoint = path.startsWith("/") ? path : `/${path}`;
  const url = `${config.baseUrl}${endpoint}?${query.toString()}`;
  const auth = eanAuthorization(config.apiKey, config.sharedSecret);
  const headers: Record<string, string> = {
    accept: "application/json",
    "accept-encoding": "gzip",
    authorization: auth.authorization,
    "user-agent": config.userAgent,
    "customer-ip": options.customerIp || (config.environment === "test" ? "127.0.0.1" : ""),
  };
  if (!headers["customer-ip"]) throw new ExpediaError("customer_ip", 0);
  if (config.testHeader) headers.test = config.testHeader;
  const started = Date.now();
  let httpStatus = 0;
  let error: string | null = null;
  let parsed: unknown = null;
  try {
    const response = await (options.fetchImpl || fetch)(url, {
      method: "GET",
      headers,
      redirect: "manual",
      signal: options.signal ?? AbortSignal.timeout(options.timeoutMs ?? 12_000),
    });
    httpStatus = response.status;
    if (response.status >= 300 && response.status < 400) {
      error = "redirect_refused";
    } else if (response.status === 204) {
      parsed = [];
    } else {
      const text = await readBody(response);
      if (text) {
        try {
          parsed = JSON.parse(text) as unknown;
        } catch {
          error = "decoding_json";
        }
      }
      if (response.status < 200 || response.status >= 300) {
        const kind = expediaType(parsed);
        const fields = expediaFields(parsed);
        const base = kind ? `http_${response.status}_${kind}` : `http_${response.status}`;
        error = error || (fields ? `${base}_${fields}` : base);
      }
    }
  } catch (caught) {
    error = caught instanceof ExpediaError ? caught.code : transportCode(caught);
    httpStatus = 0;
  }
  const durationMs = Date.now() - started;
  if (error) console.error("[expedia]", endpoint, httpStatus, durationMs, error);
  await writeLog(config, { endpoint, httpStatus, durationMs, error });
  if (error) throw new ExpediaError(error, httpStatus);
  return { data: parsed, transactionId: randomUUID() };
}

export function expediaFailureCode(err: unknown) {
  if (err instanceof ExpediaError) return clip(err.code);
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError" || err.message === "timeout")) {
    return "timeout";
  }
  return "error";
}

/** Texte montré à l’agence. Le code reste court, sans URL ni clé. */
export function expediaFailureText(code: string) {
  if (code === "timeout") return "Expedia n’a pas répondu à temps.";
  if (code === "dns" || code === "network") return "Expedia est injoignable depuis le serveur.";
  if (code.startsWith("http_401") || code.startsWith("http_403")) return "Expedia a refusé l’accès de test.";
  if (code.startsWith("http_429")) return "Expedia a limité les appels.";
  if (code === "not_configured") return "Expedia n’est pas configuré.";
  if (code.startsWith("http_")) return "Expedia a refusé la recherche.";
  return "Expedia n’a pas répondu.";
}
