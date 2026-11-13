import { AsyncLocalStorage } from "node:async_hooks";
import { NextResponse } from "next/server";
import { requireRatehawkActor } from "@/lib/crm/auth";
import { certificationEnvironmentAllowed, safeConfig } from "./config";
import { bookingUserIp } from "./limits";

const bookingIp = new AsyncLocalStorage<string>();
const FALLBACK_USER_IP = "127.0.0.1";

export function ratehawkJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function staffOrResponse() {
  const auth = await requireRatehawkActor();
  if (auth instanceof NextResponse) return auth;
  if (auth.staff.role === "ratehawk_cert" && !certificationEnvironmentAllowed(safeConfig()?.environment)) {
    return ratehawkJson({ error: "La certification Ratehawk n’ouvre que le bac à sable." }, 403);
  }
  return auth;
}

export function requestIp(request: Request) {
  const forwarded = bookingUserIp(request.headers.get("x-forwarded-for")?.split(",")[0]);
  if (forwarded) return forwarded;
  const real = bookingUserIp(request.headers.get("x-real-ip"));
  if (real) return real;
  return FALLBACK_USER_IP;
}

/** L’appel MCP porte l’IP du visiteur. Un libellé retombe sur l’adresse de repli. */
export function runWithBookingUserIp<T>(ip: string, run: () => T): T {
  return bookingIp.run(bookingUserIp(ip) || FALLBACK_USER_IP, run);
}

export function currentBookingUserIp() {
  return bookingIp.getStore() || FALLBACK_USER_IP;
}
