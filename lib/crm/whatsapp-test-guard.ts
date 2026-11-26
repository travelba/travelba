/**
 * Garde-fou : un test du Concierge ne vise jamais un vrai fil client.
 *
 * Autorisé :
 * - le numéro fictif des suites (`+33601020304`) ;
 * - un numéro listé dans `CONCIERGE_TEST_PHONES` (séparés par des virgules) ;
 * - un dossier ou une fiche déjà marqués `is_test` (`crm_bookings.is_test`, `crm_customers.is_test`).
 *
 * Un numéro de production est refusé avant la simulation. Ces tests n’appellent pas Twilio
 * et n’écrivent pas sur un fil réel. Rejouer un fil client exige une copie, pas le téléphone du client.
 */

export const CONCIERGE_FIXTURE_PHONE = "+33601020304";

export function conciergeTestPhones(env: Record<string, string | undefined> = process.env) {
  const extra = (env.CONCIERGE_TEST_PHONES || "")
    .split(",")
    .map((phone) => phone.trim())
    .filter(Boolean);
  return [CONCIERGE_FIXTURE_PHONE, ...extra];
}

export function conciergeTestTargetAllowed(input: {
  phone?: string | null;
  isTest?: boolean | null;
  env?: Record<string, string | undefined>;
}) {
  if (input.isTest === true) return true;
  const phone = (input.phone || "").replace(/\s/g, "");
  if (!phone) return false;
  return conciergeTestPhones(input.env).includes(phone);
}

export const CONCIERGE_TEST_REFUSAL =
  "Ce fil n’est pas un dossier de test. Le Concierge n’écrit pas sur un vrai fil client depuis un test.";
