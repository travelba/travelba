import { Suspense, type ReactNode } from "react";
import { notFound } from "next/navigation";
import { AdminNav } from "@/components/admin/AdminNav";
import { TrainRequestButton, type TrainRequestFace } from "@/components/admin/TrainRequestButton";
import { ServiceInsert } from "@/components/admin/ServiceInsert";
import type { CrmBookingItem } from "@/lib/crm/types";
import { EMPTY_NAV_COUNTS } from "@/lib/crm/admin-nav";
import { exampleSessionEnabled } from "@/lib/crm/example-session";
import { TRAIN_DEFAULT_OUTBOUND, TRAIN_DEFAULT_RETURN, trainFormDefaults } from "@/lib/crm/train-request";
import { trainProgress, type TrainProgressInput } from "@/lib/crm/train-progress";
import { TrainRequestTrack, TrainRequestTrackView } from "@/components/admin/TrainRequestTrack";
import type { TrainOffer } from "@/lib/crm/train-whatsapp";
import { emptyDockSnapshot } from "@/lib/crm/whatsapp-dock-load";

const TRAVELERS = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Camille Martin" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Hugo Martin" },
];

const KNOWN = trainFormDefaults({
  homeCity: "Paris",
  hotels: [{ city: "Lyon", start: "2026-06-01", end: "2026-06-02" }],
});

const UNKNOWN = trainFormDefaults({
  homeCity: "",
  hotels: [{ city: "Lyon", start: "2026-06-01", end: "2026-06-02" }],
});

const MONTPELLIER = trainFormDefaults({
  homeCity: "Paris",
  hotels: [{ city: "Montpellier", start: "2027-03-29", end: "2027-03-30" }],
});

const BENJAMIN = [{ id: "33333333-3333-4333-8333-333333333333", name: "Benjamin Boukris" }];

const CREATED: TrainRequestFace = {
  statut: "Nouvelle",
  trajet: "Paris → Lyon",
  aller: `1 juin 2026 · ${TRAIN_DEFAULT_OUTBOUND}`,
  retour: `2 juin 2026 · ${TRAIN_DEFAULT_RETURN}`,
  voyageurs: ["Camille Martin", "Hugo Martin"],
  placement: "Côte à côte ou face à face.",
};

function fakeItem(partial: Pick<CrmBookingItem, "id" | "kind" | "title" | "start_at" | "end_at" | "details">): CrmBookingItem {
  return {
    booking_id: "apercu",
    supplier: null,
    confirmation_ref: null,
    amount: null,
    include_in_ledger: false,
    sort_order: 1,
    visible_to_client: false,
    source_document_id: null,
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    ...partial,
  };
}

const HOTEL = fakeItem({
  id: "hotel-lyon",
  kind: "hotel",
  title: "Hôtel Lyon",
  start_at: "2026-06-01T15:00:00",
  end_at: "2026-06-02T11:00:00",
  details: { city: "Lyon" },
});

function Step({ title, meta, badge }: { title: string; meta: string; badge?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--admin-navy)]">
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold">{title}</p>
        {badge ? <span className="rounded-full bg-[#f8f3eb] px-2 py-0.5 text-xs font-semibold ring-1 ring-[var(--admin-gold)]">{badge}</span> : null}
      </div>
      <p className="mt-1 text-xs text-muted">{meta}</p>
    </div>
  );
}

const OFFRES: TrainOffer[] = [
  {
    numero: "6255",
    depart_gare: "Paris Gare de Lyon",
    arrivee_gare: "Montpellier Sud de France",
    date: "2027-03-29",
    heure_depart: "08:52",
    heure_arrivee: "12:10",
    duree: "3h18",
    prix: { "2de": { non_remboursable: 74 }, "1re": { flex: 184, non_remboursable: 91 } },
  },
  {
    numero: "12339",
    depart_gare: "Paris Gare de Lyon",
    arrivee_gare: "Montpellier Saint-Roch",
    date: "2027-03-29",
    heure_depart: "11:46",
    heure_arrivee: "15:15",
    duree: "3h29",
    prix: { "2de": { non_remboursable: 137 }, "1re": { non_remboursable: 181 } },
  },
  {
    numero: "12337",
    depart_gare: "Paris Gare de Lyon",
    arrivee_gare: "Montpellier Saint-Roch",
    date: "2027-03-29",
    heure_depart: "14:42",
    heure_arrivee: "18:12",
    duree: "3h30",
    prix: { "2de": { non_remboursable: 137 }, "1re": { non_remboursable: 181 } },
  },
];
const RETOURS: TrainOffer[] = [
  {
    numero: "6206",
    depart_gare: "Montpellier Saint-Roch",
    arrivee_gare: "Paris Gare de Lyon",
    date: "2027-03-30",
    heure_depart: "16:49",
    heure_arrivee: "20:18",
    duree: "3h29",
    prix: { "2de": { non_remboursable: 74 }, "1re": { non_remboursable: 143 } },
  },
  {
    numero: "6873",
    depart_gare: "Montpellier Saint-Roch",
    arrivee_gare: "Paris Gare de Lyon",
    date: "2027-03-30",
    heure_depart: "18:02",
    heure_arrivee: "22:04",
    duree: "4h02",
    prix: { "2de": { non_remboursable: 163 }, "1re": { flex: 266, non_remboursable: 174 } },
  },
  {
    numero: "6210",
    depart_gare: "Montpellier Saint-Roch",
    arrivee_gare: "Paris Gare de Lyon",
    date: "2027-03-30",
    heure_depart: "19:49",
    heure_arrivee: "23:21",
    duree: "3h32",
    prix: { "2de": { non_remboursable: 51 }, "1re": { non_remboursable: 62 } },
  },
];

