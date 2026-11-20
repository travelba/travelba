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
  bookingId?: string | null;
};

/** Ligne de `crm_agency_alerts` : paiement, Pliant, passeport, rôle, etc. */
export type StoredAgencyAlert = {
  id: string;
  kind: string;
  summary: string | null;
  createdAt: string;
  entityType: string | null;
  entityId: string | null;
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

export type TicketDuplicateAlert = {
  id: string;
  at: string;
  bookingId: string;
  reference?: string | null;
};

export type PaymentAlert = {
  id: string;
  summary: string | null;
  createdAt: string;
  customerId: string | null;
  /** revolut ou stripe sans client : À encaisser. Sinon la fiche. */
  queue?: boolean;
};

const ARGENT_HREF = "/admin/argent?onglet=a-encaisser";
const WHATSAPP_HREF = "/admin/boite?onglet=whatsapp&filtre=non-lus";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function noticeText(value: string | null | undefined, fallback: string, max = 140) {
  const flat = (value || "")
    .replace(/\b[A-Z]{2}\d{2}(?:\s*[A-Z0-9]){11,30}\b/gi, "")
    .replace(/\b(?:\d[ -]?){13,19}\b/g, "");
  return clip(flat, max) || fallback;
}

function isUuid(value: string | null | undefined) {
  return Boolean(value && UUID.test(value));
}

/** Message client. Le numéro n’est pas dans le lien : la Boîte ou le dossier. */
export function whatsappAlert(row: InboundChatAlert): AgencyAlert | null {
  if (!row.id || !row.createdAt) return null;
  const bookingId = (row.bookingId || "").trim();
  return {
    id: `wa:${row.id}`,
    at: row.createdAt,
    title: "Message client",
    body: noticeText(row.body, "Un message WhatsApp est arrivé."),
    href: isUuid(bookingId) ? `/admin/reservations/${bookingId}?tab=whatsapp` : WHATSAPP_HREF,
    kicker: "WhatsApp",
  };
}

const ALERT_TITLES: Record<string, string> = {
  passport_reveal: "Passeport ouvert",
  card_reveal: "Carte ouverte",
  export: "Export",
  payment: "Paiement",
  refund: "Remboursement",
  failed_login: "Connexions refusées",
  role_change: "Rôle modifié",
  pliant: "Pliant",
};

function storedHref(row: StoredAgencyAlert) {
  const id = (row.entityId || "").trim();
  const uuid = isUuid(id);
  if (row.kind === "payment") {
    if (row.entityType === "client" && uuid) return `/admin/clients/${id}`;
    return ARGENT_HREF;
  }
  if (row.kind === "role_change") return "/admin/equipe";
  if (row.entityType === "client" && uuid) return `/admin/clients/${id}`;
  if ((row.entityType === "dossier" || row.entityType === "booking") && uuid) return `/admin/reservations/${id}`;
  if ((row.kind === "card_reveal" || row.kind === "passport_reveal") && uuid) {
    return `/admin/reservations/${id}`;
  }
  if (row.entityType === "revolut" || row.entityType === "stripe") return ARGENT_HREF;
  return "/admin/journal";
}

/** Virement, Stripe ou prélèvement arrivé. Un refus, une annulation ou un seuil du journal ne comptent pas. */
export function paymentTextReceived(text: string | null | undefined) {
  const value = text || "";
  if (/refus|abandon|rejet|au-dessus du seuil|échou|prélèvement annulé/i.test(value)) return false;
  return /virement reçu|prélèvement sepa reçu|a réglé|paiement reçu/i.test(value);
}

/** Fenêtre : un encaissement reçu. Pliant, le journal et le reste restent dans leurs listes. */
export function receivedPaymentPopup(row: StoredAgencyAlert): AgencyAlert | null {
  if (row.kind !== "payment" || !row.id || !row.createdAt) return null;
  if (/refus|abandon|rejet|au-dessus du seuil|échou|prélèvement annulé/i.test(row.summary || "")) return null;
  const channel = row.entityType === "revolut" || row.entityType === "stripe";
  if (!channel && !paymentTextReceived(row.summary)) return null;
  return storedAgencyAlert(row);
}

/** Une alerte du journal, quel que soit son type. Le corps ne porte ni IBAN ni numéro de carte. */
export function storedAgencyAlert(row: StoredAgencyAlert): AgencyAlert | null {
  if (!row.id || !row.createdAt) return null;
  const label = ALERT_TITLES[row.kind] || "Alerte";
  if (row.kind === "payment") {
    const sepa = /Prélèvement SEPA (reçu|rejeté)/.test(row.summary || "");
    return {
      id: `pay:${row.id}`,
      at: row.createdAt,
      title: sepa ? "Prélèvement SEPA" : "Paiement client",
      body: noticeText(row.summary, "Un client a payé."),
      href: storedHref(row),
      kicker: "Paiement",
    };
  }
  return {
    id: `alert:${row.id}`,
    at: row.createdAt,
    title: label,
    body: noticeText(row.summary, label),
    href: storedHref(row),
    kicker: label,
  };
}

/** Un e-mail de la file, un message client, une modification du concierge, un paiement, du plus ancien au plus récent. */
export function agencyAlerts(input: {
  emails: InboundMailAlert[];
  chats: InboundChatAlert[];
  changes?: ConciergeChangeAlert[];
  payments?: PaymentAlert[];
  tickets?: TicketDuplicateAlert[];
  stored?: StoredAgencyAlert[];
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
    const alert = whatsappAlert(row);
    return alert ? [alert] : [];
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
  const tickets = (input.tickets || []).flatMap((row) => {
    if (!row.id || !row.at || !row.bookingId) return [];
    const reference = (row.reference || "").trim();
    return [
      {
        id: `ticket:${row.id}`,
        at: row.at,
        title: "Possible doublon de billets",
        body: reference ? `${reference} : un autre PNR est arrivé pour le même vol.` : "Un autre PNR est arrivé pour le même vol.",
        href: `/admin/reservations/${row.bookingId}`,
        kicker: "Billet",
      },
    ];
  });
  const payments = (input.payments || []).flatMap((row) => {
    const alert = storedAgencyAlert({
      id: row.id,
      kind: "payment",
      summary: row.summary,
      createdAt: row.createdAt,
      entityType: row.queue || !row.customerId ? null : "client",
      entityId: row.customerId,
    });
    return alert ? [alert] : [];
  });
  const stored = (input.stored || []).flatMap((row) => {
    const alert = storedAgencyAlert(row);
    return alert ? [alert] : [];
  });
  return [...emails, ...chats, ...changes, ...payments, ...tickets, ...stored].sort(
    (a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)
  );
}
