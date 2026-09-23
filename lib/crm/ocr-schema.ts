import { z } from "zod";

// OpenAI structured outputs require every property in `required`.
// Use `.nullable()` (not `.optional()`) so keys are present and may be null.
const nullableString = z.string().nullable();

export const identityExtractSchema = z.object({
  doc_type: nullableString,
  number: nullableString,
  issuing_country: nullableString,
  issued_on: nullableString,
  expires_on: nullableString,
  first_name: nullableString,
  last_name: nullableString,
  usage_name: nullableString,
  birth_date: nullableString,
  place_of_birth: nullableString,
  nationality: nullableString,
  sex: nullableString,
  authority: nullableString,
  personal_number: nullableString,
  mrz_text: nullableString,
});

/** Un PDF / une photo peut contenir plusieurs passeports : un objet par personne. */
export const identitiesExtractSchema = z.object({
  identities: z.array(identityExtractSchema),
});
