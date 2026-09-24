import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { entryOpenRequested, entryPreviewHtml, safeNextPath, safeOtpType } from "@/lib/crm/entry-link";
import { siteConfig } from "@/lib/site";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ code: string }> };

function originOf() {
  return (process.env.NEXT_PUBLIC_SITE_URL || siteConfig.url).replace(/\/$/, "");
}

function normalizeCode(code: string) {
  const upper = code.trim().toUpperCase();
  return /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/.test(upper) ? upper : "";
}

async function redirectToCallback(code: string) {
  const origin = originOf();
  const safe = normalizeCode(code);
  const admin = createServiceClient();
  const { data } = safe
    ? await admin
        .from("crm_entry_links")
        .select("token_hash, otp_type, next_path")
        .eq("code", safe)
        .maybeSingle()
    : { data: null };

  if (!data?.token_hash) {
    return noStore(NextResponse.redirect(new URL("/connexion?error=auth", origin)));
  }

  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("token_hash", data.token_hash);
  callback.searchParams.set("type", safeOtpType(data.otp_type));
  callback.searchParams.set("next", safeNextPath(data.next_path));
  return noStore(NextResponse.redirect(callback));
}

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(request: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  const url = new URL(request.url);
  if (entryOpenRequested(url.search)) return redirectToCallback(code);
  const origin = originOf();
  return new NextResponse(entryPreviewHtml(origin, normalizeCode(code) || "00000000"), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}

export async function POST(_request: Request, ctx: Ctx) {
  const { code } = await ctx.params;
  return redirectToCallback(code);
}
