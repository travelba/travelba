"use client";

import { AgencyAttention } from "@/components/admin/AgencyAttention";
import { WhatsappDock } from "@/components/admin/WhatsappDock";
import { agencyAttentionLines } from "@/lib/crm/admin-now";
import { foldThreads, type InboxDossier, type InboxMessage } from "@/lib/crm/whatsapp-inbox";
import type { PendingDraft } from "@/lib/crm/whatsapp-pending";

const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
const readStamp = new Date(Date.now() - 30 * 60 * 1000).toISOString();

const MESSAGES: InboxMessage[] = [
  {
    id: "ancien-lu",
    phone: "+33601020304",
    customerId: "client-exemple",
    customerName: "Camille Martin",
    bookingId: "sejour-exemple",
    bookingReference: "TB-EXEMPLE",
    direction: "inbound",
    body: "Le transfert est confirmé ?",
    createdAt: twoHoursAgo,
    status: "received",
    templateKey: null,
    authorName: null,
    mediaPath: null,
    tools: [],
    requestId: null,
  },
  {
    id: "robot",
    phone: "+33601020304",
    customerId: "client-exemple",
    customerName: "Camille Martin",
    bookingId: "sejour-exemple",
    bookingReference: "TB-EXEMPLE",
    direction: "outbound",
    body: "Le transfert de Tel Aviv est prévu. Passeport 12AB67890 reste au coffre.",
    createdAt: hourAgo,
    status: "read",
    templateKey: "chat",
    authorName: null,
    mediaPath: null,
    tools: [],
    requestId: null,
  },
  {
    id: "non-lu",
    phone: "+33611111111",
    customerId: null,
    customerName: null,
    bookingId: null,
    bookingReference: null,
    direction: "inbound",
    body: "Bonjour, je cherche un hôtel à Lisbonne.",
    createdAt: threeHoursAgo,
    status: "received",
    templateKey: null,
    authorName: null,
    mediaPath: null,
    tools: [],
    requestId: "demande-exemple",
  },
];

const DRAFTS: PendingDraft[] = [
  {
    id: "veille",
    followupId: "suivi-exemple",
    title: "Veille du départ",
    who: "Camille Martin",
    body: "Camille, votre vol pour Tel Aviv est demain.",
    href: "/agence-exemple?discussions=tous&fil=%2B33601020304",
    sendable: true,
    reason: "Fenêtre de 24 h ouverte.",
  },
  {
    id: "merci",
    followupId: "suivi-hors",
    title: "Retour",
    who: "Camille Martin",
    body: "Merci pour ce séjour à Tel Aviv.",
    href: "/agence-exemple?discussions=tous&fil=%2B33601020304",
    sendable: false,
    reason: "Hors fenêtre de 24 h. Le modèle n’est pas soumis.",
  },
];

const DOSSIER: InboxDossier = {
  reference: "TB-EXEMPLE",
  place: "Tel Aviv",
  dates: "20 oct. 2026 – 26 oct. 2026",
  visibility: "En préparation",
  travelers: ["Camille", "Inès"],
  missingPassports: 1,
  request: null,
};

/** La barre de droite, avec un tableau de bord fictif. Aucun appel. */
export function AgencePreview({ discussions, fil }: { discussions?: string | null; fil?: string | null }) {
  const threads = foldThreads(MESSAGES, {
    paused: [],
    escalated: ["+33611111111"],
    readAt: { "+33601020304": readStamp },
  });
  const lines = agencyAttentionLines({
    pendingMessages: 2,
    conciergeRequests: 1,
    departures72h: 2,
    missingDocuments: 1,
    importToReview: 4,
  }).map((line) => ({
    ...line,
    href: line.href.startsWith("/admin?") ? line.href.replace("/admin?", "/agence-exemple?") : line.href,
  }));
  const openKey = fil || "+33601020304";

  return (
    <div className="admin-af flex min-h-screen bg-[#f7f4ef]">
      <div className="min-w-0 flex-1 px-4 py-6">
        <header className="mb-6 flex items-center justify-between">
          <p className="font-display text-sm font-semibold text-[#0B192C]">Espace agence</p>
          <p className="text-xs text-[#8a7350]">Aperçu · rien n’est envoyé</p>
        </header>
        <AgencyAttention lines={lines} documents={[{ bookingId: "sejour-exemple", label: "Inès · TB-EXEMPLE · Tel Aviv", count: 1 }]} />
      </div>
      <WhatsappDock
        threads={threads}
        templates={[{ key: "sejour_texte", label: "Le séjour est dans l’espace" }]}
        previewBlocked
        messagesByKey={{
          "+33601020304": MESSAGES.filter((row) => row.phone === "+33601020304"),
          "+33611111111": MESSAGES.filter((row) => row.phone === "+33611111111"),
        }}
        dossiersByKey={{ "+33601020304": DOSSIER }}
        drafts={DRAFTS}
        focus={discussions || "tous"}
        openFil={openKey}
        initialPanelOpen
        initialDrawer
        initialTabs={[{ key: openKey, expanded: true }]}
        persist={false}
        live={false}
      />
    </div>
  );
}
