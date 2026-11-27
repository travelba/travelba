import { McpWriteError } from "./mcp-write";
import { ensureTrainTemplates, trainTemplatesStatus, TRAIN_TEMPLATE_CATEGORY, type TrainTemplateReport } from "./train-templates-arm";

const LABEL: Record<TrainTemplateReport["statut"], string> = {
  approved: "Approuvé par Meta",
  pending: "En attente d’approbation",
  received: "Reçu par Meta, en attente",
  rejected: "Refusé par Meta",
  paused: "Mis en pause par Meta",
  disabled: "Désactivé par Meta",
  unsubmitted: "Créé, pas encore soumis",
  absent: "Absent chez Twilio",
  inconnu: "Statut inconnu",
};

function present(row: TrainTemplateReport) {
  return {
    nom: row.nom,
    variable: row.variable,
    content_sid: row.content_sid,
    statut: row.statut,
    statut_libelle: LABEL[row.statut],
    source: row.source,
    ...(row.cree !== undefined ? { cree: row.cree } : {}),
    ...(row.soumis !== undefined ? { soumis: row.soumis } : {}),
    ...(row.motif_refus ? { motif_refus: row.motif_refus } : {}),
    ...(row.erreur ? { erreur: row.erreur } : {}),
  };
}

const NOTE = "Aucun WhatsApp n’est envoyé. Le CRM n’achète pas les billets.";

export async function deposerModelesTrainWhatsapp(input: Record<string, unknown>, fetchImpl?: typeof fetch) {
  void input;
  const result = await ensureTrainTemplates(fetchImpl);
  if (!result.ok && result.message) throw new McpWriteError(result.message);
  return { ok: result.ok, categorie: TRAIN_TEMPLATE_CATEGORY, modeles: result.modeles.map(present), note: NOTE };
}

export async function statutModelesTrainWhatsapp(input: Record<string, unknown>, fetchImpl?: typeof fetch) {
  void input;
  const result = await trainTemplatesStatus(fetchImpl);
  return {
    ok: result.ok,
    modeles: result.modeles.map(present),
    ...(result.message ? { message: result.message } : {}),
    pret: result.modeles.length > 0 && result.modeles.every((row) => row.statut === "approved"),
    note: NOTE,
  };
}
