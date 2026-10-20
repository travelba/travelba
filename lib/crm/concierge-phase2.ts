import type { ConciergeDossier, ConciergeTurn, ReplyLang } from "@/lib/crm/whatsapp-concierge";
import { classifyHandoff, messageLanguage } from "@/lib/crm/whatsapp-concierge";
import { planConciergeConversation, type ConciergeGenerator, type ConciergeHistoryTurn } from "@/lib/crm/whatsapp-conversation";
import { advanceJourney, inTripHelp, planFollowups, type PlannedFollowup, type ProposalDraft, type TripBrief } from "@/lib/crm/concierge-journey";
import { paymentDraft, serviceDraft } from "@/lib/crm/concierge-proposals";
import { rankKnowledge, knowledgePrompt, type KnowledgeChunk } from "@/lib/crm/concierge-knowledge";
import { qualityMarks, type QualityMark } from "@/lib/crm/concierge-quality";
import type { SearchMode } from "@/lib/crm/concierge-search";
import type { HotelDirectoryEntry } from "@/lib/crm/hotel-catalog";

export type Phase2Result = {
  turn: ConciergeTurn;
  brief: TripBrief | null;
  proposal: ProposalDraft | null;
  followups: PlannedFollowup[];
  marks: QualityMark[];
  knowledge: string;
};

function foreignReference(message: string, dossier: ConciergeDossier) {
  const known = new Set(dossier.stays.map((stay) => stay.reference.toUpperCase()));
  const refs = message.match(/TB-\d{4}-\d+/gi) || [];
  return refs.some((ref) => !known.has(ref.toUpperCase()));
}

export async function planPhase2(input: {
  phone: string;
  message: string;
  dossier: ConciergeDossier;
  history?: ConciergeHistoryTurn[];
  brief?: TripBrief | null;
  generate?: ConciergeGenerator;
  knowledge?: KnowledgeChunk[];
  mode?: SearchMode;
  catalog?: HotelDirectoryEntry[];
  balance?: number | null;
  currency?: string;
  stayStart?: string | null;
  stayEnd?: string | null;
  now?: Date;
  lastInbound?: Date | null;
}): Promise<Phase2Result> {
  const now = input.now || new Date();
  const lang: ReplyLang = messageLanguage(input.message);
  const history = input.history || [];
  const act = classifyHandoff(input.message);
  const briefOpen = Boolean(input.brief && input.brief.stage !== "ready");
  const discovering = input.message.trim().length > 0 && (act === "quote" || (briefOpen && !act));
  const snippets = rankKnowledge(input.knowledge || [], input.message, 3);
  const facts = knowledgePrompt(snippets.filter((item) => !item.toneOnly));
  let turn: ConciergeTurn;
  let brief: TripBrief | null = input.brief || null;
  let proposal: ProposalDraft | null = null;

  if (discovering && act !== "quote") {
    const step = await advanceJourney({
      phone: input.phone,
      message: input.message,
      brief: input.brief,
      lang,
      mode: input.mode,
      catalog: input.catalog,
      now,
    });
    brief = step.brief;
    proposal = step.proposal;
    turn = {
      handoff: "quote",
      bookingId: null,
      text: step.reply,
      cover: null,
      optOut: false,
      access: false,
    };
  } else {
    turn = await planConciergeConversation({
      message: input.message,
      dossier: input.dossier,
      history,
      generate: input.generate,
      knowledge: facts,
      now,
    });
    if (turn.handoff === "quote") {
      const step = await advanceJourney({
        phone: input.phone,
        message: input.message,
        brief: input.brief,
        lang,
        mode: input.mode,
        catalog: input.catalog,
        now,
      });
      brief = step.brief;
      proposal = step.proposal;
      turn = { ...turn, text: step.reply, cover: null };
    }
  }

  if (turn.handoff === "payment") {
    proposal = paymentDraft({
      balance: input.balance ?? input.dossier.balances[0]?.balance ?? null,
      currency: input.currency || input.dossier.balances[0]?.currency || "EUR",
      phone: input.phone,
    });
  }
  const help = turn.handoff ? null : inTripHelp(input.message);
  if (help === "delay" || help === "transfer" || help === "restaurant") {
    const kind = help === "restaurant" ? "restaurant" : help === "transfer" ? "transfer" : "help";
    if (!proposal) proposal = serviceDraft(kind, input.message);
    if (!turn.handoff) {
      turn = { ...turn, handoff: help === "transfer" ? "chauffeur" : "question" };
    }
  }

  const followups = planFollowups({
    now,
    lastInbound: input.lastInbound ?? null,
    stayStart: input.stayStart ?? input.dossier.stays[0]?.startDate ?? null,
    stayEnd: input.stayEnd ?? input.dossier.stays[0]?.endDate ?? null,
    briefOpen: Boolean(brief && brief.stage !== "ready"),
  });
  return {
    turn,
    brief,
    proposal,
    followups,
    marks: qualityMarks({
      phone: input.phone,
      message: input.message,
      handoff: turn.handoff,
      foreignReference: foreignReference(input.message, input.dossier),
      at: now.toISOString(),
    }),
    knowledge: knowledgePrompt(snippets),
  };
}
