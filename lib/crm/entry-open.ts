import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { entryPreviewHtml, isEntryCode, safeNextPath, safeOtpType } from "./entry-link";

export function entryPreviewResponse(origin: string, code: string) {
  const safe = isEntryCode(code) ? code : "00000000";
  return new NextResponse(entryPreviewHtml(origin, safe), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
      Vary: "User-Agent",
    },
  });
}

export async function redirectEntryToCallback(origin: string, code: string) {
  const safe = isEntryCode(code) ? code : "";
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
