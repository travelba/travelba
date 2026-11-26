import { scrubClientText } from "@/lib/crm/whatsapp-concierge";
import type { SimRun } from "@/lib/crm/concierge-sim";
import type { ConciergeScenario } from "@/lib/crm/concierge-sim";

export type QualityRunRow = {
  id: string;
  scenarioId: string;
  slug: string;
  title: string;
  phase: string;
  mode: string;
  startedAt: string;
  finishedAt: string | null;
  ok: boolean;
  summary: string;
  batchId: string | null;
};

export type QualityScoreRow = {
  runId: string;
  position: number;
  criterion: string;
  ok: boolean;
  detail: string;
};

export type StoredTurn = {
  position: number;
  client: string;
  reply: string;
  status: "graded" | "skipped";
  failed: string[];
};

export type QualityBatch = {
  id: string;
  startedAt: string;
  total: number;
  passed: number;
  /** Pourcentage entier. 0 s’il n’y a aucun scénario. */
  rate: number;
  failed: { slug: string; title: string; summary: string }[];
};

/** Vrai si la table ou la relation n’est pas encore dans le schéma. */
export function schemaMissesRelation(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const message = error.message || "";
  return /schema cache|does not exist|could not find the table/i.test(message);
}

/** Retire MRZ, commission, prix net, fournisseur, et une date de naissance écrite en chiffres. */
export function scrubQualityText(value: string) {
  return scrubClientText(value)
    .replace(/\b(?:n[ée]e?\s+le|naissance|date de naissance)\b/gi, "")
    .replace(/\d{1,2}[./]\d{1,2}[./](?:19|20)\d{2}/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Heure civile de Paris, pour la liste des passages. */
export function parisStamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function successRate(passed: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((passed / total) * 100);
}

/** Un passage du bouton = un lot. Sans lot, chaque scénario reste seul. */
export function groupQualityRuns(rows: QualityRunRow[]): QualityBatch[] {
  const groups = new Map<string, QualityRunRow[]>();
  for (const row of rows) {
    const key = row.batchId || row.id;
    const list = groups.get(key) || [];
    list.push(row);
    groups.set(key, list);
  }
  const batches: QualityBatch[] = [];
  for (const [id, list] of groups) {
    const startedAt = list.map((row) => row.startedAt).sort()[0] || "";
    const passed = list.filter((row) => row.ok).length;
    const failed = list
      .filter((row) => !row.ok)
      .map((row) => ({ slug: row.slug, title: row.title, summary: scrubQualityText(row.summary) }));
    batches.push({
      id,
      startedAt,
      total: list.length,
      passed,
      rate: successRate(passed, list.length),
      failed,
    });
  }
  return batches.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function failedCriteria(scores: QualityScoreRow[]) {
  return scores.filter((row) => !row.ok).map((row) => row.criterion);
}

export function turnsForStore(scenario: ConciergeScenario, run: SimRun): StoredTurn[] {
  return run.turns.map((turn) => {
    const source = scenario.turns.find((row) => row.position === turn.position);
    return {
      position: turn.position,
      client: scrubQualityText(source?.clientText || "").slice(0, 500),
      reply: scrubQualityText(turn.reply).slice(0, 800),
      status: turn.status,
      failed: turn.scores.filter((score) => !score.ok).map((score) => score.criterion),
    };
  });
}

export function scoreRowsForStore(runId: string, run: SimRun) {
  return run.turns.flatMap((turn) =>
    turn.scores.map((score) => ({
      run_id: runId,
      position: turn.position,
      criterion: score.criterion,
      ok: score.ok,
      detail: scrubQualityText(score.detail).slice(0, 240),
    }))
  );
}
