import { withConciergeSignature } from "@/lib/crm/whatsapp";
import type { ReplyLang } from "@/lib/crm/whatsapp-concierge";
import { messageLanguage } from "@/lib/crm/whatsapp-concierge";
import { renderConciergeTemplate, templateDestination, type StayPhraseInput } from "@/lib/crm/concierge-templates";
import { priceAccommodation } from "@/lib/crm/concierge-pricing";
import { searchSuppliers, type SearchMode, type StayHit } from "@/lib/crm/concierge-search";
import type { HotelDirectoryEntry } from "@/lib/crm/hotel-catalog";

export type BriefStage = "destination" | "dates" | "travellers" | "budget" | "wishes" | "ready";

export type TripBrief = {
  phone: string;
  destination: string | null;
  start: string | null;
  end: string | null;
  travellers: number | null;
  budget: string | null;
  wishes: string | null;
  stage: BriefStage;
};

export type QuoteLine = {
  title: string;
  kind: StayHit["kind"];
  net: number | null;
  sell: number | null;
  currency: string;
  simulated: boolean;
  note: string;
};

export type ProposalDraft = {
  kind: "quote" | "payment" | "transfer" | "restaurant" | "help";
  draftBody: string;
  amounts: { currency: string; net: number | null; sell: number | null; lines: QuoteLine[] };
  simulated: boolean;
};

export type PlannedFollowup = {
  kind: "silence_session" | "silence_template" | "predeparture" | "checkin" | "feedback";
  channel: "session" | "template";
  templateKey: string | null;
  dueAt: string;
  body: string;
};

const MONTHS: Record<string, number> = {
  janvier: 1,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function iso(year: number, month: number, day: number) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function emptyBrief(phone: string): TripBrief {
  return {
    phone,
    destination: null,
    start: null,
    end: null,
    travellers: null,
    budget: null,
    wishes: null,
    stage: "destination",
  };
}

export function parseTripDates(message: string, now = new Date()) {
  const text = fold(message);
  const range = text.match(
    /\b(?:du\s+)?(\d{1,2})\s+(?:au\s+)?(\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre|january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?/
  );
  if (!range) return null;
  const year = range[4] ? Number(range[4]) : now.getUTCFullYear();
  const month = MONTHS[range[3]];
  const start = iso(year, month, Number(range[1]));
  const end = iso(year, month, Number(range[2]));
  if (!start || !end || end < start) return null;
  return { start, end };
}

export function parseTravellers(message: string) {
  const match = fold(message).match(/(\d{1,2})\s*(voyageurs|personnes|adultes|people|guests|travellers)/);
  if (!match) return null;
  const count = Number(match[1]);
  if (count < 1 || count > 20) return null;
  return count;
}

export function parseDestination(message: string) {
  const text = message.replace(/\s+/g, " ").trim();
  const marked = text.match(/\b(?:à|to|in)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]{1,40})/i);
  const source = (marked?.[1] || text).trim();
  const raw = (source.split(/\s+(?:du|au|de|des|from|for)\b|\s+\d/i)[0] || "")
    .replace(/[?.!].*$/, "")
    .trim();
  if (!raw || raw.length > 40 || /\d/.test(raw)) return null;
  if (/^(bonjour|hello|salut|oui|non|yes|no|devis|je|i)$/i.test(raw)) return null;
  return raw;
}

export function parseBudget(message: string) {
  const text = message.replace(/\s+/g, " ").trim();
  if (!text || text.length > 80) return null;
  if (/budget|€|eur|euros/i.test(text)) return text.slice(0, 80);
  return null;
}

function say(lang: ReplyLang, text: Record<ReplyLang, string>) {
  return text[lang] || text.fr;
}

