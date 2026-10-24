import { replacementPlan, type LifecycleCard } from "@/lib/crm/item-lifecycle";
import type { BookingExtract } from "@/lib/crm/ingest-types";

export const AUTO_APPLY_CONFIDENCE = 0.9;

export type ProposalOp =
  | { op: "add"; kind: string; title: string }
  | { op: "replace"; itemId: string; title: string }
  | { op: "cancel"; itemId: string; title: string }
  | { op: "attach_mail" };

export type ImportProposal = {
  ops: ProposalOp[];
  conflict: boolean;
  choices: { id: string; kind: string; title: string }[];
};

function titled(existing: LifecycleCard[], itemId: string) {
  return (existing.find((row) => row.id === itemId)?.title || "").trim() || "Carte";
}

/** Avant / après : ajouter, remplacer, annuler une carte, puis le mail dans les pièces. */
export function buildImportProposal(
  extract: Pick<BookingExtract, "items" | "document_status">,
  existing: LifecycleCard[]
): ImportProposal {
  if (extract.document_status === "cancelled") {
    const targets = existing.filter((row) => row.lifecycle !== "cancelled" && row.lifecycle !== "superseded");
    return {
      ops: [
        ...targets.map((row) => ({ op: "cancel" as const, itemId: row.id, title: (row.title || "").trim() || "Carte" })),
        { op: "attach_mail" },
      ],
      conflict: targets.length > 1 && !(extract.items || []).some((item) => (item.confirmation_ref || "").trim()),
      choices: [],
    };
  }
  const plan = replacementPlan(extract.items || [], existing);
  const ops: ProposalOp[] = [];
  for (const row of plan.updates) {
    ops.push({ op: "replace", itemId: row.itemId, title: titled(existing, row.itemId) });
  }
  for (const row of plan.replacements) {
    if (ops.some((op) => op.op === "replace" && op.itemId === row.itemId)) continue;
    ops.push({ op: "replace", itemId: row.itemId, title: titled(existing, row.itemId) });
  }
  const incoming = extract.items || [];
  for (let index = 0; index < plan.adds; index += 1) {
    const item = incoming[incoming.length - plan.adds + index];
    ops.push({
      op: "add",
      kind: item?.kind || "fee",
      title: (item?.title || "").trim() || "Carte",
    });
  }
  ops.push({ op: "attach_mail" });
  return { ops, conflict: plan.choices.length > 0, choices: plan.choices };
}

/** Ligne lisible d’un geste, pour la carte de la boîte. */
export function proposalLine(op: ProposalOp) {
  if (op.op === "add") return `Ajouter · ${op.title}`;
  if (op.op === "replace") return `Remplacer · ${op.title}`;
  if (op.op === "cancel") return `Annuler · ${op.title}`;
  return "Joindre le mail aux pièces";
}

/** Relit le JSON stocké. Une forme inconnue est ignorée. */
export function readProposalOps(value: unknown): ProposalOp[] {
  if (!Array.isArray(value)) return [];
  const ops: ProposalOp[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const op = (row as { op?: unknown }).op;
    const title = typeof (row as { title?: unknown }).title === "string" ? (row as { title: string }).title.trim() : "";
    if (op === "attach_mail") ops.push({ op: "attach_mail" });
    else if (op === "add") {
      const kind = typeof (row as { kind?: unknown }).kind === "string" ? (row as { kind: string }).kind : "fee";
      ops.push({ op: "add", kind, title: title || "Carte" });
    } else if (op === "replace" || op === "cancel") {
      const itemId = typeof (row as { itemId?: unknown }).itemId === "string" ? (row as { itemId: string }).itemId : "";
      ops.push({ op, itemId, title: title || "Carte" });
    }
  }
  return ops;
}

/** L’inverse d’une proposition déjà appliquée. Le mail quitte les pièces. */
export function undoImportProposal(proposal: ImportProposal): ProposalOp[] {
  const reversed: ProposalOp[] = [];
  for (const op of [...proposal.ops].reverse()) {
    if (op.op === "add") reversed.push({ op: "cancel", itemId: "", title: op.title });
    else if (op.op === "cancel") reversed.push({ op: "add", kind: "fee", title: op.title });
    else if (op.op === "replace") reversed.push({ op: "replace", itemId: op.itemId, title: op.title });
    else reversed.push({ op: "attach_mail" });
  }
  return reversed;
}

export function matchedByConfirmation(
  candidates: { booking_id?: string | null; reason?: string | null; score?: number | null }[]
) {
  return candidates.some(
    (row) => row.booking_id && (row.score || 0) >= 90 && /r[eé]f[eé]rence/i.test(row.reason || "")
  );
}

/** Application seule : référence de confirmation, confiance ≥ 0,9, aucun choix de carte. */
export function canAutoApply(input: {
  candidates: { booking_id?: string | null; reason?: string | null; score?: number | null }[];
  confidence: number | null;
  conflict: boolean;
}) {
  if (input.conflict) return false;
  if (!matchedByConfirmation(input.candidates)) return false;
  if (input.confidence == null || input.confidence < AUTO_APPLY_CONFIDENCE) return false;
  return true;
}
