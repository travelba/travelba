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

function clip(value: string, max = 140) {
  const flat = value.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  return flat.length <= max ? flat : `${flat.slice(0, max).trimEnd()}…`;
}

/** Un e-mail de la file et un message client, du plus ancien au plus récent. */
export function agencyAlerts(input: { emails: InboundMailAlert[]; chats: InboundChatAlert[] }): AgencyAlert[] {
  const emails = input.emails.flatMap((row) => {
    if (!row.id || !row.receivedAt) return [];
    const title = (row.subject || "").trim() || "Message reçu";
    return [
      {
        id: `mail:${row.id}`,
        at: row.receivedAt,
        title: clip(title, 80),
        body: "Un e-mail est arrivé dans la file.",
        href: "/admin/emails",
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
        href: "/admin/whatsapp",
        kicker: "WhatsApp",
      },
    ];
  });
  return [...emails, ...chats].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}