export function discoveryQuestion(stage: BriefStage, lang: ReplyLang) {
  return withConciergeSignature(
    say(lang, {
      destination: {
        fr: "Avec plaisir. Pour quelle destination ?",
        en: "With pleasure. Which destination?",
        he: "בשמחה. לאיזה יעד?",
      },
      dates: {
        fr: "Quelles dates vous conviendraient ?",
        en: "Which dates would suit you?",
        he: "אילו תאריכים יתאימו לכם?",
      },
      travellers: {
        fr: "Combien de voyageurs ?",
        en: "How many travellers?",
        he: "כמה נוסעים?",
      },
      budget: {
        fr: "Avez-vous un budget en tête ? Ce n’est pas un prix.",
        en: "Do you have a budget in mind? This is not a price.",
        he: "יש לכם תקציב בראש? זה אינו מחיר.",
      },
      wishes: {
        fr: "Qu’aimeriez-vous que ce séjour ait de particulier ?",
        en: "What would you like this stay to feel like?",
        he: "מה הייתם רוצים שהשהות הזו תישא?",
      },
      ready: {
        fr: "Je prépare deux ou trois pistes. L’agence vous les confirme avant tout envoi. Rien n’est réservé.",
        en: "I am preparing two or three options. The agency confirms them before anything is sent. Nothing is booked.",
        he: "אני מכין שתיים או שלוש אפשרויות. הסוכנות מאשרת אותן לפני כל שליחה. דבר אינו מוזמן.",
      },
    }[stage])
  );
}

export function absorbBrief(brief: TripBrief, message: string, now = new Date()): TripBrief {
  const next = { ...brief };
  const dates = parseTripDates(message, now);
  if (dates) {
    next.start = dates.start;
    next.end = dates.end;
  }
  const travellers = parseTravellers(message);
  if (travellers) next.travellers = travellers;
  const budget = parseBudget(message);
  if (budget && next.stage === "budget") next.budget = budget;
  if (!next.destination && next.stage === "destination" && !/\b(devis|quote|nouveau sejour|new trip)\b/.test(fold(message))) {
    const destination = parseDestination(message);
    if (destination) next.destination = destination;
  }
  if (next.stage === "wishes" && !next.wishes) next.wishes = message.replace(/\s+/g, " ").trim().slice(0, 280);
  next.stage = !next.destination
    ? "destination"
    : !next.start
      ? "dates"
      : !next.travellers
        ? "travellers"
        : !next.budget
          ? "budget"
          : !next.wishes
            ? "wishes"
            : "ready";
  return next;
}

function lineFromHit(hit: StayHit): QuoteLine {
  if (hit.kind !== "hotel" || hit.net == null) {
    return {
      title: hit.title,
      kind: hit.kind,
      net: hit.net,
      sell: null,
      currency: hit.currency,
      simulated: hit.simulated,
      note: hit.note,
    };
  }
  const priced = priceAccommodation({
    net: hit.net,
    currency: hit.currency,
    commissionable: hit.commissionable,
    hotelCommission: hit.hotelCommission,
  });
  return {
    title: hit.title,
    kind: "hotel",
    net: hit.net,
    sell: priced?.sell ?? null,
    currency: hit.currency,
    simulated: hit.simulated,
    note: hit.note,
  };
}

export function quoteDraft(input: {
  brief: TripBrief;
  hits: StayHit[];
  lang: ReplyLang;
}): ProposalDraft {
  const lines = input.hits.slice(0, 3).map(lineFromHit);
  const hotels = lines.filter((line) => line.kind === "hotel" && line.sell != null);
  const sell = hotels.reduce((sum, line) => sum + (line.sell || 0), 0) || null;
  const net = hotels.reduce((sum, line) => sum + (line.net || 0), 0) || null;
  const list = lines
    .map((line, index) => {
      const price = line.sell != null ? `${line.sell} ${line.currency}` : "tarif à confirmer";
      const tag = line.simulated ? " (simulation)" : "";
      return `${index + 1}. ${line.title}${tag} — ${price}`;
    })
    .join("\n");
  const intro =
    input.lang === "en"
      ? `Options for ${input.brief.destination}, ${input.brief.start} to ${input.brief.end}, ${input.brief.travellers} travellers.`
      : `Pistes pour ${input.brief.destination}, du ${input.brief.start} au ${input.brief.end}, ${input.brief.travellers} voyageurs.`;
  return {
    kind: "quote",
    draftBody: withConciergeSignature(
      `${intro}\n${list || "La recherche est coupée. L’agence reprend."}\nCes montants attendent votre accord. Rien n’est réservé.`
    ),
    amounts: { currency: "EUR", net, sell, lines },
    simulated: lines.some((line) => line.simulated),
  };
}

