import { normalizeWhatsAppDigits, readEnv } from "@/lib/agency/whatsapp";
import { parseLooseDate } from "@/lib/mtrip/quote-lines";

export type ConsigneFields = {
  title?: string | null;
  destination?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  client_phone?: string | null;
  client_email?: string | null;
  notes?: string | null;
};

export type StaffAction =
  | "continue"
  | "ask"
  | "propose_send"
  | "send"
  | "new_draft"
  | "same_trip"
  | "cancel"
  | "help";

export type ColleagueTurn = {
  action: StaffAction;
  awaiting: "contact" | "send_confirm" | "new_or_same" | null;
  consigne: ConsigneFields;
  reply: string | null;
};

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

export function fold(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function extractEmail(text: string) {
  return text.match(EMAIL_RE)?.[0]?.toLowerCase() || null;
}

export function extractPhone(text: string) {
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

export function extractConsigne(text: string): ConsigneFields {
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

export function isYesText(text: string) {
  const f = fold(text);
  return /^(oui|yes|ok|d['']accord|1|vas-y|go)$/.test(f);
}

export function isNoText(text: string) {
  const f = fold(text);
  return /^(non|no|non merci|pas maintenant)\b/.test(f);
}

export function isHelpText(text: string) {
  const f = fold(text);
  return /^(aide|help|\?)$/.test(f) || /^comment (ca|ça) marche/.test(f);
}

export function isCancelText(text: string) {
  const f = fold(text);
  return /^(annule|annuler|laisse tomber|stop|on arrete|on arrête)\b/.test(f);
}

export function isNewTripText(text: string) {
  const f = fold(text);
  return (
    /\b(autre voyage|autre dossier|autre client|nouveau client|nouveau voyage|autre famille)\b/.test(
      f
    ) || /^(on change|on passe a autre chose)\b/.test(f)
  );
}

export function isSameTripText(text: string) {
  const f = fold(text);
  return (
    /^(le meme|c['’]?est le meme|meme voyage|on continue|suite|toujours celui[- ]la)$/.test(
      f
    ) || /\b(le meme dossier|continue sur celui)\b/.test(f)
  );
}

/** Confirmation d’envoi au client — français naturel, pas une commande. */
export function isSendConfirmText(text: string) {
  const f = fold(text);
  if (!f) return false;
  if (
    /^(oui|ok|yes|vas-y|go|nickel|top|c['’]?est bon|c['’]?est parti|envoie|envoie[- ]le|envoie[- ]lui|tu peux envoyer|tu peux y aller)$/.test(
      f
    )
  ) {
    return true;
  }
  return (
    /\b(ok envoie|ok envois|oui envoie|oui vas-y|vas-y envoie|go envoie|envoie au client|envoie l['’]?opt[- ]?in|tu peux envoyer)\b/.test(
      f
    ) && f.length < 80
  );
}

export function colleagueHelpCopy() {
  return [
    "Envoie-moi les passeports et les PDFs / captures, avec 2 phrases : destination, dates, WhatsApp et email du client.",
    "Je crée le voyage, je te fais un récap, tu me dis d’envoyer.",
  ].join("\n");
}

function mergeConsigne(a: ConsigneFields, b: ConsigneFields): ConsigneFields {
  return {
    title: b.title || a.title || null,
    destination: b.destination || a.destination || null,
    start_date: b.start_date || a.start_date || null,
    end_date: b.end_date || a.end_date || null,
    client_phone: b.client_phone || a.client_phone || null,
    client_email: b.client_email || a.client_email || null,
    notes: b.notes || a.notes || null,
  };
}

export type ColleagueContext = {
  staffText: string;
  awaiting: "contact" | "send_confirm" | "new_or_same" | null;
  snapshot: string;
  history: Array<{ role: "staff" | "agent"; text: string }>;
  ingestParts: string[];
  hasPassengers: boolean;
  hasClientPhone: boolean;
  hasMedia: boolean;
};

export function decideStaffAction(input: {
  text: string;
  awaiting: "contact" | "send_confirm" | "new_or_same" | null;
  hasOpenDraftWithData: boolean;
}): StaffAction {
  const text = (input.text || "").trim();
  if (isHelpText(text) && !input.hasOpenDraftWithData) return "help";
  if (isCancelText(text)) return "cancel";
  if (input.awaiting === "new_or_same") {
    if (isSameTripText(text) || isYesText(text)) return "same_trip";
    if (isNewTripText(text) || isNoText(text)) return "new_draft";
    return "continue";
  }
  if (isNewTripText(text) && input.hasOpenDraftWithData) return "new_draft";
  if (input.awaiting === "send_confirm" && isSendConfirmText(text)) return "send";
  if (isSendConfirmText(text) && input.awaiting !== "contact") return "send";
  if (isHelpText(text)) return "help";
  return "continue";
}

export async function runColleagueTurn(
  ctx: ColleagueContext
): Promise<ColleagueTurn | null> {
  const heuristic = extractConsigne(ctx.staffText);
  const key =
    readEnv("AI_GATEWAY_API_KEY") || readEnv("OPENAI_API_KEY");
  if (!key) {
    return {
      action: decideStaffAction({
        text: ctx.staffText,
        awaiting: ctx.awaiting,
        hasOpenDraftWithData: ctx.hasPassengers,
      }),
      awaiting: ctx.awaiting,
      consigne: heuristic,
      reply: null,
    };
  }

  const useGateway = Boolean(readEnv("AI_GATEWAY_API_KEY"));
  const url = useGateway
    ? "https://ai-gateway.vercel.sh/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";
  const model =
    readEnv("WA_OPS_LLM_MODEL") ||
    (useGateway ? "openai/gpt-4.1-mini" : "gpt-4o-mini");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Tu es l’assistant ops WhatsApp de Travel Business Agency. Tu parles à un conseiller agence (tutoiement, phrases courtes, français). Tu n’es PAS un bot à commandes : jamais de menu (nouveau / c'est tout / envoyer).

Réponds JSON :
{"action":"continue|ask|propose_send|send|new_draft|same_trip|cancel|help","awaiting":"contact|send_confirm|new_or_same"|null,"title":string|null,"destination":string|null,"start_date":"YYYY-MM-DD"|null,"end_date":"YYYY-MM-DD"|null,"client_phone":string|null,"client_email":string|null,"notes":string|null,"reply":string}

Règles :
- reply = message WhatsApp au conseiller, max 8 lignes, sans markdown.
- UNE question max. WhatsApp client obligatoire pour envoyer. Email utile pour le dossier.
- propose_send si passagers + WhatsApp : récap court + « Je peux envoyer à {prénom} ? »
- send seulement si le conseiller vient de confirmer l’envoi (ok, oui, vas-y, envoie…).
- ask si un trou bloquant (surtout WhatsApp).
- new_draft si autre voyage / autre client. same_trip si on continue le dossier ouvert.
- help : 2-3 phrases sur le geste (pièces + 2 phrases), pas de liste de commandes.
- Téléphone en chiffres internationaux sans +. Dates ISO.`,
          },
          {
            role: "user",
            content: JSON.stringify({
              awaiting: ctx.awaiting,
              snapshot: ctx.snapshot,
              ingest: ctx.ingestParts,
              hasPassengers: ctx.hasPassengers,
              hasClientPhone: ctx.hasClientPhone,
              hasMedia: ctx.hasMedia,
              history: ctx.history.slice(-6),
              staff: ctx.staffText.slice(0, 2000),
            }),
          },
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
    const actionRaw = String(parsed.action || "continue") as StaffAction;
    const allowed: StaffAction[] = [
      "continue",
      "ask",
      "propose_send",
      "send",
      "new_draft",
      "same_trip",
      "cancel",
      "help",
    ];
    const awaitingRaw = parsed.awaiting;
    const awaiting =
      awaitingRaw === "contact" ||
      awaitingRaw === "send_confirm" ||
      awaitingRaw === "new_or_same"
        ? awaitingRaw
        : null;
    const llmConsigne: ConsigneFields = {
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
    };
    return {
      action: allowed.includes(actionRaw) ? actionRaw : "continue",
      awaiting,
      consigne: mergeConsigne(heuristic, llmConsigne),
      reply: typeof parsed.reply === "string" ? parsed.reply.trim() : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
