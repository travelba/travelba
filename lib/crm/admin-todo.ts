export type AdminTodoLine = { id: string; label: string; href: string; count: number };

function plural(count: number, one: string, many: string) {
  return `${count} ${count > 1 ? many : one}`;
}

/**
 * « À faire aujourd’hui » du tableau de bord : une seule liste, dans l’ordre du travail de l’agence
 * (mails à relire, Little Emperors, formalités, services, départs demain, pièces).
 * Les compteurs à zéro n’apparaissent pas.
 */
export function adminTodoLines(input: {
  emails: number;
  le: number;
  formalities: number;
  services: number;
  departTomorrow: number;
  expiring: number;
}): AdminTodoLine[] {
  const lines: AdminTodoLine[] = [
    {
      id: "emails",
      count: input.emails,
      label: `${plural(input.emails, "e-mail", "e-mails")} à relire`,
      href: "/admin/emails",
    },
    {
      id: "le",
      count: input.le,
      label: `${plural(input.le, "séjour Little Emperors", "séjours Little Emperors")} sans dossier`,
      href: "/admin/little-emperors",
    },
    {
      id: "formalities",
      count: input.formalities,
      label: `${plural(input.formalities, "formalité ouverte", "formalités ouvertes")}`,
      href: "/admin/formalites",
    },
    {
      id: "services",
      count: input.services,
      label: `${plural(input.services, "service", "services")} à confirmer`,
      href: "/admin/services",
    },
    {
      id: "depart-tomorrow",
      count: input.departTomorrow,
      label: `${plural(input.departTomorrow, "départ", "départs")} demain`,
      href: "/admin/reservations?etat=a-venir&tri=depart-asc",
    },
    {
      id: "expiring",
      count: input.expiring,
      label: `${plural(input.expiring, "pièce", "pièces")} à échéance`,
      href: "/admin/clients?pieces=echeance",
    },
  ];
  return lines.filter((line) => line.count > 0);
}

/** Total des lignes : badge du Tableau de bord. */
export function adminTodoTotal(lines: AdminTodoLine[]) {
  return lines.reduce((sum, line) => sum + line.count, 0);
}
