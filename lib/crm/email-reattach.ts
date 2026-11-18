import { EMAIL_INBOX_QUEUE_STATUSES } from "@/lib/crm/types";

export type TreatedEmailGate =
  | { repartir: false; rejouer?: boolean }
  | { repartir: true; conserver: string | null }
  | { error: string };

const CARD_WRITE_ACTIONS = new Set([
  "apply_cards",
  "attach_flights",
  "auto_attach",
  "auto_create",
  "update_steps",
]);

/**
 * Le mail n’a fait que déposer des fichiers : aucune action n’a écrit de carte.
 */
export function emailDepositedFilesOnly(actions: string[]) {
  const known = actions.map((action) => action.trim()).filter(Boolean);
  if (!known.length) return false;
  if (known.some((action) => CARD_WRITE_ACTIONS.has(action))) return false;
  return known.includes("attach_files");
}

/**
 * Un mail encore dans la file se dépose comme d’habitude.
 * Un mail déjà traité se rejoue sur le même dossier s’il n’a fait que déposer
 * des pièces, ou si `forcer` est vrai. Les pièces déjà là ne sont pas recopiées.
 * `repartir` copie vers un autre dossier. Le premier dossier garde ses pièces.
 */
export function treatedEmailGate(
  status: string,
  createdBookingId: string | null,
  targetId: string,
  repartir: boolean,
  opts?: { forcer?: boolean; piecesSeules?: boolean }
): TreatedEmailGate {
  if ((EMAIL_INBOX_QUEUE_STATUSES as readonly string[]).includes(status)) return { repartir: false };
  const same = Boolean(targetId && createdBookingId && createdBookingId === targetId);
  if (same && status === "attached" && (opts?.forcer || opts?.piecesSeules)) {
    return { repartir: false, rejouer: true };
  }
  if (!repartir) return { error: "Cet e-mail est déjà traité." };
  if (status !== "attached") return { error: "Cet e-mail est déjà traité." };
  if (!targetId) return { error: "Choisissez un autre dossier." };
  if (same) {
    return { error: "Ce mail est déjà déposé sur ce dossier. Choisissez un autre dossier." };
  }
  return { repartir: true, conserver: createdBookingId };
}
