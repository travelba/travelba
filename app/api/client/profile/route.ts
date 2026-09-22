import { NextResponse } from "next/server";
import { jsonError, requireCustomer } from "@/lib/crm/auth";
import { readBillingPatch } from "@/lib/crm/entreprises";
import { resolveCountryCode } from "@/lib/crm/countries";
import { emptyToNull } from "@/lib/crm/identity";
import { toE164 } from "@/lib/crm/phone";

function normalizePhone(value: unknown) {
  const raw = emptyToNull(value);
  if (!raw) return null;
  const e164 = toE164(raw, "FR");
  if (!e164) throw new Error("Numéro de téléphone invalide");
  return e164;
}

export async function PATCH(request: Request) {
  const auth = await requireCustomer();
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  try {
    for (const key of [
      "first_name",
      "last_name",
      "phone",
      "whatsapp",
      "birth_date",
      "sex",
      "nationality",
      "address_line",
      "postal_code",
      "city",
      "country",
    ]) {
      if (!(key in body)) continue;
      if (key === "phone" || key === "whatsapp") {
        patch[key] = normalizePhone(body[key]);
        continue;
      }
      if (key === "nationality" || key === "country") {
        patch[key] = resolveCountryCode(String(body[key] || "")) || emptyToNull(body[key]);
        continue;
      }
      if (key === "sex") {
        const sex = emptyToNull(body[key]);
        patch[key] = sex && ["M", "F", "X"].includes(sex) ? sex : null;
        continue;
      }
      patch[key] = emptyToNull(body[key]);
    }
    Object.assign(patch, readBillingPatch(body));
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Données invalides");
  }
  const { data, error } = await auth.supabase
    .from("crm_customers")
    .update(patch)
    .eq("id", auth.customer.id)
    .select("*")
    .single();
  if (error) return jsonError(error.message, 400);
  return NextResponse.json({ customer: data });
}
