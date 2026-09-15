import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getPublicSiteUrl } from "@/lib/agency/quote-link";

type ShortLinks = {
  short_code?: string | null;
  quote_token?: string | null;
  traveler_view_url?: string | null;
  title?: string | null;
};

function anonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export async function resolveShortLinks(
  code: string
): Promise<ShortLinks | null> {
  const trimmed = code.trim().toLowerCase();
  if (trimmed.length < 6) return null;
  const supabase = anonClient();
  const { data, error } = await supabase.rpc("get_public_voyage_short_links", {
    p_code: trimmed,
  });
  if (error || !data || typeof data !== "object") return null;
  return data as ShortLinks;
}

export async function redirectExpense(code: string) {
  const links = await resolveShortLinks(code);
  const token = links?.quote_token || links?.short_code;
  if (!token) {
    return NextResponse.redirect(`${getPublicSiteUrl()}/`);
  }
  return NextResponse.redirect(`${getPublicSiteUrl()}/devis/${token}`);
}

export async function redirectTravelerView(code: string) {
  const links = await resolveShortLinks(code);
  const url = links?.traveler_view_url?.trim();
  if (!url) {
    return new NextResponse(
      "Traveler View pas encore disponible — publiez d’abord le voyage mTrip.",
      { status: 404 }
    );
  }
  return NextResponse.redirect(url);
}
