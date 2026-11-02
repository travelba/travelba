import { ADMIN_ROUTES } from "@/lib/crm/admin-nav";

export type AdminTodoLine = { id: string; label: string; href: string; count: number };

function plural(count: number, one: string, many: string) {
  return `${count} ${count > 1 ? many : one}`;
}

export type AdminTodoInput = {
  emails: number;
  le: number;
  formalities: number;
  services: number;
  departTomorrow: number;
  expiring: number;
  whatsapp: number;
  unread?: number;
  /** Courriers hôtel où l’hôtel a écrit en dernier. */
  hotels?: number;
  /** Virements Revolut et paiements Stripe reçus, pas encore crédités. */
  credits?: number;
  /** Sorties Pliant et débits Revolut pas encore pointés. */
  costs?: number;
};

/**
 * « À faire aujourd’hui » de l’accueil : toutes les files, dans l’ordre du travail de l’agence
 * (WhatsApp, e-mails, Little Emperors, réponses d’hôtel, crédits à encaisser, coûts à pointer,
 * formalités, services, départs demain, pièces). Chaque pastille ouvre la vue filtrée.
 * Les compteurs à zéro n’apparaissent pas.
 */
export function adminTodoLines(input: AdminTodoInput): AdminTodoLine[] {
  const lines: AdminTodoLine[] = [
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
      id: "emails",
      count: input.emails,
      label: `${plural(input.emails, "e-mail", "e-mails")} à traiter`,
      href: `${ADMIN_ROUTES.boite}?onglet=fournisseurs`,
    },
    {
      id: "le",
      count: input.le,
      label: `${plural(input.le, "séjour Little Emperors", "séjours Little Emperors")} sans dossier`,
      href: `${ADMIN_ROUTES.boite}?onglet=fournisseurs&source=little-emperors`,
    },
    {
      id: "hotels",
      count: input.hotels || 0,
      label: `${plural(input.hotels || 0, "réponse d’hôtel", "réponses d’hôtel")} à traiter`,
      href: `${ADMIN_ROUTES.boite}?onglet=hotels`,
    },
    {
      id: "credits",
      count: input.credits || 0,
      label: `${plural(input.credits || 0, "paiement reçu", "paiements reçus")} à encaisser`,
      href: `${ADMIN_ROUTES.argent}?onglet=a-encaisser`,
    },
    {
      id: "costs",
      count: input.costs || 0,
      label: `${plural(input.costs || 0, "coût", "coûts")} à pointer`,
      href: `${ADMIN_ROUTES.argent}?onglet=a-pointer`,
    },
    {
      id: "formalities",
      count: input.formalities,
      label: `${plural(input.formalities, "formalité ouverte", "formalités ouvertes")}`,
      href: `${ADMIN_ROUTES.dossiers}?vue=formalites`,
    },
    {
      id: "services",
      count: input.services,
      label: `${plural(input.services, "service", "services")} à confirmer`,
      href: `${ADMIN_ROUTES.dossiers}?vue=services`,
    },
    {
      id: "depart-tomorrow",
      count: input.departTomorrow,
      label: `${plural(input.departTomorrow, "départ", "départs")} demain`,
      href: `${ADMIN_ROUTES.dossiers}?etat=a-venir`,
    },
    {
      id: "expiring",
      count: input.expiring,
      label: `${plural(input.expiring, "pièce", "pièces")} à échéance`,
      href: `${ADMIN_ROUTES.clients}?filtre=echeance`,
    },
  ];
  return lines.filter((line) => line.count > 0);
}

/** Total des lignes : badge de l’Accueil. */
export function adminTodoTotal(lines: AdminTodoLine[]) {
  return lines.reduce((sum, line) => sum + line.count, 0);
}
