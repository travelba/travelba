import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { safeFileName, uploadCrmFile } from "@/lib/crm/files";
import { assignVisaHolders, type VisaCountry } from "@/lib/crm/visa-assign";
import { readVisaHolders } from "@/lib/crm/visa-read";
import { insertTravelDocument } from "@/lib/crm/travel-document-write";
import type { CrmBookingTraveler } from "@/lib/crm/types";

const MAX_FILES = 15;

export async function saveVisaUploads(
  supabase: SupabaseClient,
  input: {
    customerId: string;
    bookingId: string;
    travelers: CrmBookingTraveler[];
    countries: VisaCountry[];
    files: File[];
  }
) {
  const files = input.files.filter((file) => file.size > 0).slice(0, MAX_FILES);
  if (!files.length) throw new Error("Ajoutez au moins un visa.");
  const errors: string[] = [];
  let saved = 0;
  for (const file of files) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const holders = await readVisaHolders(
        { bytes, type: file.type, name: file.name },
        input.travelers,
        input.countries
      );
      const result = assignVisaHolders(holders, input.travelers, input.countries);
      errors.push(...result.errors);
      if (!result.assigned.length) continue;
      const storagePath = `customers/${input.customerId}/documents/${Date.now()}-${safeFileName(file.name)}`;
      await uploadCrmFile(storagePath, Buffer.from(bytes), file.type || "application/octet-stream");
      for (const visa of result.assigned) {
        await insertTravelDocument(supabase, {
          customerId: input.customerId,
          bookingId: input.bookingId,
          travelerId: visa.travelerId,
          companionId: visa.companionId,
          docType: "visa",
          issuingCountry: visa.country,
          number: visa.number,
          expiresOn: visa.expires_on,
          first_name: visa.first_name,
          last_name: visa.last_name,
          usage_name: visa.usage_name,
          storagePath,
          fileName: file.name,
          mimeType: file.type,
          replacePrevious: false,
        });
        saved += 1;
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "Envoi impossible");
    }
  }
  return { saved, errors };
}
