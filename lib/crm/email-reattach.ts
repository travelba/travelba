import { EMAIL_INBOX_QUEUE_STATUSES } from "@/lib/crm/types";

export type TreatedEmailGate =
  | { repartir: false }
  | { repartir: true; conserver: string | null }
  | { error: string };

/**
 * Un mail encore dans la file se dépose comme d’habitude.
 * Un mail déjà traité ne se dépose à nouveau que si `repartir` est vrai,
 * et seulement vers un autre dossier. Le premier dossier garde ses pièces.
 */
export function treatedEmailGate(
  status: string,
  createdBookingId: string | null,
  targetId: string,
  repartir: boolean
): TreatedEmailGate {
  if ((EMAIL_INBOX_QUEUE_STATUSES as readonly string[]).includes(status)) return { repartir: false };
  if (!repartir) return { error: "Cet e-mail est déjà traité." };
  if (status !== "attached") return { error: "Cet e-mail est déjà traité." };
  if (!targetId) return { error: "Choisissez un autre dossier." };
  if (createdBookingId && createdBookingId === targetId) {
    return { error: "Ce mail est déjà déposé sur ce dossier. Choisissez un autre dossier." };
  }
  return { repartir: true, conserver: createdBookingId };
}
