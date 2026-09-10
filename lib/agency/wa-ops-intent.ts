import { normalizeWhatsAppDigits } from "@/lib/agency/whatsapp";
import { parseLooseDate } from "@/lib/mtrip/quote-lines";

export type OpsIntent =
  | "nouveau"
  | "annuler"
  | "lien"
  | "recap"
  | "envoyer"
  | "oui"
  | "non"
  | "aide"
  | "consigne"
  | "ignore";

export type ConsigneFields = {
  title?: string | null;
  destination?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  client_phone?: string | null;
  client_email?: string | null;
  notes?: string | null;
};

export type ParsedOpsMessage = {
  intent: OpsIntent;
  consigne: ConsigneFields;
  source: "heuristic" | "llm";
};

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function fold(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function extractEmail(text: string) {
  return text.match(EMAIL_RE)?.[0]?.toLowerCase() || null;
}

function extractPhone(text: string) {
  const compact = text.replace(/[().\s-]/g, " ");
  const candidates = compact.match(
    /(?:\+|00)?(?:33|32|41|44|1)?[0-9]{8,12}/g
  );
  if (!candidates) {
    const local = text.match(/\b0[1-9](?:[\s.-]?\d{2}){4}\b/);
    return local ? normalizeWhatsAppDigits(local[0]) : null;
  }
  for (const c of candidates) {
    const digits = normalizeWhatsAppDigits(c);
    if (digits && digits.length >= 10) return digits;
  }
  return normalizeWhatsAppDigits(candidates[0]);
}

function extractDates(text: string): { start: string | null; end: string | null } {
  const year = new Date().getFullYear();
  const isoRange = text.match(
    /(\d{4}-\d{2}-\d{2})\s*(?:au|a|–|-|→)\s*(\d{4}-\d{2}-\d{2})/i
  );
  if (isoRange) return { start: isoRange[1], end: isoRange[2] };

  const slash = text.match(
    /(\d{1,2}[\/.]\d{1,2}(?:[\/.]\d{2,4})?)\s*(?:au|a|–|-)\s*(\d{1,2}[\/.]\d{1,2}(?:[\/.]\d{2,4})?)/i
  );
  if (slash) {
    return {
      start: parseLooseDate(slash[1], year),
      end: parseLooseDate(slash[2], year),
    };
  }

  const fr = text.match(
    /(\d{1,2})\s*(?:au|a|–|-)\s*(\d{1,2})\s+(janv(?:ier)?|fev(?:rier)?|fév(?:rier)?|mars|avr(?:il)?|mai|juin|juil(?:let)?|ao[uû]t|aout|sept(?:embre)?|oct(?:obre)?|nov(?:embre)?|déc(?:embre)?|dec(?:embre)?)/i
  );
  if (fr) {
    return {
      start: parseLooseDate(`${fr[1]} ${fr[3]} ${year}`, year),
      end: parseLooseDate(`${fr[2]} ${fr[3]} ${year}`, year),
    };
  }

  const single = parseLooseDate(text, year);
  return { start: single, end: null };
}

function heuristicIntent(text: string, buttonPayload: string | null): OpsIntent {
  const raw = fold([buttonPayload, text].filter(Boolean).join(" "));
  if (!raw) return "ignore";

  if (/^(aide|help|\?)$/.test(raw) || /^commandes\b/.test(raw)) return "aide";
  if (/^(nouveau|new|reset)\b/.test(raw) || /\bnouveau voyage\b/.test(raw))
    return "nouveau";
  if (/^(annuler|cancel|stop)\b/.test(raw)) return "annuler";
  if (/^(lien|crm|dossier admin)\b/.test(raw)) return "lien";
  if (
    /^(c['’]?est tout|cest tout|recap|recapitule|resume|bilan)\b/.test(raw)
  )
    return "recap";
  if (/^(envoyer|envoie|send|publie|publier)\b/.test(raw)) return "envoyer";
  if (/^(oui|yes|ok|d['']accord)$/.test(raw)) return "oui";
  if (/^(non|no|non merci)\b/.test(raw)) return "non";
  return "consigne";
}

function heuristicConsigne(text: string): ConsigneFields {
  const email = extractEmail(text);
  const phone = extractPhone(text);
  const { start, end } = extractDates(text);
  let notes = text;
  if (email) notes = notes.replace(EMAIL_RE, "").trim();
  const titleGuess = text
    .split(/[\n,;]/)[0]
    ?.replace(EMAIL_RE, "")
    .replace(/\+?\d[\d\s.-]{7,}/g, "")
    .trim();
  const title =
    titleGuess && titleGuess.length >= 4 && titleGuess.length <= 80
      ? titleGuess
      : null;

  return {
    title,
    destination: title,
    start_date: start,
    end_date: end,
    client_phone: phone,
    client_email: email,
    notes: notes.slice(0, 500) || null,
  };
}

async function llmParse(text: string): Promise<ParsedOpsMessage | null> {
  const key =
    (process.env.AI_GATEWAY_API_KEY || "").trim() ||
    (process.env.OPENAI_API_KEY || "").trim();
  if (!key) return null;

  const useGateway = Boolean((process.env.AI_GATEWAY_API_KEY || "").trim());
  const url = useGateway
    ? "https://ai-gateway.vercel.sh/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";
  const model =
    (process.env.WA_OPS_LLM_MODEL || "").trim() ||
    (useGateway ? "openai/gpt-4.1-mini" : "gpt-4o-mini");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'Tu parses des messages staff d’une agence de voyage FR. Réponds JSON : {"intent":"nouveau|annuler|lien|recap|envoyer|oui|non|aide|consigne|ignore","title":string|null,"destination":string|null,"start_date":"YYYY-MM-DD"|null,"end_date":"YYYY-MM-DD"|null,"client_phone":string|null,"client_email":string|null,"notes":string|null}. intent=consigne si le texte décrit un voyage (destination, dates, contact). Dates ISO. Téléphone en chiffres internationaux sans +.',
          },
          { role: "user", content: text.slice(0, 2000) },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const intent = String(parsed.intent || "consigne") as OpsIntent;
    const allowed: OpsIntent[] = [
      "nouveau",
      "annuler",
      "lien",
      "recap",
      "envoyer",
      "oui",
      "non",
      "aide",
      "consigne",
      "ignore",
    ];
    return {
      intent: allowed.includes(intent) ? intent : "consigne",
      consigne: {
        title: typeof parsed.title === "string" ? parsed.title : null,
        destination:
          typeof parsed.destination === "string" ? parsed.destination : null,
        start_date:
          typeof parsed.start_date === "string" ? parsed.start_date : null,
        end_date: typeof parsed.end_date === "string" ? parsed.end_date : null,
        client_phone: normalizeWhatsAppDigits(
          typeof parsed.client_phone === "string" ? parsed.client_phone : ""
        ),
        client_email:
          typeof parsed.client_email === "string"
            ? parsed.client_email.toLowerCase()
            : null,
        notes: typeof parsed.notes === "string" ? parsed.notes : null,
      },
      source: "llm",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function parseOpsMessage(input: {
  body: string;
  buttonPayload?: string | null;
}): Promise<ParsedOpsMessage> {
  const text = (input.body || "").trim();
  const heuristic = heuristicIntent(text, input.buttonPayload || null);
  const consigne = heuristicConsigne(text);

  if (heuristic !== "consigne") {
    return { intent: heuristic, consigne, source: "heuristic" };
  }

  if (text.length >= 12) {
    const llm = await llmParse(text);
    if (llm) {
      return {
        intent: llm.intent === "ignore" ? "consigne" : llm.intent,
        consigne: {
          title: llm.consigne.title || consigne.title,
          destination: llm.consigne.destination || consigne.destination,
          start_date: llm.consigne.start_date || consigne.start_date,
          end_date: llm.consigne.end_date || consigne.end_date,
          client_phone: llm.consigne.client_phone || consigne.client_phone,
          client_email: llm.consigne.client_email || consigne.client_email,
          notes: llm.consigne.notes || consigne.notes,
        },
        source: "llm",
      };
    }
  }

  return { intent: "consigne", consigne, source: "heuristic" };
}

export function isYesText(text: string) {
  const f = fold(text);
  return /^(oui|yes|ok|d['']accord|1)$/.test(f);
}

export function isNoText(text: string) {
  const f = fold(text);
  return /^(non|no|non merci|pas maintenant)\b/.test(f);
}
