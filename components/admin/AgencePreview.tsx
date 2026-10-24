"use client";

import { useState } from "react";
import { AgencyAttention } from "@/components/admin/AgencyAttention";
import { WhatsappInbox } from "@/components/admin/WhatsappInbox";
import { WhatsappPendingQueue, type PendingDraft } from "@/components/admin/WhatsappPendingQueue";
import { agencyAttentionLines } from "@/lib/crm/admin-now";
import { foldThreads, type InboxMessage } from "@/lib/crm/whatsapp-inbox";

const MESSAGES: InboxMessage[] = [
  {
    id: "ancien-lu",
    phone: "+33601020304",
    customerId: "client-exemple",
    customerName: "Camille Martin",
    bookingId: "sejour-exemple",
    bookingReference: "TB-EXEMPLE · Tel Aviv",
    direction: "inbound",
    body: "Le transfert est confirmé ?",
    createdAt: "2026-10-20T08:00:00Z",
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
    bookingReference: "TB-EXEMPLE · Tel Aviv",
    direction: "outbound",
    body: "Le transfert de Tel Aviv est prévu. Passeport 12AB67890 reste au coffre.",
    createdAt: "2026-10-20T08:05:00Z",
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
    createdAt: "2026-10-19T09:00:00Z",
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
    href: "#fil",
    sendable: true,
    reason: "Fenêtre de 24 h ouverte.",
  },
  {
    id: "merci",
    followupId: "suivi-hors",
    title: "Retour",
    who: "Camille Martin",
    body: "Merci pour ce séjour à Tel Aviv.",
    href: "#fil",
    sendable: false,
    reason: "Hors fenêtre de 24 h. Le modèle n’est pas soumis.",
  },
  {
    id: "esta",
    title: "ESTA",
    who: "TB-EXEMPLE · Tel Aviv",
    body: "Le message au client se relit sur le dossier, puis Envoyer au client.",
    href: "#fil",
    sendable: false,
    reason: "Le bouton du dossier respecte la fenêtre de 24 h.",
  },
];

/** Écran agence fictif. Aucun appel, aucun client réel. */
export function AgencePreview() {
  const threads = foldThreads(MESSAGES, {
    paused: [],
    escalated: ["+33611111111"],
    readAt: { "+33601020304": "2026-10-20T08:10:00Z" },
  });
  const [activeKey, setActiveKey] = useState(threads[0]?.key || null);
  const activeMessages = MESSAGES.filter((row) => row.phone === activeKey);
  const lines = agencyAttentionLines({
    pendingMessages: 3,
    conciergeRequests: 1,
    departures72h: 2,
    missingDocuments: 1,
    importToReview: 4,
  });

  return (
    <div className="admin-af min-h-screen">
      <header className="flex items-center justify-between bg-[#0B192C] px-4 py-3 text-white">
        <p className="font-display text-sm font-semibold">Espace agence</p>
        <p className="text-xs text-[#C5A880]">Aperçu · rien n’est envoyé</p>
      </header>
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-6">
      <AgencyAttention
        lines={lines}
        documents={[{ bookingId: "sejour-exemple", label: "Inès · TB-EXEMPLE · Tel Aviv", count: 1 }]}
      />
      <div id="fil" className="space-y-4">
        <WhatsappPendingQueue drafts={DRAFTS} previewBlocked={false} offline />
        <WhatsappInbox
          threads={threads}
          messages={activeMessages}
          activeKey={activeKey}
          proposals={[{ id: "prop-exemple", draft: "Souhaitez-vous que je confirme le transfert ?" }]}
          templates={[{ key: "sejour_texte", label: "Le séjour est dans l’espace" }]}
          windowOpen={activeKey === "+33601020304"}
          previewBlocked
          offline
          dossier={
            activeKey === "+33601020304"
              ? {
                  reference: "TB-EXEMPLE",
                  place: "Tel Aviv",
                  dates: "20 oct. 2026 - 26 oct. 2026",
                  visibility: "En préparation",
                  travelers: ["Camille", "Inès"],
                  missingPassports: 1,
                  request: null,
                }
              : {
                  reference: null,
                  place: null,
                  dates: null,
                  visibility: null,
                  travelers: [],
                  missingPassports: 0,
                  request: "Question",
                }
          }
          onSelect={setActiveKey}
        />
      </div>
    </div>
    </div>
  );
}
