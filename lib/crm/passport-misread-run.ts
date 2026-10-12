import "server-only";

import { productionOnlySecret } from "./preview-secrets";
import { misreadPrompt, type MisreadSymptom } from "./passport-misread";

const ENDPOINT = "https://api.cursor.com/v1/agents";
const REPO = "https://github.com/travelba/travelba";

export function cursorAgentKey() {
  return productionOnlySecret(process.env.CURSOR_API_KEY);
}

/**
 * Ouvre un agent Cloud sur main. Le prompt ne contient que la forme de l’erreur.
 * Pas d’image. La pull request reste à relire.
 */
export async function createPassportFixAgent(input: {
  symptom: MisreadSymptom;
  note: string | null;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true; agentId: string } | { ok: false; reason: "missing_key" | "failed" }> {
  const apiKey = input.apiKey === undefined ? cursorAgentKey() : input.apiKey.trim();
  if (!apiKey) return { ok: false, reason: "missing_key" };
  const fetchImpl = input.fetchImpl || fetch;
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
      },
      body: JSON.stringify({
        prompt: { text: misreadPrompt(input.symptom, input.note) },
        repos: [{ url: REPO, startingRef: "main" }],
        autoCreatePR: true,
        skipReviewerRequest: true,
      }),
    });
    if (!res.ok) {
      console.error("[passport-misread] cursor", res.status);
      return { ok: false, reason: "failed" };
    }
    const payload = (await res.json()) as { agent?: { id?: unknown } };
    const agentId = typeof payload.agent?.id === "string" ? payload.agent.id : "";
    if (!agentId.startsWith("bc-")) return { ok: false, reason: "failed" };
    return { ok: true, agentId };
  } catch {
    console.error("[passport-misread] cursor injoignable");
    return { ok: false, reason: "failed" };
  }
}
