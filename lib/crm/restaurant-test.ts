/** Seul Benjamin peut ouvrir le mode test. Le numéro du client n’est jamais utilisé. */
export const RESTAURANT_TEST_OPERATOR = "benjamin@travelba.fr";

export const RESTAURANT_TEST_EMAIL = "test-benjamin@travelba.invalid";

export const RESTAURANT_TEST_REFERENCE = "TEST-BENJAMIN";

export const RESTAURANT_TEST_COOKIE = "tba_restaurant_test";

export function restaurantTestOperator(email: string | null | undefined) {
  return (email || "").trim().toLowerCase() === RESTAURANT_TEST_OPERATOR;
}

export function restaurantTestPhoneFrom(raw: string | null | undefined) {
  const text = (raw || "").trim();
  if (!text) return null;
  const digits = text.replace(/[^\d+]/g, "");
  if (digits.replace(/\D/g, "").length < 8 || digits.replace(/\D/g, "").length > 15) return null;
  return digits.startsWith("+") ? digits : `+${digits}`;
}

export function restaurantTestPhone() {
  return restaurantTestPhoneFrom(process.env.RESTAURANT_TEST_PHONE);
}

/**
 * En mode test, le destinataire est toujours le numéro de test.
 * Sans ce numéro, rien ne part. Le téléphone du client n’est pas un repli.
 */
export function outboundRestaurantPhone(input: { test: boolean; clientPhone: string | null; testPhone: string | null }) {
  if (input.test) return input.testPhone;
  return input.clientPhone;
}
