import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgencyClient } from "@/lib/agency/types";
import type { MtripGuidePassenger } from "@/lib/mtrip/guide-types";

function normPassport(n?: string | null) {
  return (n || "").replace(/\s/g, "").toUpperCase() || null;
}

function leadPassenger(passengers: MtripGuidePassenger[]) {
  return (
    passengers.find((p) => p.role === "lead_traveler") || passengers[0] || null
  );
}

export type ClientAddress = {
  address_line?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
};

/**
 * Crée ou réutilise un compte client à partir du voyageur principal.
 * Matching : n° passeport → email → téléphone.
 */
export async function upsertClientFromLead(
  supabase: SupabaseClient,
  userId: string,
  passengers: MtripGuidePassenger[],
  address?: ClientAddress
): Promise<AgencyClient | null> {
  const lead = leadPassenger(passengers);
  if (!lead?.first_name?.trim() && !lead?.last_name?.trim()) return null;

  const name = `${lead.first_name || ""} ${lead.last_name || ""}`.trim();
  const passport = normPassport(lead.passport_number);
  const email = lead.email?.trim() || null;
  const phone = lead.phone?.trim() || null;
  const whatsapp = phone;

  let existing: AgencyClient | null = null;

  if (passport) {
    const { data } = await supabase
      .from("agency_clients")
      .select("*")
      .eq("user_id", userId)
      .eq("passport_number", passport)
      .maybeSingle();
    if (data) existing = data as AgencyClient;
  }

  if (!existing && email) {
    const { data } = await supabase
      .from("agency_clients")
      .select("*")
      .eq("user_id", userId)
      .ilike("email", email)
      .maybeSingle();
    if (data) existing = data as AgencyClient;
  }

  if (!existing && phone) {
    const digits = phone.replace(/\D/g, "");
    if (digits.length >= 8) {
      const { data } = await supabase
        .from("agency_clients")
        .select("*")
        .eq("user_id", userId)
        .or(`phone.ilike.%${digits.slice(-9)}%,whatsapp.ilike.%${digits.slice(-9)}%`)
        .limit(1)
        .maybeSingle();
      if (data) existing = data as AgencyClient;
    }
  }

  const payload = {
    name,
    email,
    phone,
    whatsapp,
    passport_number: passport,
    address_line: address?.address_line ?? existing?.address_line ?? null,
    postal_code: address?.postal_code ?? existing?.postal_code ?? null,
    city: address?.city ?? existing?.city ?? null,
    country: address?.country ?? existing?.country ?? null,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { data, error } = await supabase
      .from("agency_clients")
      .update({
        ...payload,
        // Ne pas écraser un contact existant avec du vide
        email: email || existing.email,
        phone: phone || existing.phone,
        whatsapp: whatsapp || existing.whatsapp,
        passport_number: passport || existing.passport_number,
      })
      .eq("id", existing.id)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as AgencyClient;
  }

  const { data, error } = await supabase
    .from("agency_clients")
    .insert({
      user_id: userId,
      ...payload,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as AgencyClient;
}

export { leadPassenger };
