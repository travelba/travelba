import { NextResponse } from "next/server";
import { requireRatehawkActor } from "@/lib/crm/auth";
import { certificationEnvironmentAllowed, safeConfig } from "./config";

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
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  if (/^[\da-f:.]+$/i.test(forwarded)) return forwarded;
  const real = request.headers.get("x-real-ip")?.trim() || "";
  if (/^[\da-f:.]+$/i.test(real)) return real;
  return "127.0.0.1";
}
