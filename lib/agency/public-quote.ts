import { createClient } from "@supabase/supabase-js";
import type { QuoteLine } from "@/lib/mtrip/guide-types";
import { siteConfig } from "@/lib/site";

export type PublicVoyageQuote = {
  title: string;
  start_date: string | null;
  end_date: string | null;
  quote_lines: QuoteLine[];
  updated_at: string;
  client_first_name: string | null;
  client_last_name: string | null;
  agency: string;
};

function anonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export async function fetchPublicVoyageQuote(
  token: string
): Promise<PublicVoyageQuote | null> {
  const supabase = anonClient();
  const { data, error } = await supabase.rpc("get_public_voyage_quote", {
    p_token: token,
  });
  if (error) {
    console.warn("[devis] rpc error", error.message);
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  return {
    title: String(row.title || "Voyage"),
    start_date: (row.start_date as string) || null,
    end_date: (row.end_date as string) || null,
    quote_lines: Array.isArray(row.quote_lines)
      ? (row.quote_lines as QuoteLine[])
      : [],
    updated_at: String(row.updated_at || new Date().toISOString()),
    client_first_name: (row.client_first_name as string) || null,
    client_last_name: (row.client_last_name as string) || null,
    agency: String(row.agency || siteConfig.name),
  };
}

export function sumQuoteLines(lines: QuoteLine[]) {
  const byCurrency = new Map<string, number>();
  for (const line of lines) {
    if (typeof line.amount !== "number" || !(line.amount > 0)) continue;
    const cur = line.currency || "EUR";
    byCurrency.set(cur, (byCurrency.get(cur) || 0) + line.amount);
  }
  return byCurrency;
}

export const KIND_LABELS: Record<QuoteLine["kind"], string> = {
  flight: "Vol",
  hotel: "Hôtel",
  transfer: "Transfert",
  other: "Autre",
};
