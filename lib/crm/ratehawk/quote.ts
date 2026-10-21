import { createHmac, timingSafeEqual } from "node:crypto";
import type { RatehawkConfig } from "./config";

export type RateQuote = {
  book_hash: string;
  hid: number;
  amount: string;
  currency_code: string;
  show_amount: string;
  show_currency_code: string;
  payment_type: string;
  price_increased: boolean;
};

export function signQuote(quote: RateQuote, config: Pick<RatehawkConfig, "apiKey" | "environment">) {
  const body = JSON.stringify({ ...quote, environment: config.environment });
  const mac = createHmac("sha256", config.apiKey).update(body).digest("base64url");
  return `${Buffer.from(body).toString("base64url")}.${mac}`;
}

export function readQuote(token: string, config: Pick<RatehawkConfig, "apiKey" | "environment">): RateQuote | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  let json: string;
  try {
    json = Buffer.from(body, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = createHmac("sha256", config.apiKey).update(json).digest("base64url");
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(json) as RateQuote & { environment?: string };
    if (parsed.environment !== config.environment) return null;
    if (!parsed.book_hash?.startsWith("p-")) return null;
    return parsed;
  } catch {
    return null;
  }
}
