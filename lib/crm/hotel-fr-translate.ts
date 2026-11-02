import "server-only";

import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { aiGatewayConfigured, openaiApiKey } from "./ingest-types";
import { hotelTextNeedsModel, rememberHotelFrench } from "./hotel-fr";

const LIMIT = 8;

function model() {
  const key = openaiApiKey();
  if (key) return createOpenAI({ apiKey: key })("gpt-4o-mini");
  return "openai/gpt-4o-mini";
}

/** Traduit les paragraphes encore en anglais. Le résultat reste en mémoire le temps du processus. */
export async function warmHotelFrench(lines: string[]) {
  const pending = [...new Set(lines.map((line) => line.replace(/\s+/g, " ").trim()).filter(hotelTextNeedsModel))].slice(0, LIMIT);
  if (!pending.length || !aiGatewayConfigured()) return;
  const numbered = pending.map((line, index) => `${index + 1}. ${line.slice(0, 700)}`).join("\n");
  try {
    const result = await generateText({
      model: model(),
      abortSignal: AbortSignal.timeout(2500),
      prompt: `Traduis ces textes d’hôtel en français de conciergerie, une ligne par entrée, même ordre.
Fidèle : n’ajoute aucun horaire, aucun avantage, aucun prix. Garde les noms propres.
Pas de marque de plateforme. Réponds uniquement par un JSON : {"lines":["..."]}.
${numbered}`,
    });
    const match = result.text.match(/\{[\s\S]*\}/);
    if (!match) return;
    const parsed = JSON.parse(match[0]) as { lines?: unknown[] };
    if (!Array.isArray(parsed.lines)) return;
    pending.forEach((source, index) => {
      const french = parsed.lines?.[index];
      if (typeof french === "string") rememberHotelFrench(source, french);
    });
  } catch {
    // Le glossaire suffit si le modèle ne répond pas.
  }
}
