import { Suspense, type ReactNode } from "react";
import { notFound } from "next/navigation";
import { AdminNav } from "@/components/admin/AdminNav";
import { TrainRequestButton, type TrainRequestFace } from "@/components/admin/TrainRequestButton";
import { ServiceInsert } from "@/components/admin/ServiceInsert";
import type { CrmBookingItem } from "@/lib/crm/types";
import { EMPTY_NAV_COUNTS } from "@/lib/crm/admin-nav";
import { exampleSessionEnabled } from "@/lib/crm/example-session";
import { TRAIN_DEFAULT_OUTBOUND, TRAIN_DEFAULT_RETURN, trainFormDefaults } from "@/lib/crm/train-request";
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
