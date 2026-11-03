/** Préparation d’une facture MB3M : verrou, échec, pastille. Sans accès réseau. */

import { formatMoney } from "@/lib/crm/money";

export const MB3M_PREP_STALE_MS = 3 * 60 * 1000;

export type Mb3mAttemptStatus = "preparing" | "failed";

export type Mb3mAttemptPiece = {
  pieceNumber: string | null;
  attemptStatus: Mb3mAttemptStatus | null;
  attemptError: string | null;
  attemptStartedAt: string | null;
  attemptStartedBy: string | null;
};

export type Mb3mPreparationView = {
  /** En cours : verrou. Échouée : le clic suivant reprend la même ligne. */
  state: "running" | "failed" | null;
  message: string | null;
  resume: boolean;
};

export function mb3mActorLabel(name: string | null | undefined) {
  const clean = (name || "").replace(/\s+/g, " ").trim().slice(0, 80);
  return clean || null;
}

/** Heure de Paris, `14h05`. */
export function mb3mAttemptClock(iso: string, timeZone = "Europe/Paris") {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "";
  if (!/^\d{2}$/.test(hour) || !/^\d{2}$/.test(minute)) return "";
  return `${hour}h${minute}`;
}

/** Vrai seulement pendant une tentative encore vivante, sans numéro de pièce. */
export function mb3mPrepInProgress(piece: Mb3mAttemptPiece, now: number) {
  if ((piece.pieceNumber || "").trim()) return false;
  if (piece.attemptStatus !== "preparing") return false;
  const started = Date.parse(piece.attemptStartedAt || "");
  if (!Number.isFinite(started)) return false;
  const age = now - started;
  return age < MB3M_PREP_STALE_MS && started - now < 60_000;
}

export function mb3mPreparationLockMessage(piece: Pick<Mb3mAttemptPiece, "attemptStartedAt" | "attemptStartedBy">, now: number) {
  const started = Date.parse(piece.attemptStartedAt || "");
  const who = mb3mActorLabel(piece.attemptStartedBy) || "l’agence";
  const clock = Number.isFinite(started) ? mb3mAttemptClock(piece.attemptStartedAt || "") : "";
  const left = Number.isFinite(started) ? Math.min(MB3M_PREP_STALE_MS, Math.max(0, MB3M_PREP_STALE_MS - (now - started))) : MB3M_PREP_STALE_MS;
  const minutes = Math.max(1, Math.ceil(left / 60_000));
  const when = clock ? `démarrée à ${clock} par ${who}` : `démarrée par ${who}`;
  return `Préparation en cours (${when}), réessaie dans ${minutes} min`;
}

export function mb3mPreparationView(piece: Mb3mAttemptPiece | null, now: number): Mb3mPreparationView {
  if (!piece) return { state: null, message: null, resume: false };
  const numbered = Boolean((piece.pieceNumber || "").trim());
  const error = (piece.attemptError || "").replace(/\s+/g, " ").trim();
  if (numbered) {
    if (error || piece.attemptStatus === "failed") {
      return {
        state: "failed",
        message: error || "La préparation MB3M n’a pas abouti.",
        resume: true,
      };
    }
    if (piece.attemptStatus === "preparing") {
      if (mb3mPrepInProgress(piece, now)) {
        return { state: "running", message: mb3mPreparationLockMessage(piece, now), resume: false };
      }
      return { state: "failed", message: "La préparation a été interrompue. Reprends.", resume: true };
    }
    return { state: null, message: null, resume: false };
  }
  if (mb3mPrepInProgress(piece, now)) {
    return { state: "running", message: mb3mPreparationLockMessage(piece, now), resume: false };
  }
  const interrupted = piece.attemptStatus === "preparing" && !error;
  return {
    state: "failed",
    message: error || (interrupted ? "La préparation a été interrompue. Reprends." : "La préparation MB3M n’a pas abouti."),
    resume: true,
  };
}

