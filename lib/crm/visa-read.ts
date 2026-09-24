import "server-only";
import { generateText, Output, APICallError } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import {
  holdersFromVisaText,
  type VisaCountry,
  type VisaHolder,
} from "@/lib/crm/visa-assign";
import { aiGatewayConfigured, isAllowedIngestType, isPdfFile, openaiApiKey } from "@/lib/crm/ingest-types";
import { inspectPdf, pdfPlainText, type RasterPage } from "@/lib/crm/pdf-raster";
import type { CrmBookingTraveler } from "@/lib/crm/types";

const MAX_BYTES = 15 * 1024 * 1024;
const nullable = z.string().nullable();
const visaHoldersSchema = z.object({
  holders: z.array(
    z.object({
      first_name: nullable,
      last_name: nullable,
      usage_name: nullable,
      country: nullable,
      number: nullable,
      expires_on: nullable,
    })
  ),
});

const PROMPT = `Tu lis un visa, une autorisation électronique (ESTA, ETA, AVE, e-visa) ou un e-mail qui en contient plusieurs.
Un objet par personne. Ne jamais inventer : null si absent.
first_name : tous les prénoms, dans l’ordre.
last_name : nom de famille.
usage_name : nom d’usage s’il est distinct, sinon null.
country : pays du visa ou de l’autorisation, code ISO 2 (US, GB, IN). Pas la nationalité du passeport.
number : numéro du visa s’il est imprimé.
expires_on : date de fin YYYY-MM-DD, ou null.`;

function visaModel() {
  const key = openaiApiKey();
  if (key) return createOpenAI({ apiKey: key })("gpt-4o");
  return "openai/gpt-4o";
}

async function holdersFromVision(pages: RasterPage[]): Promise<VisaHolder[]> {
  if (!aiGatewayConfigured() && !openaiApiKey()) return [];
  const key = openaiApiKey();
  const useGateway = !key;
  const result = await generateText({
    model: useGateway ? "openai/gpt-4o" : visaModel(),
    output: Output.object({ schema: visaHoldersSchema, name: "visa_holders" }),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPT },
          ...pages.map((page) => ({
            type: "image" as const,
            image: page.image,
            mediaType: page.mediaType,
          })),
        ],
      },
    ],
    ...(useGateway
      ? {
          providerOptions: {
            gateway: { tags: ["feature:visa-scan"], models: ["google/gemini-2.5-flash"] },
          },
        }
      : {}),
  });
  return (result.output?.holders || []).filter((row) => row.first_name || row.last_name || row.country);
}

export async function readVisaHolders(
  file: { bytes: Uint8Array; type: string; name: string },
  travelers: CrmBookingTraveler[],
  countries: VisaCountry[]
): Promise<VisaHolder[]> {
  if (file.bytes.byteLength > MAX_BYTES) throw new Error("Fichier trop lourd (15 Mo maximum).");
  if (!isAllowedIngestType(file.type, file.name)) {
    throw new Error("Formats acceptés : PDF, JPEG, PNG.");
  }
  const bytes = file.bytes;
  if (isPdfFile(file.type, file.name)) {
    const { text } = await pdfPlainText(bytes);
    const fromText = holdersFromVisaText(text, travelers, countries);
    if (fromText.length) return fromText;
  }
  let pages: RasterPage[] = [];
  try {
    if (isPdfFile(file.type, file.name)) {
      pages = (await inspectPdf(bytes, 4)).rasters;
    } else {
      pages = [{ image: bytes, mediaType: (file.type || "image/jpeg") as RasterPage["mediaType"] }];
    }
  } catch {
    return [];
  }
  if (!pages.length) return [];
  try {
    return await holdersFromVision(pages);
  } catch (err) {
    if (APICallError.isInstance(err) && openaiApiKey()) {
      return [];
    }
    console.error("[visa-read]", err instanceof Error ? err.message : "échec");
    return [];
  }
}
