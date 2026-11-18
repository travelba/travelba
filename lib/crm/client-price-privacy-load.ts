import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";

function missingColumn(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  return /hide_client_prices/i.test(error.message || "") && /column|schema/i.test(error.message || "");
}

/** Lecture agence du drapeau. Colonne absente : prix montrés, comme le défaut. */
export async function hiddenPriceCustomerIds(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Set<string>();
  try {
    const admin = createServiceClient();
    const { data, error } = await admin.from("crm_customers").select("id, hide_client_prices").in("id", unique);
    if (error) {
      if (!missingColumn(error)) console.error("[crm] hide_client_prices", error.code ?? "?");
      return new Set<string>();
    }
    return new Set(
      ((data || []) as { id: string; hide_client_prices?: boolean | null }[])
        .filter((row) => row.hide_client_prices === true)
        .map((row) => row.id)
    );
  } catch {
    return new Set<string>();
  }
}

export async function customerHidesPrices(customerId: string) {
  const ids = await hiddenPriceCustomerIds([customerId]);
  return ids.has(customerId);
}
