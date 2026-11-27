export type TrainJournalEntry = {
  at: string;
  texte: string;
  ia: boolean;
  kind: string;
};

export function readTrainJournal(value: unknown): TrainJournalEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const item = row as { at?: unknown; texte?: unknown; ia?: unknown; kind?: unknown };
    const texte = typeof item.texte === "string" ? item.texte.trim() : "";
    if (!texte) return [];
    return [
      {
        at: typeof item.at === "string" ? item.at : "",
        texte: texte.slice(0, 400),
        ia: item.ia === true,
        kind: typeof item.kind === "string" ? item.kind.slice(0, 40) : "",
      },
    ];
  });
}

export function appendTrainJournal(current: unknown, entry: TrainJournalEntry) {
  return [...readTrainJournal(current).slice(-39), entry];
}

/** Automatique coupé : pause ou prise en main. */
export function trainAutomationOff(row: { pause?: boolean | null; prise_en_main?: boolean | null }) {
  return Boolean(row.pause || row.prise_en_main);
}

/** L’IA répond si la clé existe, le global est ouvert, la demande ne la coupe pas, et l’automatique tourne. */
export function trainIaEnabled(input: {
  key: string;
  globalOn: boolean;
  ia: boolean | null;
  pause?: boolean | null;
  prise_en_main?: boolean | null;
}) {
  if (!input.key || trainAutomationOff(input)) return false;
  if (input.ia === false) return false;
  if (input.ia === true) return true;
  return input.globalOn;
}
