import { notFound } from "next/navigation";
import { AgentDigestCard } from "@/components/admin/journal/AgentDigestCard";
import { DossierHistoriqueView } from "@/components/admin/journal/DossierHistorique";
import { JournalAvatar, JournalTimeline, type JournalFeedItem } from "@/components/admin/journal/JournalTimeline";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { ACTIVITY_PERIOD_LABELS, ACTIVITY_PERIODS, JOURNAL_FAMILIES, JOURNAL_FAMILY_LABELS } from "@/lib/crm/agency-journal-kinds";
import { exampleSessionEnabled } from "@/lib/crm/example-session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Aperçu activité", robots: { index: false, follow: false } };

/**
 * Aperçu local des trois écrans du journal métier, sur des données inventées (dossiers TB-EX-…, montants fictifs).
 * Rien n’est lu ni écrit en base : la page sert à Cursor Design Mode et aux captures de vérification.
 */

const MARIE = "11111111-1111-4111-8111-000000000001";
const CORALIE = "11111111-1111-4111-8111-000000000002";
const RAPHAEL = "11111111-1111-4111-8111-000000000003";
const D101 = "22222222-2222-4222-8222-000000000101";
const D102 = "22222222-2222-4222-8222-000000000102";
const D103 = "22222222-2222-4222-8222-000000000103";

function day(hoursAgo: number) {
  const base = new Date();
  base.setUTCHours(15, 5, 0, 0);
  return new Date(base.getTime() - hoursAgo * 3600 * 1000).toISOString();
}

const dossier = (id: string, reference: string, title: string) => ({ id, reference, title });

const ROWS: JournalFeedItem[] = [
  {
    seq: 12,
    occurred_at: day(0),
    staff_id: CORALIE,
    actor: "Coralie",
    action: "send",
    entity_type: "message",
    entity_id: D102,
    summary: "E-mail envoyé à l’hôtel : demande de surclassement, 2 destinataires.",
    kind: "email_envoye",
    booking_id: D102,
    diff: { objet: "Votre séjour à Nice — surclassement" },
    dossier: dossier(D102, "TB-EX-0102", "Nice"),
  },
  {
    seq: 11,
    occurred_at: day(1),
    staff_id: MARIE,
    actor: "Marie",
    action: "update",
    entity_type: "finance",
    entity_id: "rev-1",
    summary: "Virement Revolut rapproché et crédité au client (M. Exemple).",
    kind: "paiement_rapproche",
    booking_id: D101,
    amount_cents: 320000,
    currency: "EUR",
    diff: { reste_du: { avant: "3 200 €", apres: "0 €" } },
    dossier: dossier(D101, "TB-EX-0101", "Nice, Negresco"),
  },
  {
    seq: 10,
    occurred_at: day(1.3),
    staff_id: MARIE,
    actor: "Marie",
    action: "create",
    entity_type: "card",
    entity_id: D101,
    summary: "Carte Pliant émise •••• 4821 (Exemple – Negresco – TB-EX-0101).",
    kind: "carte_emise",
    booking_id: D101,
    amount_cents: 245000,
    currency: "EUR",
    card_last4: "4821",
    diff: { carte: "Exemple – Negresco – TB-EX-0101", plafond: "2 450 €" },
    dossier: dossier(D101, "TB-EX-0101", "Nice, Negresco"),
  },
  {
    seq: 9,
    occurred_at: day(1.5),
    staff_id: MARIE,
    actor: "Marie",
    action: "create",
    entity_type: "dossier",
    entity_id: D101,
    summary: "Option posée : transfert chauffeur à l’arrivée.",
    kind: "option_posee",
    booking_id: D101,
    diff: { option: { avant: "aucune", apres: "posée, à confirmer" } },
    dossier: dossier(D101, "TB-EX-0101", "Nice, Negresco"),
  },
  {
    seq: 8,
    occurred_at: day(4),
    staff_id: RAPHAEL,
    actor: "Raphael",
    action: "update",
    entity_type: "dossier",
    entity_id: D102,
    summary: "En charge : à prendre → Coralie.",
    kind: "responsable_attribue",
    booking_id: D102,
    diff: { en_charge: { avant: "À prendre", apres: "Coralie" } },
    dossier: dossier(D102, "TB-EX-0102", "Nice"),
  },
  {
    seq: 7,
    occurred_at: day(5),
    staff_id: MARIE,
    actor: "Marie",
    action: "update",
    entity_type: "dossier",
    entity_id: D101,
    summary: "Prend le dossier en charge (avant : à prendre).",
    kind: "dossier_pris",
    booking_id: D101,
    diff: { en_charge: { avant: "À prendre", apres: "Marie" } },
    dossier: dossier(D101, "TB-EX-0101", "Nice, Negresco"),
  },
  {
    seq: 6,
    occurred_at: day(6),
    staff_id: null,
    actor: "Agence",
    actor_label: "grok",
    action: "update",
    entity_type: "dossier",
    entity_id: D101,
    summary: "Option levée : service confirmé (connecteur).",
    kind: "option_levee",
    booking_id: D101,
    dossier: dossier(D101, "TB-EX-0101", "Nice, Negresco"),
  },
  {
    seq: 5,
    occurred_at: day(26),
    staff_id: CORALIE,
    actor: "Coralie",
    action: "update",
    entity_type: "finance",
    entity_id: "pli-1",
    summary: "Fournisseur payé par carte Pliant : Mozio, rattaché au dossier.",
    kind: "fournisseur_paye",
    booking_id: D103,
    amount_cents: 18000,
    currency: "EUR",
    card_last4: "9930",
    diff: { fournisseur: { avant: "à payer", apres: "payé, carte •••• 9930" } },
    dossier: dossier(D103, "TB-EX-0103", "Deauville"),
  },
  {
    seq: 4,
    occurred_at: day(30),
    staff_id: MARIE,
    actor: "Marie",
    action: "reveal",
    entity_type: "card",
    entity_id: D101,
    summary: "Carte Pliant •••• 4821 ouverte (numéro complet).",
    kind: "carte_ouverte",
    booking_id: D101,
    card_last4: "4821",
    dossier: dossier(D101, "TB-EX-0101", "Nice, Negresco"),
  },
  {
    seq: 3,
    occurred_at: day(50),
    staff_id: MARIE,
    actor: "Marie",
    action: "create",
    entity_type: "dossier",
    entity_id: D103,
    summary: "Dossier créé.",
    kind: "dossier_cree",
    booking_id: D103,
    diff: { voyageurs: 2, destination: "Deauville" },
    dossier: dossier(D103, "TB-EX-0103", "Deauville"),
  },
  {
    seq: 2,
    occurred_at: day(52),
    staff_id: CORALIE,
    actor: "Coralie",
    action: "delete",
    entity_type: "dossier",
    entity_id: D103,
    summary: "Option annulée : accueil VIP Airport au départ.",
    kind: "option_annulee",
    booking_id: D103,
    diff: { option: { avant: "posée", apres: "annulée" } },
    dossier: dossier(D103, "TB-EX-0103", "Deauville"),
  },
  {
    seq: 1,
    occurred_at: day(70),
    staff_id: RAPHAEL,
    actor: "Raphael",
    action: "login",
    entity_type: "session",
    entity_id: null,
    summary: "Connexion.",
    kind: "connexion",
  },
];

