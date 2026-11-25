import { recordAgencyJournal } from "@/lib/crm/agency-log";

/** Préfixe exact : le rattachement automatique reconnaît les cartes retirées par l’agence. */
export const REMOVED_STEP_PREFIX = "Étape retirée du carnet : ";
export const UPDATED_STEP_PREFIX = "Étape du carnet modifiée : ";

export type StepIdentity = {
  kind?: string | null;
  title?: string | null;
  supplier?: string | null;
  confirmation_ref?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  details?: Record<string, unknown> | null;
};

function stepName(title: string | null | undefined) {
  const name = (title || "").trim();
  return name || "Étape";
}

export function removedStepSummary(title: string | null | undefined) {
  return `${REMOVED_STEP_PREFIX}${stepName(title)}`.slice(0, 500);
}

export function updatedStepSummary(title: string | null | undefined) {
  return `${UPDATED_STEP_PREFIX}${stepName(title)}`.slice(0, 500);
}

function detailText(details: Record<string, unknown> | null | undefined, key: string) {
  const value = details?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Identité de la carte, sans voyageurs ni numéro de pièce. Sert à ne pas la recréer. */
export function stepJournalDiff(item: StepIdentity) {
  return {
    kind: item.kind || null,
    title: stepName(item.title),
    supplier: item.supplier || null,
    confirmation_ref: item.confirmation_ref || null,
    start_at: item.start_at || null,
    end_at: item.end_at || null,
    flight_number: detailText(item.details, "flight_number"),
    hotel_name: detailText(item.details, "hotel_name"),
    train_number: detailText(item.details, "train_number"),
    pnr: detailText(item.details, "pnr"),
  };
}

export function identityFromJournalDiff(diff: unknown): StepIdentity | null {
  if (!diff || typeof diff !== "object" || Array.isArray(diff)) return null;
  const row = diff as Record<string, unknown>;
  const text = (key: string) => (typeof row[key] === "string" ? row[key] : null);
  const kind = text("kind");
  const title = text("title");
  if (!kind && !title) return null;
  const details: Record<string, unknown> = {};
  const flight = text("flight_number");
  const hotel = text("hotel_name");
  const train = text("train_number");
  const pnr = text("pnr");
  if (flight) details.flight_number = flight;
  if (hotel) details.hotel_name = hotel;
  if (train) details.train_number = train;
  if (pnr) details.pnr = pnr;
  return {
    kind,
    title,
    supplier: text("supplier"),
    confirmation_ref: text("confirmation_ref"),
    start_at: text("start_at"),
    end_at: text("end_at"),
    details,
  };
}

export function removedStepsFromJournal(
  rows: { action?: string | null; summary?: string | null; diff?: unknown }[]
): StepIdentity[] {
  const steps: StepIdentity[] = [];
  for (const row of rows) {
    if (row.action && row.action !== "delete") continue;
    if (!(row.summary || "").startsWith(REMOVED_STEP_PREFIX)) continue;
    const identity = identityFromJournalDiff(row.diff);
    if (identity) steps.push(identity);
  }
  return steps;
}

/** Une ligne par carte retirée, une ligne par carte modifiée. L’enregistrement groupé n’en écrit pas d’autre. */
export async function recordStepJournals(input: {
  bookingId: string;
  staffId: string | null;
  path?: string | null;
  deleted: StepIdentity[];
  updated: StepIdentity[];
}) {
  const path = input.path || `/api/admin/bookings/${input.bookingId}/items`;
  for (const item of input.deleted) {
    await recordAgencyJournal({
      staffId: input.staffId,
      action: "delete",
      entityType: "dossier",
      entityId: input.bookingId,
      summary: removedStepSummary(item.title),
      diff: stepJournalDiff(item),
      path,
    });
  }
  for (const item of input.updated) {
    await recordAgencyJournal({
      staffId: input.staffId,
      action: "update",
      entityType: "dossier",
      entityId: input.bookingId,
      summary: updatedStepSummary(item.title),
      diff: stepJournalDiff(item),
      path,
    });
  }
}