export async function advanceJourney(input: {
  phone: string;
  message: string;
  brief?: TripBrief | null;
  lang?: ReplyLang;
  mode?: SearchMode;
  catalog?: HotelDirectoryEntry[];
  now?: Date;
}): Promise<{ brief: TripBrief; reply: string; proposal: ProposalDraft | null }> {
  const lang = input.lang || messageLanguage(input.message);
  const brief = absorbBrief(input.brief || emptyBrief(input.phone), input.message, input.now || new Date());
  if (brief.stage !== "ready") {
    return { brief, reply: discoveryQuestion(brief.stage, lang), proposal: null };
  }
  const found = await searchSuppliers({ city: brief.destination || "", mode: input.mode || "off", catalog: input.catalog });
  const proposal = quoteDraft({ brief, hits: [...found.hotels, ...found.flights].slice(0, 3), lang });
  return { brief, reply: discoveryQuestion("ready", lang), proposal };
}

// TODO: ne pas envoyer ces relances (pré-départ, silence, retour, check-in).
// Elles restent des brouillons `planned`. Aucun message sortant proactif tant que ce n’est pas décidé.
export function planFollowups(input: {
  now: Date;
  lastInbound: Date | null;
  stayStart: string | null;
  stayEnd: string | null;
  briefOpen: boolean;
  firstName?: string | null;
  stay?: StayPhraseInput | null;
  lang?: ReplyLang;
}): PlannedFollowup[] {
  const lang = input.lang === "en" || input.lang === "he" ? input.lang : "fr";
  const destination = templateDestination(input.stay || {}, lang);
  const reprise = renderConciergeTemplate("concierge_reprise", lang, { prenom: input.firstName });
  const depart = renderConciergeTemplate("concierge_depart", lang, { prenom: input.firstName, destination });
  const retour = renderConciergeTemplate("concierge_retour", lang, { prenom: input.firstName, destination });
  const out: PlannedFollowup[] = [];
  if (input.lastInbound) {
    const age = input.now.getTime() - input.lastInbound.getTime();
    const hour = 3_600_000;
    if (input.briefOpen && age >= 4 * hour && age < 24 * hour) {
      out.push({
        kind: "silence_session",
        channel: "session",
        templateKey: null,
        dueAt: input.now.toISOString(),
        body: "Je reste à votre disposition pour ce séjour. Dites-moi si vous souhaitez que je continue.",
      });
    }
    if (age >= 24 * hour) {
      out.push({
        kind: "silence_template",
        channel: "template",
        templateKey: "concierge_reprise",
        dueAt: input.now.toISOString(),
        body: `${reprise}\nModèle non soumis à Meta.`,
      });
    }
  }
  const today = input.now.toISOString().slice(0, 10);
  if (input.stayStart && input.stayStart > today && input.stayStart <= addDays(today, 2)) {
    out.push({
      kind: "predeparture",
      channel: "template",
      templateKey: "concierge_depart",
      dueAt: input.now.toISOString(),
      body: `${depart}\nModèle non soumis à Meta.`,
    });
  }
  if (input.stayStart === today) {
    out.push({
      kind: "checkin",
      channel: "session",
      templateKey: null,
      dueAt: input.now.toISOString(),
      body: "Votre arrivée est aujourd’hui. Dites-moi si quelque chose coince.",
    });
  }
  if (input.stayEnd && input.stayEnd < today && input.stayEnd >= addDays(today, -2)) {
    out.push({
      kind: "feedback",
      channel: "template",
      templateKey: "concierge_retour",
      dueAt: input.now.toISOString(),
      body: `${retour}\nModèle non soumis à Meta.`,
    });
  }
  return out;
}

function addDays(isoDay: string, days: number) {
  const date = new Date(`${isoDay}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function inTripHelp(message: string) {
  const text = fold(message);
  if (/retard|delay|delayed|vol annul|איחור/.test(text)) return "delay" as const;
  if (/transfert|chauffeur|pickup|איסוף/.test(text)) return "transfer" as const;
  if (/restaurant|table|dîner|diner/.test(text) && /reserv|book|voudrais|please/.test(text)) return "restaurant" as const;
  return null;
}