function Chip({ active, tone, children }: { active?: boolean; tone?: "danger" | "warning"; children: React.ReactNode }) {
  const activeClass =
    tone === "danger" ? "border-[var(--admin-red)] bg-[var(--admin-red)] text-white" : "border-[var(--admin-navy)] bg-[var(--admin-navy)] text-white";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
        active ? activeClass : "border-[var(--border)] bg-white text-[var(--admin-navy)]"
      }`}
    >
      {children}
    </span>
  );
}

export default async function ActivitePreviewPage({ searchParams }: { searchParams: Promise<{ partie?: string }> }) {
  if (!exampleSessionEnabled()) notFound();
  const partie = (await searchParams).partie;
  const showDossier = !partie || partie === "dossier";
  const showAgence = !partie || partie === "agence";
  const showAgent = !partie || partie === "agent";
  const marie = ROWS.filter((row) => row.staff_id === MARIE);
  const dossierRows = ROWS.filter((row) => row.booking_id === D101);
  return (
    <main className="admin-af min-h-screen">
      <div className="mx-auto max-w-6xl space-y-12 px-4 py-8">
      {showDossier ? (
        <section>
          <PageEyebrow>Dossier TB-EX-0101 · aperçu</PageEyebrow>
          <PageTitle title="Historique" subtitle="Onglet du dossier : qui a fait quoi, quand, et l’avant/après au clic." />
          <div className="admin-af-card mt-6 mb-4 grid gap-3 rounded-3xl p-5 sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Créé par</p>
              <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-[var(--admin-navy)]">
                <JournalAvatar name="Marie" colorKey={MARIE} size={24} /> Marie
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">En charge</p>
              <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-[var(--admin-navy)]">
                <JournalAvatar name="Marie" colorKey={MARIE} size={24} /> Marie
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Intervenants</p>
              <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-[var(--admin-navy)]">
                <JournalAvatar name="Marie" colorKey={MARIE} size={24} />
                <JournalAvatar name="connecteur grok" colorKey="grok" size={24} /> Marie, connecteur grok
              </p>
            </div>
          </div>
          <DossierHistoriqueView rows={dossierRows} />
        </section>
      ) : null}

      {showAgence ? (
        <section>
          <PageEyebrow>Espace agence · aperçu</PageEyebrow>
          <PageTitle title="Activité de l’agence" subtitle="Les cartes en rouge, les paiements et fournisseurs en orange." />
          <div className="admin-af-card mt-6 space-y-3 rounded-3xl p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Période</span>
              {ACTIVITY_PERIODS.map((period) => (
                <Chip key={period} active={period === "semaine"}>
                  {ACTIVITY_PERIOD_LABELS[period]}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Collègue</span>
              <Chip active>Tous</Chip>
              {[
                [MARIE, "Marie"],
                [CORALIE, "Coralie"],
                [RAPHAEL, "Raphael"],
              ].map(([id, name]) => (
                <Chip key={id}>
                  <JournalAvatar name={name} colorKey={id} size={18} />
                  {name}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Type</span>
              <Chip active>Tout</Chip>
              <Chip tone="danger">Cartes et paiements seulement</Chip>
              {JOURNAL_FAMILIES.map((family) => (
                <Chip key={family}>{JOURNAL_FAMILY_LABELS[family]}</Chip>
              ))}
            </div>
          </div>
          <div className="admin-af-card mt-6 rounded-3xl p-5">
            <JournalTimeline items={ROWS} showDossier />
          </div>
        </section>
      ) : null}

      {showAgent ? (
        <section>
          <PageEyebrow>Équipe · aperçu</PageEyebrow>
          <PageTitle title="Marie" subtitle="Agent · résumé du jour sur sa fiche." />
          <div className="mt-6">
            <AgentDigestCard
              staffId={MARIE}
              name="Marie"
              digest={{
                ownedCount: 4,
                actionsToday: 5,
                sensitiveToday: 2,
                lastAt: marie[0]?.occurred_at ?? null,
                recent: marie.slice(0, 4),
              }}
            />
          </div>
        </section>
      ) : null}
      </div>
    </main>
  );
}
