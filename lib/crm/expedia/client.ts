import { randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { loadExpediaConfig, type ExpediaConfig } from "./config";
import { eanAuthorization } from "./signature";

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

async function readBody(response: Response) {
  const buffer = Buffer.from(await response.arrayBuffer());
  const encoding = response.headers.get("content-encoding") || "";
  const gzip = encoding.includes("gzip") || (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b);
  const text = (gzip ? gunzipSync(buffer) : buffer).toString("utf8");
  return text;
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
        error = error || `http_${response.status}`;
      }
    }
  } catch (caught) {
    error = caught instanceof ExpediaError ? caught.code : "timeout";
    httpStatus = 0;
  }
  await writeLog(config, { endpoint, httpStatus, durationMs: Date.now() - started, error });
  if (error) throw new ExpediaError(error, httpStatus);
  return { data: parsed, transactionId: randomUUID() };
}

export function expediaFailureCode(err: unknown) {
  if (err instanceof ExpediaError) return clip(err.code);
  return "error";
}