export function mb3mPreparationFromRow(
  row: {
    piece_number?: string | null;
    attempt_status?: string | null;
    attempt_error?: string | null;
    attempt_started_at?: string | null;
    attempt_started_by?: string | null;
  } | null,
  now = Date.now()
): Mb3mPreparationView {
  if (!row) return { state: null, message: null, resume: false };
  const status = row.attempt_status === "preparing" || row.attempt_status === "failed" ? row.attempt_status : null;
  return mb3mPreparationView(
    {
      pieceNumber: row.piece_number?.trim() || null,
      attemptStatus: status,
      attemptError: row.attempt_error?.trim() || null,
      attemptStartedAt: row.attempt_started_at || null,
      attemptStartedBy: row.attempt_started_by?.trim() || null,
    },
    now
  );
}

export function mb3mInvoiceChip(input: {
  marginStale: boolean;
  printed: boolean;
  number: string | null;
  preparation: "running" | "failed" | null;
}): { label: string; tone: "green" | "gold" | "red" | "sky" } {
  if (!input.number && input.preparation === "running") return { label: "Préparation en cours", tone: "gold" };
  if (!input.number && input.preparation === "failed") return { label: "Préparation échouée", tone: "red" };
  if (input.marginStale) return { label: "Marge à corriger", tone: "red" };
  if (input.printed) return { label: "Imprimée", tone: "green" };
  if (input.number) return { label: "Pro forma", tone: "gold" };
  return { label: "À préparer", tone: "sky" };
}

export function mb3mInvoiceActionLabel(input: {
  invoicing: boolean;
  number: string | null;
  resume: boolean;
  running: boolean;
}) {
  if (input.invoicing) return "Préparation…";
  if (input.running) return "Préparation en cours";
  if (input.resume) return "Reprendre";
  if (input.number) return "Mettre à jour la pro forma";
  return "Préparer la facture";
}

export function mb3mAmadeusSentence(row: {
  label: string;
  invoiceNumber: string;
  placement: "move" | "here" | "other";
  moveWarning?: string | null;
}) {
  const base = `${row.label} : déjà dans MB3M via Amadeus (facture n°${row.invoiceNumber}).`;
  if (row.moveWarning) return `${base} ${row.moveWarning}`;
  if (row.placement === "other") return `${base} Elle est dans un autre dossier, elle n’a pas été déplacée.`;
  if (row.placement === "move") return `${base} Elle est rangée dans ce dossier.`;
  return base;
}

/** Avertissement : la facture Amadeus reste liée au séjour, sans échec de la préparation. */
export function gdsMoveWarning(number: string, message: string) {
  const detail = message.replace(/\s+/g, " ").trim();
  return `La facture Amadeus n° ${number} n’a pas été déplacée dans MB3M : ${detail}`;
}

/** L’API n’a pas rendu le PDF. La préparation continue, l’avertissement le dit. */
export function gdsPdfWarning(number: string, message: string, printed: boolean) {
  const detail = message.replace(/\s+/g, " ").trim().replace(/\.+$/, "");
  const missing = printed ? "" : " La pièce n’a pas de date d’impression dans MB3M.";
  return `Le PDF de la facture Amadeus n° ${number} n’a pas pu être récupéré : ${detail}.${missing}`;
}

export function mb3mAmadeusSuggestionSentence(row: { label: string; invoiceNumber: string }) {
  return `${row.label} : une facture Amadeus sans dossier pourrait correspondre (facture n°${row.invoiceNumber}). Elle reste sur la facture du CRM.`;
}

/** Phrase après le clic : les crédits envoyés ou déjà présents chez MB3M. */
export function mb3mReglementNote(
  rows: {
    montant: number;
    numero_mb3m: string | null;
    statut: "envoye" | "deja_dans_mb3m" | "erreur";
    erreur?: string | null;
  }[]
) {
  return rows
    .map((row) => {
      if (row.statut === "erreur") return row.erreur?.trim() || "Un règlement n’a pas pu être enregistré.";
      const amount = formatMoney(row.montant);
      const number = row.numero_mb3m ? ` (n° ${row.numero_mb3m})` : "";
      if (row.statut === "deja_dans_mb3m") return `Règlement de ${amount} déjà dans MB3M${number}.`;
      return `Règlement de ${amount} envoyé${number}.`;
    })
    .join(" ");
}
