import { Suspense, type ReactNode } from "react";
import { notFound } from "next/navigation";
import { AdminNav } from "@/components/admin/AdminNav";
import { TrainRequestButton, type TrainRequestFace } from "@/components/admin/TrainRequestButton";
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
          </div>
        </AdminNav>
      </Suspense>
    </div>
  );
}
