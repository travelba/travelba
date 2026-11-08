import { ADMIN_ROUTES } from "@/lib/crm/admin-nav";
import { stayDatesOpen } from "@/lib/crm/stay-moment";
import { deskNeedsAttention } from "@/lib/crm/hotel-desk";
import { HOTEL_DESK_STATUSES, isActiveItem, type HotelDeskStatus } from "@/lib/crm/types";

export type AdminTodoLine = { id: string; label: string; href: string; count: number };

function plural(count: number, one: string, many: string) {
  return `${count} ${count > 1 ? many : one}`;
}

export type AdminTodoInput = {
  /** Demandes WhatsApp ouvertes. */
  whatsapp: number;
  /** Fils WhatsApp avec un message client non lu. */
  unread?: number;
  /** Courriers hôtel où l’hôtel a écrit en dernier. */
  hotels?: number;
  /** Liens de paiement hôtel à envoyer ou à relancer. */
  paymentLinks: number;
  /** Formalités visa encore ouvertes. */
  visas: number;
  /** Enregistrements en ligne ouverts et pré-check-in hôtel dus. */
  checkins: number;
};

/**
 * « À faire aujourd’hui » : seulement ce qui débloque un séjour.
 * Lien de paiement hôtel, visa, enregistrement, puis les messages à répondre
 * (WhatsApp, réponses d’hôtel). Les compteurs à zéro n’apparaissent pas.
 * E-mails, Little Emperors, encaissements, coûts et pièces à échéance restent
 * dans leurs écrans (Boîte, Argent, Clients), pas dans cette liste.
 */
export function adminTodoLines(input: AdminTodoInput): AdminTodoLine[] {
  const lines: AdminTodoLine[] = [
    {
      id: "payment-links",
      count: input.paymentLinks,
      label: `${plural(input.paymentLinks, "lien de paiement hôtel", "liens de paiement hôtel")} à traiter`,
      href: ADMIN_ROUTES.dossiers,
    },
    {
      id: "visas",
      count: input.visas,
      label: `${plural(input.visas, "visa", "visas")} à traiter`,
      href: `${ADMIN_ROUTES.dossiers}?vue=formalites`,
    },
    {
      id: "checkins",
      count: input.checkins,
      label: `${plural(input.checkins, "enregistrement", "enregistrements")} à faire`,
      href: ADMIN_ROUTES.dossiers,
    },
    {
      id: "whatsapp-unread",
      count: input.unread || 0,
      label: `${plural(input.unread || 0, "fil WhatsApp non lu", "fils WhatsApp non lus")}`,
      href: `${ADMIN_ROUTES.boite}?onglet=whatsapp&filtre=non-lus`,
    },
    {
      id: "whatsapp",
      count: input.whatsapp,
      label: `${plural(input.whatsapp, "demande WhatsApp", "demandes WhatsApp")} à traiter`,
      href: `${ADMIN_ROUTES.boite}?onglet=whatsapp`,
    },
    {
      id: "hotels",
      count: input.hotels || 0,
      label: `${plural(input.hotels || 0, "réponse d’hôtel", "réponses d’hôtel")} à traiter`,
      href: `${ADMIN_ROUTES.boite}?onglet=hotels`,
    },
  ];
  return lines.filter((line) => line.count > 0);
}

/** Total des lignes : badge de l’Accueil. */
export function adminTodoTotal(lines: AdminTodoLine[]) {
  return lines.reduce((sum, line) => sum + line.count, 0);
}

/** Séjour encore ouvert : pas annulé, pas archivé, retour pas passé. */
export function tripStillOpen(
  row: { status?: string | null; archived_at?: string | null; end_date?: string | null },
  today: string
) {
  if (row.archived_at) return false;
  if (row.status === "cancelled") return false;
  return stayDatesOpen(row.end_date, today);
}

function deskStatus(value: string): HotelDeskStatus | null {
  return (HOTEL_DESK_STATUSES as readonly string[]).includes(value) ? (value as HotelDeskStatus) : null;
}

/**
 * Courrier hôtel dû aujourd’hui : « due » ou « follow_up », ou un brouillon
 * dont l’échéance est atteinte. Une réponse d’hôtel est une autre ligne.
 */
export function hotelLetterNeedsAction(row: { status: string; dueOn: string | null }, today: string) {
  const status = deskStatus(row.status);
  if (!status) return false;
  return deskNeedsAttention({ status, due_on: row.dueOn }, today);
}

export type TripLetter = {
  kind: string;
  status: string;
  dueOn: string | null;
  live: boolean;
  itemActive: boolean;
};

/** Lettres d’un type (lien de paiement, pré-check-in) qui attendent, sur un séjour ouvert. */
export function countTripLetters(rows: TripLetter[], kind: "payment_link" | "precheckin", today: string) {
  return rows.filter(
    (row) => row.kind === kind && row.live && row.itemActive && hotelLetterNeedsAction(row, today)
  ).length;
}

/** Parcours visa lancé, pas encore à la pièce. */
export function visaRequestNeedsAction(row: { status?: string | null; acceptedAt?: string | null }) {
  if (!row.acceptedAt) return false;
  return Boolean(row.status) && row.status !== "piece";
}

/** Avis ESTA / ETA qui demande un geste. « Valable » est une information. */
export function formalityNoticeNeedsAction(kind: string | null | undefined) {
  return Boolean(kind) && kind !== "valable";
}

export function countVisaWork(input: {
  requests: { status: string | null; acceptedAt: string | null; live: boolean }[];
  tasks: { live: boolean; open: boolean }[];
  notices: { kind: string | null; live: boolean }[];
}) {
  const requests = input.requests.filter((row) => row.live && visaRequestNeedsAction(row)).length;
  const tasks = input.tasks.filter((row) => row.live && row.open).length;
  const notices = input.notices.filter((row) => row.live && formalityNoticeNeedsAction(row.kind)).length;
  return requests + tasks + notices;
}

/** Vol dont l’enregistrement est ouvert, en cours, et pas encore fait. */
export function checkinNeedsAction(line: { alert: boolean; done: boolean; cancelled: boolean; status: string }) {
  return !line.cancelled && !line.done && (line.alert || line.status === "en_cours");
}

export function countOpenCheckins(lines: { alert: boolean; done: boolean; cancelled: boolean; status: string }[]) {
  return lines.filter(checkinNeedsAction).length;
}

export function activeStayItem(lifecycle: string | null | undefined) {
  return isActiveItem({ lifecycle });
}