const TRAJET = {
  depart: "Paris",
  arrivee: "Montpellier",
  prenom: "Camille",
  createdAt: "2026-11-27T08:58:04.219Z",
  updatedAt: "2026-11-27T08:58:04.219Z",
  retourDate: "2027-03-30",
};

function suiviDe(partial: Partial<TrainProgressInput>) {
  return trainProgress({
    status: "nouvelle",
    step: "aller",
    createdAt: "2026-11-27T08:00:00.000Z",
    updatedAt: "2026-11-27T08:16:00.000Z",
    aller: [],
    retour: [],
    choixAller: null,
    choixRetour: null,
    classe: null,
    tarif: null,
    reference: null,
    prix: null,
    billets: [],
    retourDate: "2026-06-02",
    ...partial,
  });
}

function Suivi({ id, titre, partial }: { id: string; titre: string; partial: Partial<TrainProgressInput> }) {
  return (
    <article id={id} className="max-w-5xl space-y-3 rounded-3xl border border-[var(--border)] bg-[#f7f6f3] p-4 sm:p-5">
      <p className="text-sm font-semibold text-[var(--admin-navy)]">{titre}</p>
      <p className="text-xs text-muted">Paris → Montpellier · 29 et 30 mars 2027</p>
      <TrainRequestTrackView suivi={suiviDe(partial)} />
    </article>
  );
}

function Desk({ id, children }: { id: string; children: ReactNode }) {
  return (
    <article id={id} className="rounded-3xl border border-[var(--border)] bg-[#faf9f6] p-6">
      <p className="text-sm font-semibold text-[var(--admin-navy)]">← Dossiers</p>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-label text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--admin-gold-dark)]">Nom du séjour</p>
          <h1 className="text-3xl font-semibold text-[var(--admin-navy)]">Lyon</h1>
          <p className="text-sm text-muted">Référence TB-2026-0142 · Lyon · 1–2 juin 2026 · 2 voyageurs</p>
          <p className="mt-2 inline-flex rounded-full bg-white px-3 py-1 text-sm font-semibold text-[var(--admin-navy)] ring-1 ring-[var(--border)]">
            Non visible
          </p>
        </div>
        <div className="flex max-w-xl flex-wrap items-center justify-end gap-2">{children}</div>
      </div>
    </article>
  );
}

