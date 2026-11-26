import { planPhase2 } from "@/lib/crm/concierge-phase2";
import {
  gradeTurn,
  plannedWrite,
  type GradeScore,
  type ScenarioExpect,
  type ScenarioPhase,
} from "@/lib/crm/concierge-grader";
import {
  planConciergeTurn,
  routerCanAnswerAlone,
  type ConciergeDossier,
  type ConciergePending,
  type HandoffKind,
} from "@/lib/crm/whatsapp-concierge";
import { fixtureWebProvider, type WebProvider } from "@/lib/crm/concierge-engine-web";
import {
  runConciergeEngine,
  simulateEngineReply,
  type EngineCheckin,
  type EngineGenerate,
  type EngineTraveler,
} from "@/lib/crm/concierge-engine";
import {
  generateConciergeReply,
  type ConciergeGenerator,
  type ConciergeHistoryTurn,
} from "@/lib/crm/whatsapp-conversation";
import { CONCIERGE_FIXTURE_PHONE, CONCIERGE_TEST_REFUSAL, conciergeTestTargetAllowed } from "@/lib/crm/whatsapp-test-guard";

export type ScenarioTurn = {
  position: number;
  clientText: string;
  expect: ScenarioExpect;
};

export type ConciergeScenario = {
  slug: string;
  phase: ScenarioPhase;
  title: string;
  locale: string;
  fixture: ConciergeDossier;
  published: boolean;
  turns: ScenarioTurn[];
  travelers?: EngineTraveler[];
  checkins?: EngineCheckin[];
};

export type SimMode = "router" | "model" | "engine";

/** Le client simulé de cette version est le texte du tour. Le crochet est là pour la suite. */
export type NextClientTurn = (input: {
  scenario: ConciergeScenario;
  position: number;
  history: ConciergeHistoryTurn[];
}) => string | null;

export type TurnResult = {
  position: number;
  status: "graded" | "skipped";
  reply: string;
  handoff: HandoffKind | null;
  tools: string[];
  scores: GradeScore[];
};

export type SimRun = {
  slug: string;
  phase: ScenarioPhase;
  mode: SimMode;
  ok: boolean;
  summary: string;
  turns: TurnResult[];
};

export type SimOptions = {
  mode?: SimMode;
  now?: Date;
  /** Numéro fictif, seulement pour l’appel. Il n’est pas stocké. Un vrai numéro est refusé. */
  phone?: string;
  /** Dossier ou fiche `is_test`. Seul cas où un autre numéro est accepté. */
  isTest?: boolean;
  generate?: ConciergeGenerator;
  nextClientTurn?: NextClientTurn;
  /** Modèle du nouveau moteur. Défaut : simulateur, sans appel réseau. */
  engineGenerate?: EngineGenerate;
  /** Vrai modèle. Le script manuel seulement. La CI laisse ce drapeau vide. */
  liveEngine?: boolean;
  web?: WebProvider;
};

const FICTIONAL_PHONE = CONCIERGE_FIXTURE_PHONE;

/**
 * Le routeur ne tranche pas, et la phase 2 non plus : le modèle devrait parler.
 * Une écriture reconnue, un passage ou un accès restent notés.
 */
export function turnNeedsModel(input: {
  message: string;
  dossier: ConciergeDossier;
  now: Date;
  history: ConciergeHistoryTurn[];
  pending: ConciergePending[];
  handoff: HandoffKind | null;
  access: boolean;
  optOut: boolean;
}) {
  if (plannedWrite(input.message)) return false;
  if (input.handoff || input.access || input.optOut) return false;
  const keyword = planConciergeTurn(input.message, input.dossier, input.now, input.history, input.pending);
  return !routerCanAnswerAlone(input.message, keyword, input.dossier, input.now, input.pending);
}

function summarize(turns: TurnResult[]) {
  const failed = turns.flatMap((turn) =>
    turn.status === "skipped"
      ? turn.scores.filter((score) => !score.ok).map((score) => `${turn.position} ${score.criterion}`)
      : turn.scores.filter((score) => !score.ok).map((score) => `${turn.position} ${score.criterion}`)
  );
  if (!failed.length) return "ok";
  return failed.slice(0, 8).join(", ").slice(0, 180);
}

