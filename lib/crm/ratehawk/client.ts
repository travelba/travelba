import { randomUUID } from "node:crypto";
import { ProxyAgent, fetch as undiciFetch } from "undici";
import { sandboxSuffixOf, type SandboxOrderSuffix } from "./catalog";
import { loadRatehawkConfig, requireConfig, type RatehawkConfig } from "./config";
import { clipJson, redact } from "./redact";

export type EtgCall = {
  httpStatus: number;
  status: string | null;
  error: string | null;
  data: unknown;
  durationMs: number;
};

const agents = new Map<string, ProxyAgent>();

function dispatcher(proxy: string | null) {
  if (!proxy) return undefined;
  let agent = agents.get(proxy);
  if (!agent) {
    agent = new ProxyAgent(proxy);
    agents.set(proxy, agent);
  }
  return agent;
}

export function newPartnerOrderId(scenario?: SandboxOrderSuffix | null, previous?: string | null) {
  const suffix = scenario || sandboxSuffixOf(previous);
  const id = randomUUID();
  return suffix ? `${id}_${suffix}` : id;
}

type LogRow = {
  endpoint: string;
  httpStatus: number;
  durationMs: number;
  request: unknown;
  response: unknown;
  error: string | null;
  partnerOrderId?: string | null;
};

async function writeLog(config: RatehawkConfig, row: LogRow) {
  const secrets = [config.apiKey, config.keyId].filter(Boolean);
  const payload = {
    environment: config.environment,
    endpoint: row.endpoint,
    http_status: row.httpStatus,
    duration_ms: row.durationMs,
    partner_order_id: row.partnerOrderId || null,
    error: row.error,
    request: clipJson(redact(row.request, secrets)),
    response: clipJson(redact(row.response, secrets)),
  };
  try {
    const { ratehawkDb } = await import("./store");
    const supabase = ratehawkDb();
    await supabase.from("crm_ratehawk_logs").insert(payload);
  } catch {
    // Le journal ne doit pas masquer la réponse métier. Rien de secret n’est écrit ici.
  }
}

export async function etgPost(
  path: string,
  body: unknown,
  timeoutMs: number,
  partnerOrderId?: string | null,
  config = requireConfig()
): Promise<EtgCall> {
  const endpoint = path.startsWith("/") ? path : `/${path}`;
  const url = `${config.baseUrl}${endpoint}`;
  const started = Date.now();
  const headers = {
    authorization: `Basic ${Buffer.from(`${config.keyId}:${config.apiKey}`).toString("base64")}`,
    "content-type": "application/json",
    accept: "application/json",
    "cache-control": "no-store",
  };
  let httpStatus = 0;
  let parsed: unknown = null;
  let error: string | null = null;
  try {
    const response = await undiciFetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body ?? {}),
      dispatcher: dispatcher(config.proxy),
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    httpStatus = response.status;
    if (response.status >= 300 && response.status < 400) {
      error = "redirect_refused";
    } else {
      const text = await response.text();
      if (text) {
        try {
          parsed = JSON.parse(text) as unknown;
        } catch {
          error = "decoding_json";
          parsed = { raw: text.slice(0, 500) };
        }
      }
    }
  } catch (caught) {
    error = caught instanceof Error && caught.name === "TimeoutError" ? "timeout" : "timeout";
    httpStatus = 0;
  }
  const record = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  const status = typeof record?.status === "string" ? record.status : null;
  const apiError = typeof record?.error === "string" ? record.error : error;
  const call: EtgCall = {
    httpStatus,
    status,
    error: apiError,
    data: record?.data ?? null,
    durationMs: Date.now() - started,
  };
  await writeLog(config, {
    endpoint,
    httpStatus,
    durationMs: call.durationMs,
    request: body,
    response: parsed ?? { error: apiError },
    error: apiError,
    partnerOrderId,
  });
  return call;
}

export async function etgDownload(url: string, config = requireConfig()) {
  const response = await undiciFetch(url, {
    method: "GET",
    dispatcher: dispatcher(config.proxy),
    redirect: "follow",
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`dump_http_${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

export function etgReady() {
  try {
    const config = loadRatehawkConfig();
    return Boolean(config.keyId && config.apiKey);
  } catch {
    return false;
  }
}
