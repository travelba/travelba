import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/crm/auth";

export function ratehawkJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function staffOrResponse() {
  const auth = await requireStaff();
  if (auth instanceof NextResponse) return auth;
  return auth;
}

export function requestIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  if (/^[\da-f:.]+$/i.test(forwarded)) return forwarded;
  const real = request.headers.get("x-real-ip")?.trim() || "";
  if (/^[\da-f:.]+$/i.test(real)) return real;
  return "127.0.0.1";
}