/** Aperçu local, données fictives. Fermé en production. */
export default function ApercuDemandeTrainPage() {
  if (!exampleSessionEnabled()) notFound();
  return (
    <div className="admin-af min-h-screen">
      <Suspense>
        <AdminNav counts={EMPTY_NAV_COUNTS} dockPromise={Promise.resolve(emptyDockSnapshot())} staffName="Agence" staffRole="admin">
          <div className="space-y-8 p-6">
            <Desk id="bouton">
              <TrainRequestButton bookingId="apercu" travelers={TRAVELERS} defaults={KNOWN} preview />
            </Desk>
            <Desk id="formulaire">
              <TrainRequestButton bookingId="apercu" travelers={TRAVELERS} defaults={KNOWN} startOpen preview />
            </Desk>
            <article id="moteur" className="max-w-xl rounded-3xl border border-[var(--border)] bg-[#f7f6f3] p-3">
              <TrainRequestButton bookingId="apercu" travelers={BENJAMIN} defaults={MONTPELLIER} embedded startOpen preview />
            </article>
            <Desk id="depart-inconnu">
              <TrainRequestButton bookingId="apercu" travelers={TRAVELERS} defaults={UNKNOWN} startOpen preview />
            </Desk>
            <Desk id="suivi">
              <TrainRequestButton bookingId="apercu" travelers={TRAVELERS} defaults={KNOWN} initial={CREATED} preview />
            </Desk>
            <article id="ajout" className="space-y-3 rounded-3xl border border-[var(--border)] bg-[#faf9f6] p-6">
              <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">Étapes du voyage</h2>
              <ServiceInsert bookingId="apercu" travelers={TRAVELERS} homeCity="Paris" hotel={HOTEL} side="avant" preview />
              <Step title="Hôtel Lyon" meta="1 juin 2026 → 2 juin 2026 · Lyon" />
              <ServiceInsert bookingId="apercu" travelers={TRAVELERS} homeCity="Paris" hotel={HOTEL} side="apres" preview />
            </article>
            <article id="selecteur" className="space-y-3 rounded-3xl border border-[var(--border)] bg-[#faf9f6] p-6">
              <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">Étapes du voyage</h2>
              <ServiceInsert bookingId="apercu" travelers={TRAVELERS} homeCity="Paris" hotel={HOTEL} side="avant" preview startPicker />
              <Step title="Hôtel Lyon" meta="1 juin 2026 → 2 juin 2026 · Lyon" />
            </article>
            <article id="avant" className="space-y-3 rounded-3xl border border-[var(--border)] bg-[#faf9f6] p-6">
              <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">Étapes du voyage</h2>
              <ServiceInsert bookingId="apercu" travelers={TRAVELERS} homeCity="Paris" hotel={HOTEL} side="avant" preview startOpen />
              <Step title="Hôtel Lyon" meta="1 juin 2026 → 2 juin 2026 · Lyon" />
            </article>
            <article id="apres" className="space-y-3 rounded-3xl border border-[var(--border)] bg-[#faf9f6] p-6">
              <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">Étapes du voyage</h2>
              <Step title="Hôtel Lyon" meta="1 juin 2026 → 2 juin 2026 · Lyon" />
              <ServiceInsert bookingId="apercu" travelers={TRAVELERS} homeCity="Paris" hotel={HOTEL} side="apres" preview startOpen />
            </article>
            <Suivi id="suivi-recherche" titre="Demande de train · Recherche" partial={{ ...TRAJET, status: "recherche" }} />
            <Suivi
              id="suivi-propositions"
              titre="Demande de train · Propositions envoyées"
              partial={{ ...TRAJET, status: "propositions", aller: OFFRES, retour: RETOURS }}
            />
            <Suivi
              id="suivi-choix"
              titre="Demande de train · Choix en cours"
              partial={{ ...TRAJET, status: "propositions", step: "classe", aller: OFFRES, retour: RETOURS, choixAller: 0, choixRetour: 1 }}
            />
            <Suivi
              id="suivi-combinaisons"
              titre="Demande de train · Combinaisons renvoyées"
              partial={{ ...TRAJET, status: "propositions", step: "tarif", aller: OFFRES, retour: RETOURS, choixAller: 0, choixRetour: 1 }}
            />
            <article id="bureau" className="max-w-3xl rounded-3xl border border-[var(--border)] bg-white p-3">
              <TrainRequestTrack
                bookingId="apercu"
                requestId="0acf8091-4101-4c7a-aabe-c0dd8756d2b5"
                preview={suiviDe({
                  ...TRAJET,
                  status: "propositions",
                  step: "accord",
                  aller: OFFRES,
                  retour: RETOURS,
                  choixAller: 0,
                  choixRetour: 1,
                  classe: "2de",
                  tarif: "non_remboursable",
                  journal: [{ at: "2026-11-27T09:20:00.000Z", texte: "Tu veux rester sur le 08h52 ? Dis-moi.", ia: true, kind: "aucun" }],
                })}
                bureau={{ pause: false, prise_en_main: false, ia: null, ia_globale: false, cle_openai: false }}
              />
            </article>
            <Suivi
              id="suivi-commande"
              titre="Demande de train · Commandé"
              partial={{ ...TRAJET, status: "commande", step: "fait", aller: OFFRES, retour: RETOURS, choixAller: 0, choixRetour: 1, tarif: "flex", classe: "2de" }}
            />
            <Suivi id="suivi-attente" titre="Demande de train · En attente" partial={{ ...TRAJET, status: "en_attente", aller: OFFRES, retour: RETOURS, choixAller: 0 }} />
            <Suivi id="suivi-refuse" titre="Demande de train · Refusé" partial={{ ...TRAJET, status: "annulee", step: "fait", aller: OFFRES }} />
            <article id="fil" className="space-y-3 rounded-3xl border border-[var(--border)] bg-[#faf9f6] p-6">
              <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">Étapes du voyage</h2>
              <Step title="Vol Paris → Lyon" meta="1 juin 2026 · 08h12" />
              <Step title="Demande de train" meta="Paris → Lyon · 1 juin 2026" badge="Nouvelle" />
              <Step title="Hôtel Lyon" meta="1 juin 2026 → 2 juin 2026 · Lyon" />
            </article>
            <article id="billet" className="space-y-3 rounded-3xl border border-[var(--border)] bg-[#faf9f6] p-6">
              <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">Étapes du voyage</h2>
              <Step title="Vol Paris → Lyon" meta="1 juin 2026 · 08h12" />
              <Step title="Paris Gare de Lyon → Lyon Part-Dieu" meta="1 juin 2026 · 08h12 · train 6601 · 1re Flex" badge="Commandé" />
              <Step title="Hôtel Lyon" meta="1 juin 2026 → 2 juin 2026 · Lyon" />
            </article>
          </div>
        </AdminNav>
      </Suspense>
    </div>
  );
}
