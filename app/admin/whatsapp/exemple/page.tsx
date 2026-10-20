import { notFound } from "next/navigation";
import { WhatsappInbox } from "@/components/admin/WhatsappInbox";
import { foldThreads, type InboxMessage } from "@/lib/crm/whatsapp-inbox";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";

export const metadata = { title: "WhatsApp — exemple" };

const MESSAGES: InboxMessage[] = [
  {
    id: "m1",
    phone: "+33601020304",
    customerId: "client-exemple",
    customerName: "Camille Martin",
    bookingId: "sejour-exemple",
    bookingReference: "TB-EXEMPLE · Tel Aviv · Seychelles",
    direction: "inbound",
    body: "Bonjour, une question avant le départ.",
    createdAt: "2026-10-20T08:12:00Z",
    status: "received",
    templateKey: null,
    authorName: null,
    mediaPath: null,
    tools: [],
    requestId: "req-exemple",
  },
  {
    id: "m2",
    phone: "+33601020304",
    customerId: "client-exemple",
    customerName: "Camille Martin",
    bookingId: "sejour-exemple",
    bookingReference: "TB-EXEMPLE",
    direction: "outbound",
    body: "Bonjour Camille, je regarde le transfert de Tel Aviv.",
    createdAt: "2026-10-20T08:14:00Z",
    status: "read",
    templateKey: "chat",
    authorName: null,
    mediaPath: null,
    tools: ["chercher_hotel"],
    requestId: null,
  },
  {
    id: "m3",
    phone: "+33601020304",
    customerId: "client-exemple",
    customerName: "Camille Martin",
    bookingId: "sejour-exemple",
    bookingReference: "TB-EXEMPLE",
    direction: "outbound",
    body: "Victoria a repris le fil. Le transfert est confirmé.",
    createdAt: "2026-10-20T08:20:00Z",
    status: "delivered",
    templateKey: "staff",
    authorName: "Victoria Bernard",
    mediaPath: "whatsapp/exemple/transfert.pdf",
    tools: [],
    requestId: null,
  },
  {
    id: "m4",
    phone: "+33611111111",
    customerId: null,
    customerName: null,
    bookingId: null,
    bookingReference: null,
    direction: "inbound",
    body: "Bonjour, je cherche un hôtel à Lisbonne.",
    createdAt: "2026-10-20T09:40:00Z",
    status: "received",
    templateKey: null,
    authorName: null,
    mediaPath: null,
    tools: [],
    requestId: null,
  },
];

/** Données fictives, visibles seulement en développement. */
export default async function WhatsappExamplePage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { vue } = await searchParams;
  const threads = foldThreads(MESSAGES, { paused: ["+33601020304"], escalated: ["+33601020304"] });
  const fiche = vue === "fiche";
  const activeKey = "+33601020304";
  const activeMessages = MESSAGES.filter((row) => row.phone === activeKey);
  return (
    <div className="space-y-4">
      <div>
        <PageEyebrow>{fiche ? "Fiche client" : "Concierge"}</PageEyebrow>
        <PageTitle
          title={fiche ? "Camille Martin" : "WhatsApp"}
          subtitle={fiche ? "Onglet WhatsApp · données d’exemple" : "Données d’exemple, rien n’est envoyé."}
        />
      </div>
      <WhatsappInbox
        embedded={fiche}
        threads={threads}
        messages={activeMessages}
        activeKey={activeKey}
        proposals={[{ id: "prop-exemple", draft: "Bonjour Camille, le transfert est prêt. Souhaitez-vous que je le confirme ?" }]}
        templates={[{ key: "sejour_texte", label: "Le séjour est dans l’espace" }]}
        windowOpen
        previewBlocked
      />
    </div>
  );
}
