import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureQuoteToken, ensureShortCode } from "@/lib/agency/quote-link";
import type { AgencyMtripGuide } from "@/lib/mtrip/guide-types";

export async function createDraftGuide(
  supabase: SupabaseClient,
  userId: string,
  opts?: {
    title?: string;
    start_date?: string | null;
    end_date?: string | null;
  }
): Promise<AgencyMtripGuide> {
  const { data, error } = await supabase
    .from("agency_mtrip_guides")
    .insert({
      user_id: userId,
      title: opts?.title?.trim() || "Nouveau voyage",
      dossier_id: null,
      start_date: opts?.start_date || null,
      end_date: opts?.end_date || null,
      passengers: [],
      status: "draft",
      mtrip_account_id: Number(process.env.MTRIP_ACCOUNT_ID || 66582),
      quote_lines: [],
      passport_files: [],
      documents: [],
      extraction: {},
      sends: [],
      quote_token: ensureQuoteToken(),
      short_code: ensureShortCode(),
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Création du voyage impossible");
  }
  return data as AgencyMtripGuide;
}

export async function loadGuideForUser(
  supabase: SupabaseClient,
  userId: string,
  guideId: string
): Promise<AgencyMtripGuide | null> {
  const { data, error } = await supabase
    .from("agency_mtrip_guides")
    .select("*")
    .eq("id", guideId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as AgencyMtripGuide) || null;
}
