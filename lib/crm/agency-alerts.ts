/** Alertes légères du tableau de bord : e-mail entrant et WhatsApp client. Pas d’adresse, pas de numéro. */

export type AgencyAlert = {
  id: string;
  at: string;
  title: string;
  body: string;
  href: string;
  kicker: string;
};

export type InboundMailAlert = {
  id: string;
  subject: string | null;
  receivedAt: string;
};

export type InboundChatAlert = {
  id: string;
  body: string | null;
  createdAt: string;
};

export type ConciergeChangeAlert = {
  id: string;
  summary: string | null;
  createdAt: string;
  bookingId: string | null;
};

function clip(value: string, max = 140) {
  const flat = value.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  return flat.length <= max ? flat : `${flat.slice(0, max).trimEnd()}…`;
}

/** Un e-mail de la file, un message client, une modification du concierge, du plus ancien au plus récent. */
export function agencyAlerts(input: {
  emails: InboundMailAlert[];
  chats: InboundChatAlert[];
  changes?: ConciergeChangeAlert[];
}): AgencyAlert[] {
  const emails = input.emails.flatMap((row) => {
    if (!row.id || !row.receivedAt) return [];
    const title = (row.subject || "").trim() || "Message reçu";
    return [
      {
        id: `mail:${row.id}`,
        at: row.receivedAt,
        title: clip(title, 80),
        body: "Un e-mail est arrivé dans la file.",
        href: "/admin/boite?onglet=fournisseurs",
        kicker: "E-mail",
      },
    ];
  });
  const chats = input.chats.flatMap((row) => {
    if (!row.id || !row.createdAt) return [];
    return [
      {
        id: `wa:${row.id}`,
        at: row.createdAt,
        title: "Message client",
        body: clip(row.body || "") || "Un message WhatsApp est arrivé.",
        href: "/admin/boite?onglet=whatsapp&filtre=non-lus",
        kicker: "WhatsApp",
      },
    ];
  });
  const changes = (input.changes || []).flatMap((row) => {
    if (!row.id || !row.createdAt) return [];
    return [
      {
        id: `concierge:${row.id}`,
        at: row.createdAt,
        title: "Modification du concierge",
        body: clip(row.summary || "") || "Le concierge a modifié un dossier.",
        href: row.bookingId ? `/admin/reservations/${row.bookingId}` : "/admin/boite?onglet=whatsapp",
        kicker: "Concierge",
      },
    ];
  });
  return [...emails, ...chats, ...changes].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}
