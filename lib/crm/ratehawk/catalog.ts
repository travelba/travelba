/** Hôtels de certification bac à sable. Toujours proposés, même avant le premier dump. */
export const CERTIFICATION_HOTELS = [
  {
    hid: 10004834,
    name: "Conrad Los Angeles",
    region_id: 2011,
    region_name: "Los Angeles",
    country_code: "US",
  },
  {
    hid: 8819557,
    name: "Rosa Bell Motel - Los Angeles",
    region_id: 2011,
    region_name: "Los Angeles",
    country_code: "US",
  },
] as const;

export const CERTIFICATION_REGION = {
  id: 2011,
  name: "Los Angeles",
  name_fr: "Los Angeles",
  country_code: "US",
  country_name: "États-Unis",
  type: "City",
} as const;

export const SANDBOX_ORDER_SUFFIXES = ["unknown_success", "unknown_soldout", "unknown_book_limit"] as const;

export type SandboxOrderSuffix = (typeof SANDBOX_ORDER_SUFFIXES)[number];

export function isSandboxOrderSuffix(value: string | null | undefined): value is SandboxOrderSuffix {
  return SANDBOX_ORDER_SUFFIXES.includes(value as SandboxOrderSuffix);
}

/** Le suffixe de scénario reste collé à l’identifiant quand on le régénère. */
export function sandboxSuffixOf(partnerOrderId: string | null | undefined): SandboxOrderSuffix | null {
  if (!partnerOrderId) return null;
  return SANDBOX_ORDER_SUFFIXES.find((suffix) => partnerOrderId.endsWith(suffix)) ?? null;
}
