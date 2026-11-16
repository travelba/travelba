/** Choix de facture MB3M sur une carte. Le type de la carte (vol, hôtel) ne change pas. */

export const MB3M_ACTIVITY_DETAIL_KEY = "mb3m_activity";

export type Mb3mActivityChoice = "land";

export function readMb3mActivityOverride(details: unknown): Mb3mActivityChoice | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const raw = (details as Record<string, unknown>)[MB3M_ACTIVITY_DETAIL_KEY];
  const parsed = parseMb3mActivityInput(raw);
  if ("error" in parsed) return null;
  return parsed.value;
}

/** Libellé lu par l’agence et par l’outil. */
export function mb3mActivityChoiceLabel(value: Mb3mActivityChoice | null) {
  return value === "land" ? "divers terrestres" : "automatique";
}

export function parseMb3mActivityInput(value: unknown): { value: Mb3mActivityChoice | null } | { error: string } {
  if (value == null) return { value: null };
  const text = String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ");
  if (!text || text === "auto" || text === "automatique") return { value: null };
  if (text === "land" || text === "22" || text === "divers terrestres" || text === "divers terrestre") {
    return { value: "land" };
  }
  return { error: "Catégorie MB3M inconnue. Choix : automatique, divers terrestres." };
}

function detailRecord(details: unknown) {
  if (!details || typeof details !== "object" || Array.isArray(details)) return {};
  return { ...(details as Record<string, unknown>) };
}

/** Pose ou retire le choix, sans toucher aux autres champs de la carte. */
export function withMb3mActivity(
  details: unknown,
  value: unknown
): { details: Record<string, unknown> } | { error: string } {
  const parsed = parseMb3mActivityInput(value);
  if ("error" in parsed) return parsed;
  const next = detailRecord(details);
  if (parsed.value === "land") next[MB3M_ACTIVITY_DETAIL_KEY] = "land";
  else delete next[MB3M_ACTIVITY_DETAIL_KEY];
  return { details: next };
}
