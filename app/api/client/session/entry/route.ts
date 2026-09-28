import { NextResponse } from "next/server";
import { jsonError } from "@/lib/crm/auth";
import { entryCodeFromPath } from "@/lib/crm/mobile-auth";
import { mobileSessionFromEntry } from "@/lib/crm/mobile-session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const raw =
    typeof body.code === "string"
      ? body.code
      : typeof body.path === "string"
        ? entryCodeFromPath(body.path) || ""
        : "";
  const result = await mobileSessionFromEntry(raw.trim().toUpperCase());
  if (!result.ok) return jsonError(result.error, result.status);
  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
}
