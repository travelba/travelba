import { notFound } from "next/navigation";
import { PreviewMobileBar } from "@/app/apercu/discussions/mobile-bar";
import { WhatsappDock } from "@/components/admin/WhatsappDock";
import { Icon } from "@/components/crm/icons";
import type { InboxMessage, InboxThread } from "@/lib/crm/whatsapp-inbox";

export const metadata = { title: "Discussions — exemple", robots: { index: false, follow: false } };

const THREADS: InboxThread[] = [
  {
    key: "+33601020304",
    phone: "+33601020304",
    customerId: "client-camille",
    customerName: "Camille Martin",
    prospect: false,
    bookingId: "sejour-exemple",
    bookingReference: "TB-EXEMPLE",
    lastBody: "Le transfert est confirmé.",
    lastAt: "2026-10-20T10:20:00Z",
    unread: 0,
    status: "agency",
  },
  {
    key: "+33611111111",
    phone: "+33611111111",
    customerId: null,
    customerName: null,
    prospect: true,
    bookingId: null,
    bookingReference: null,
    lastBody: "Je cherche un hôtel à Lisbonne.",
    lastAt: "2026-10-20T10:05:00Z",
    unread: 1,
    status: "robot",
  },
  {
    key: "+33622222222",
    phone: "+33622222222",
    customerId: "client-noah",
    customerName: "Noah Cohen",
    prospect: false,
    bookingId: "sejour-noah",
    bookingReference: "TB-NOAH",
    lastBody: "Merci, à très vite.",
    lastAt: "2026-10-20T09:10:00Z",
    unread: 2,
    status: "robot",
  },
  {
    key: "+33633333333",
    phone: "+33633333333",
    customerId: "client-lea",
    customerName: "Léa Bernard",
    prospect: false,
    bookingId: "sejour-lea",
    bookingReference: "TB-LEA",
    lastBody: "Le Concierge a noté la question.",
    lastAt: "2026-10-20T08:40:00Z",
    unread: 0,
    status: "agency",
  },
];

const CAMILLE: InboxMessage[] = [
  {
    id: "m1",
    phone: "+33601020304",
    customerId: "client-camille",
    customerName: "Camille Martin",
    bookingId: "sejour-exemple",
    bookingReference: "TB-EXEMPLE",
    direction: "inbound",
    body: "Bonjour, une question avant le départ.",
    createdAt: "2026-10-20T08:12:00Z",
    status: "received",
    templateKey: null,
    authorName: null,
    mediaPath: null,
    tools: [],
    requestId: null,
  },
  {
    id: "m2",
    phone: "+33601020304",
    customerId: "client-camille",
    customerName: "Camille Martin",
    bookingId: "sejour-exemple",
    bookingReference: "TB-EXEMPLE",
    direction: "outbound",
    body: "Je regarde le transfert de Tel Aviv.",
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
    customerId: "client-camille",
    customerName: "Camille Martin",
    bookingId: "sejour-exemple",
    bookingReference: "TB-EXEMPLE",
    direction: "outbound",
    body: "Victoria a repris le fil. Le transfert est confirmé.",
    createdAt: "2026-10-20T10:20:00Z",
    status: "delivered",
    templateKey: "staff",
    authorName: "Victoria Bernard",
    mediaPath: null,
    tools: [],
    requestId: null,
  },
];

/** Données fictives, hors production. Le panneau et les onglets sont ceux de l’agence. */
export default async function DiscussionsPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ tiroir?: string; ouvert?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { tiroir, ouvert } = await searchParams;
  const open = ouvert === "1";
  return (
    <div className="admin-af min-h-screen bg-[#f6f3ee] text-[#0B192C]">
      <aside className="fixed inset-y-0 left-0 hidden w-72 bg-[#0B192C] px-5 py-6 text-white lg:block">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#C5A880]">Travel Business</p>
        <p className="mt-1 text-sm">Espace agence</p>
        <p className="mt-8 text-sm text-white/80">Réservations</p>
      </aside>
      <div className="lg:pl-72">
        <div className="flex min-w-0 items-stretch">
          <div className="min-w-0 flex-1">
            <header className="sticky top-0 z-40 bg-[#0B192C] pt-[env(safe-area-inset-top)] text-white lg:hidden">
              <div className="flex h-14 items-center justify-between gap-2 px-3">
                <p className="truncate text-sm font-semibold">Réservations</p>
                <button type="button" aria-label="Rechercher" className="inline-flex h-11 w-11 items-center justify-center rounded-lg">
                  <Icon name="search" className="h-5 w-5" />
                </button>
              </div>
            </header>
            <header className="sticky top-0 z-30 hidden h-20 items-center border-b border-[var(--border)] bg-[#faf9f6]/90 px-8 lg:flex">
              <p className="text-sm text-[#8a7350]">Dossier</p>
            </header>
            <main className="px-4 pt-6 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:px-8 lg:py-8">
              <p className="text-xs uppercase tracking-[0.14em] text-[#8a7350]">Réservations</p>
              <h1 className="mt-1 font-display text-3xl text-[#0B192C]">Tel Aviv et les Seychelles</h1>
              <p className="mt-2 text-sm text-[#5c5346]">TB-EXEMPLE · 24 oct. — 4 nov. 2026 · En préparation</p>
              <div className="mt-6 grid gap-3">
                <article className="rounded-3xl border border-[var(--border)] bg-white p-4">
                  <p className="text-sm font-medium">Paris → Tel Aviv</p>
                  <p className="text-xs text-[#8a7350]">CDG → TLV · 24 oct.</p>
                </article>
                <article className="rounded-3xl border border-[var(--border)] bg-white p-4">
                  <p className="text-sm font-medium">Villa aux Seychelles</p>
                  <p className="text-xs text-[#8a7350]">28 oct. — 4 nov.</p>
                </article>
              </div>
            </main>
          </div>
          <WhatsappDock
            threads={THREADS}
            messagesByKey={{ "+33601020304": CAMILLE }}
            templates={[{ key: "sejour_texte", label: "Le séjour est dans l’espace" }]}
            previewBlocked
            live={false}
            persist={false}
            initialPanelOpen={open}
            initialDrawer={tiroir === "1"}
            initialTabs={
              open
                ? [
                    { key: "+33611111111", expanded: false },
                    { key: "+33601020304", expanded: true },
                  ]
                : []
            }
          />
        </div>
      </div>
      <PreviewMobileBar />
    </div>
  );
}
