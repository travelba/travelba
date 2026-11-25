import "server-only";

import http2 from "node:http2";
import {
  apnsHost,
  apnsRequestHeaders,
  readApnsSettings,
  signApnsJwt,
  type ApnsPushType,
  type ApnsSettings,
} from "@/lib/crm/apns-token";
import { isVercelPreview } from "@/lib/crm/preview-secrets";

export type ApnsSendResult = { status: number; reason: string };

let cachedJwt: { token: string; until: number } | null = null;

export function currentApnsSettings() {
  return readApnsSettings(process.env, isVercelPreview());
}

function bearer(settings: ApnsSettings) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && cachedJwt.until > now + 60) return cachedJwt.token;
  const token = signApnsJwt({
    key: settings.key,
    keyId: settings.keyId,
    teamId: settings.teamId,
    issuedAt: now,
  });
  cachedJwt = { token, until: now + 50 * 60 };
  return token;
}

export type ApnsPushOptions = {
  pushType?: ApnsPushType;
  topic?: string;
  priority?: "5" | "10";
};

/** Envoi HTTP/2. N’écrit pas le jeton appareil. */
export function postApns(
  settings: ApnsSettings,
  deviceToken: string,
  payload: unknown,
  options?: ApnsPushOptions
): Promise<ApnsSendResult> {
  const body = JSON.stringify(payload);
  const headers = apnsRequestHeaders({
    bundleId: settings.bundleId,
    pushType: options?.pushType,
    topic: options?.topic,
    priority: options?.priority,
    authorization: bearer(settings),
  });
  return new Promise((resolve, reject) => {
    const client = http2.connect(`https://${apnsHost(settings.production)}`);
    const timer = setTimeout(() => {
      client.destroy();
      reject(new Error("Délai APNs"));
    }, 8000);
    const done = (error?: Error, result?: ApnsSendResult) => {
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result || { status: 0, reason: "" });
    };
    client.on("error", (error) => done(error));
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      ...headers,
    });
    const chunks: Buffer[] = [];
    req.on("response", (headers) => {
      const status = Number(headers[":status"] || 0);
      req.on("data", (chunk) => chunks.push(chunk as Buffer));
      req.on("end", () => {
        client.close();
        let reason = "";
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { reason?: string };
          reason = typeof parsed.reason === "string" ? parsed.reason : "";
        } catch {
          reason = "";
        }
        done(undefined, { status, reason });
      });
    });
    req.on("error", (error) => {
      client.destroy();
      done(error);
    });
    req.end(body);
  });
}

/** Jeton inutilisable : on le retire. Un refus de certificat ne l’est pas. */
export function apnsTokenRejected(result: ApnsSendResult) {
  if (result.status === 410) return true;
  return result.status === 400 && /BadDeviceToken|DeviceTokenNotForTopic|Unregistered/i.test(result.reason);
}
