import { NextResponse } from "next/server";
import { jsonError } from "@/lib/crm/auth";
import { mobileSessionFromOtp } from "@/lib/crm/mobile-session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const result = await mobileSessionFromOtp({
    tokenHash: typeof body.token_hash === "string" ? body.token_hash : null,
    code: typeof body.code === "string" ? body.code : null,
    type: typeof body.type === "string" ? body.type : null,
  });
  if (!result.ok) return jsonError(result.error, result.status);
  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
}
