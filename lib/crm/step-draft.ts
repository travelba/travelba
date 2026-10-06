/** Identifiant d’une étape pas encore écrite en base. */
export const DRAFT_STEP_PREFIX = "draft:";

export type StepSnapshot = {
  id: string;
  kind: string;
  title: string;
  supplier: string | null;
  confirmation_ref: string | null;
  start_at: string | null;
  end_at: string | null;
  amount: number | null;
  include_in_ledger: boolean;
  visible_to_client: boolean;
  details: Record<string, unknown> | null;
};

export type StepCommitPlan = {
  pending: boolean;
  deleted: string[];
  updated: StepSnapshot[];
  created: StepSnapshot[];
  /** Ordre voulu, ids brouillon compris. Vide si l’ordre n’a pas changé. */
  order: string[];
};

export function isDraftStepId(id: string) {
  return id.startsWith(DRAFT_STEP_PREFIX);
}

function money(value: number | null | undefined) {
  if (value == null) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100) / 100;
}

function text(value: string | null | undefined) {
  const trimmed = (value || "").trim();
  return trimmed || null;
}

function sameStep(left: StepSnapshot, right: StepSnapshot) {
  return (
    left.kind === right.kind &&
    left.title.trim() === right.title.trim() &&
    text(left.supplier) === text(right.supplier) &&
    text(left.confirmation_ref) === text(right.confirmation_ref) &&
    text(left.start_at) === text(right.start_at) &&
    text(left.end_at) === text(right.end_at) &&
    money(left.amount) === money(right.amount) &&
    Boolean(left.include_in_ledger) === Boolean(right.include_in_ledger) &&
    Boolean(left.visible_to_client) === Boolean(right.visible_to_client) &&
    JSON.stringify(left.details || {}) === JSON.stringify(right.details || {})
  );
}

/**
 * Ce qui doit partir en base quand le séjour est enregistré.
 * Tant que ce plan est vide, une suppression ou une modification d’étape n’a pas lieu.
 */
export function stepCommitPlan(server: StepSnapshot[], local: StepSnapshot[]): StepCommitPlan {
  const serverById = new Map(server.map((step) => [step.id, step]));
  const localIds = new Set(local.map((step) => step.id));
  const serverIds = new Set(server.map((step) => step.id));
  const deleted = server.filter((step) => !localIds.has(step.id) && !isDraftStepId(step.id)).map((step) => step.id);
  const created = local.filter((step) => isDraftStepId(step.id) && !serverIds.has(step.id));
  const updated = local.filter((step) => {
    if (isDraftStepId(step.id)) return false;
    const previous = serverById.get(step.id);
    if (!previous) return false;
    return !sameStep(previous, step);
  });
  const orderChanged = server.map((step) => step.id).join("\0") !== local.map((step) => step.id).join("\0");
  const pending = deleted.length > 0 || updated.length > 0 || created.length > 0 || orderChanged;
  return {
    pending,
    deleted,
    updated,
    created,
    order: orderChanged ? local.map((step) => step.id) : [],
  };
}
