/**
 * Corps de mail que Gmail ne rend pas : on le note dans `warnings` (jsonb déjà en place, pas de migration)
 * pour ne pas relire la même ligne à chaque cron, et on n’insiste plus au-delà de 14 jours.
 */
export const EMAIL_BODY_MISSING_MARK = { file: "gmail", message: "corps-absent" } as const;

export const BODY_BACKFILL_WINDOW_DAYS = 14;

type Warning = { file?: string | null; message?: string | null };

export function hasBodyMissingMark(row: { warnings?: Warning[] | null }) {
  return (row.warnings || []).some(
    (warning) => warning?.file === EMAIL_BODY_MISSING_MARK.file && warning?.message === EMAIL_BODY_MISSING_MARK.message
  );
}

/** Les avertissements existants, propres, plus le marqueur (une seule fois). */
export function markBodyMissing(warnings: Warning[] | null | undefined) {
  const next = (warnings || [])
    .filter((warning) => warning && typeof warning.file === "string" && typeof warning.message === "string")
    .map((warning) => ({ file: warning.file as string, message: warning.message as string }));
  if (!hasBodyMissingMark({ warnings: next })) next.push({ ...EMAIL_BODY_MISSING_MARK });
  return next;
}

/** Borne basse `received_at` du rattrapage : 14 jours avant `now`, en ISO. */
export function bodyBackfillSince(now = Date.now()) {
  return new Date(now - BODY_BACKFILL_WINDOW_DAYS * 86_400_000).toISOString();
}