/**
 * Enchaîne les tours sur le cœur du concierge.
 * Mode routeur : pas de modèle. Un tour qui en a besoin est « skipped ».
 * Aucun envoi, aucune écriture en base.
 */
export async function runScenario(scenario: ConciergeScenario, options: SimOptions = {}): Promise<SimRun> {
  const mode = options.mode || "router";
  const now = options.now ?? new Date();
  const phone = options.phone || FICTIONAL_PHONE;
  if (!conciergeTestTargetAllowed({ phone, isTest: options.isTest })) {
    return {
      slug: scenario.slug,
      phase: scenario.phase,
      mode,
      ok: false,
      summary: CONCIERGE_TEST_REFUSAL,
      turns: [],
    };
  }
  const generate = options.generate ?? (mode === "model" ? generateConciergeReply : undefined);
  const history: ConciergeHistoryTurn[] = [];
  const pending: ConciergePending[] = [];
  const turns: TurnResult[] = [];

  for (const turn of scenario.turns) {
    const message = options.nextClientTurn?.({ scenario, position: turn.position, history }) || turn.clientText;
    if (mode === "engine") {
      const result = await runConciergeEngine({
        message,
        dossier: scenario.fixture,
        history,
        now,
        travelers: scenario.travelers,
        checkins: scenario.checkins,
        generate: options.liveEngine ? undefined : options.engineGenerate || simulateEngineReply,
        web: options.web || fixtureWebProvider(),
      });
      const scores = gradeTurn({
        phase: scenario.phase,
        message,
        reply: result.reply,
        handoff: result.handoff,
        tools: result.tools,
        access: result.access,
        dossier: scenario.fixture,
        history,
        now,
        expect: turn.expect,
        corpus: result.corpus,
      });
      turns.push({
        position: turn.position,
        status: "graded",
        reply: result.reply,
        handoff: result.handoff,
        tools: result.tools,
        scores,
      });
      history.push({ direction: "inbound", body: message, at: now.toISOString() });
      history.push({ direction: "outbound", body: result.reply, at: now.toISOString() });
      if (result.handoff) pending.push({ kind: result.handoff, bookingId: null, body: message });
      continue;
    }
    const phase = await planPhase2({
      phone,
      message,
      dossier: scenario.fixture,
      history,
      pending,
      now,
      generate,
    });
    const tools = phase.turn.tools || [];
    const needsModel = turnNeedsModel({
      message,
      dossier: scenario.fixture,
      now,
      history,
      pending,
      handoff: phase.turn.handoff,
      access: phase.turn.access,
      optOut: phase.turn.optOut,
    });
    let status: TurnResult["status"] = "graded";
    let scores: GradeScore[] = [];
    if (mode === "router" && needsModel) {
      status = "skipped";
      scores = turn.expect.needsModel
        ? []
        : [{ criterion: "handoff", ok: false, detail: "tour sauté alors que le routeur devait répondre" }];
    } else if (mode === "router" && turn.expect.needsModel) {
      scores = [{ criterion: "handoff", ok: false, detail: "le modèle n’était pas requis" }];
    } else {
      scores = gradeTurn({
        phase: scenario.phase,
        message,
        reply: phase.turn.text,
        handoff: phase.turn.handoff,
        tools,
        access: phase.turn.access,
        dossier: scenario.fixture,
        history,
        now,
        expect: turn.expect,
      });
    }
    turns.push({
      position: turn.position,
      status,
      reply: phase.turn.text,
      handoff: phase.turn.handoff,
      tools,
      scores,
    });
    history.push({ direction: "inbound", body: message, at: now.toISOString() });
    history.push({ direction: "outbound", body: phase.turn.text, at: now.toISOString() });
    if (phase.turn.handoff) {
      pending.push({ kind: phase.turn.handoff, bookingId: phase.turn.bookingId, body: message });
    }
  }

  const ok = turns.every((turn) => turn.scores.every((score) => score.ok));
  return { slug: scenario.slug, phase: scenario.phase, mode, ok, summary: summarize(turns), turns };
}
