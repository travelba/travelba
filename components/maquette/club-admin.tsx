"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ClubAdminFrame } from "@/components/maquette/club-chrome";
import {
  CLUB_FEE_EXAMPLE,
  CLUB_MEMBER,
  CLUB_MONTHS,
  CLUB_STAY,
  clubScreenById,
} from "@/lib/crm/club-maquette";
import { formatMoney } from "@/lib/crm/money";

export function ClubAdmin({ path, screen }: { path: string; screen: string }) {
  const title = clubScreenById(screen)?.title || "Club";
  return (
    <ClubAdminFrame title={title} path={path}>
      <p className="mt-1 text-sm text-muted">Maquette isolée du menu de l’agence. Aucune écriture.</p>
      {screen === "admin-members" ? <Members /> : null}
      {screen === "admin-queue" ? <Queue /> : null}
      {screen === "admin-file" ? <File /> : null}
      {screen === "admin-charge" ? <Charge /> : null}
      {screen === "admin-alerts" ? <Alerts /> : null}
      {screen === "admin-email" ? <EmailAlert /> : null}
      {screen === "admin-dashboard" ? <Dashboard /> : null}
    </ClubAdminFrame>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <article className="rounded-2xl border border-[#e5e3dc] bg-white p-4">{children}</article>;
}

function Members() {
  const [suspended, setSuspended] = useState(false);
  const rows = [
    { name: `${CLUB_MEMBER.firstName} ${CLUB_MEMBER.lastName}`, status: "À valider", href: "/admin/maquette-club/membres/lea-exemplaire", note: "Inscription du jour" },
    { name: "Camille Exemplaire", status: suspended ? "Suspendu" : "Active", href: "", note: "Déjà cliente de l’agence" },
    { name: "Noah Exemplaire", status: "Suspendu", href: "", note: "Accès coupé" },
  ];
  return (
    <div className="mt-6 space-y-3">
      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/admin/maquette-club/inscriptions" className="font-semibold text-[var(--admin-navy)] underline">
          2 inscriptions à valider
        </Link>
        <Link href="/admin/maquette-club/tableau" className="font-semibold text-[var(--admin-navy)] underline">
          Tableau de bord
        </Link>
      </div>
      {rows.map((row) => (
        <Card key={row.name}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              {row.href ? (
                <Link href={row.href} className="font-semibold text-[var(--admin-navy)]">
                  {row.name}
                </Link>
              ) : (
                <p className="font-semibold text-[var(--admin-navy)]">{row.name}</p>
              )}
              <p className="text-sm text-muted">{row.note}</p>
            </div>
            <span className="rounded-full bg-[#f4efe6] px-3 py-1 text-xs font-semibold text-[var(--admin-navy)]">{row.status}</span>
          </div>
          {row.name === "Camille Exemplaire" && !suspended ? (
            <button type="button" className="mt-3 text-sm font-semibold text-[var(--admin-navy)] underline" onClick={() => setSuspended(true)}>
              Suspendre
            </button>
          ) : null}
          {row.name === "Camille Exemplaire" && suspended ? (
            <p className="mt-3 text-sm text-muted">Suspendue dans la maquette. Rien n’est enregistré.</p>
          ) : null}
        </Card>
      ))}
    </div>
  );
}

function Queue() {
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const rows = [
    {
      id: "lea",
      name: `${CLUB_MEMBER.firstName} ${CLUB_MEMBER.lastName}`,
      code: CLUB_MEMBER.code,
      phone: "Téléphone vérifié",
      card: `Carte de garantie ${CLUB_MEMBER.card}`,
    },
    {
      id: "ines",
      name: "Inès Exemplaire",
      code: "Sans code",
      phone: "Téléphone vérifié",
      card: "Carte de garantie manquante",
    },
  ];
  return (
    <div className="mt-6 space-y-3">
      {rows.map((row) => (
        <Card key={row.id}>
          <p className="font-semibold text-[var(--admin-navy)]">{row.name}</p>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            <li>Parrainage : {row.code}</li>
            <li>{row.phone}</li>
            <li>{row.card}</li>
          </ul>
          {decisions[row.id] ? (
            <p className="mt-3 text-sm font-semibold text-[var(--admin-navy)]">{decisions[row.id]} Rien n’est enregistré.</p>
          ) : (
            <div className="mt-3 flex gap-2">
              <button type="button" className="rounded-full bg-[var(--admin-navy)] px-4 py-2 text-sm font-semibold text-white" onClick={() => setDecisions((current) => ({ ...current, [row.id]: "Validée." }))}>
                Valider
              </button>
              <button type="button" className="rounded-full border border-[#e5e3dc] px-4 py-2 text-sm font-semibold text-[var(--admin-navy)]" onClick={() => setDecisions((current) => ({ ...current, [row.id]: "Refusée." }))}>
                Refuser
              </button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function File() {
  return (
    <div className="mt-6 space-y-4">
      <Card>
        <p className="font-semibold text-[var(--admin-navy)]">{CLUB_MEMBER.firstName} {CLUB_MEMBER.lastName}</p>
        <p className="text-sm text-muted">{CLUB_MEMBER.email} · {CLUB_MEMBER.phone}</p>
        <p className="mt-2 text-sm">Carte de garantie {CLUB_MEMBER.card} · enregistrée, aucun débit.</p>
      </Card>
      <Card>
        <h2 className="font-semibold text-[var(--admin-navy)]">Réservations Club</h2>
        <p className="mt-2 text-sm">
          {CLUB_STAY.hotel.name}, {CLUB_STAY.when}, {formatMoney(CLUB_STAY.total, "EUR")} TTC.
        </p>
        <p className="mt-1 text-sm text-muted">
          Dossier CRM {CLUB_STAY.dossier} créé automatiquement. Il reste dans la maquette : le dossier réel n’est pas ouvert.
        </p>
      </Card>
      <Card>
        <h2 className="font-semibold text-[var(--admin-navy)]">Cotisation</h2>
        <p className="mt-2 text-sm">Offerte jusqu’au 15 mai 2027. Ensuite {CLUB_FEE_EXAMPLE.label} {CLUB_FEE_EXAMPLE.period}.</p>
        <p className="mt-1 text-sm text-muted">{CLUB_FEE_EXAMPLE.reason} Montant d’exemple. Le membre la paie lui-même.</p>
      </Card>
      <Card>
        <h2 className="font-semibold text-[var(--admin-navy)]">Parrainage</h2>
        <p className="mt-2 text-sm">Code {CLUB_MEMBER.code}. Filleuls illimités.</p>
        <p className="mt-1 text-sm text-muted">{CLUB_MEMBER.filleul} — cotisation offerte dès son inscription.</p>
      </Card>
      <Link href="/admin/maquette-club/membres/lea-exemplaire/prelever" className="inline-flex h-11 items-center rounded-full bg-[var(--admin-navy)] px-5 text-sm font-semibold text-white">
        Prélever sur la carte de garantie
      </Link>
    </div>
  );
}

function Charge() {
  const [ok, setOk] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <div className="mt-6 max-w-lg space-y-4">
      <Card>
        <p className="text-sm text-muted">No-show d’exemple · {CLUB_STAY.hotel.name}</p>
        <p className="mt-2 text-2xl font-semibold text-[var(--admin-navy)]">{formatMoney(180, "EUR")}</p>
        <p className="mt-2 text-sm">Carte {CLUB_MEMBER.card} de {CLUB_MEMBER.firstName} {CLUB_MEMBER.lastName}.</p>
        <p className="mt-2 text-sm">Ce prélèvement attend toujours la confirmation de Raphael. Il ne part pas seul.</p>
      </Card>
      {done ? (
        <p className="text-sm font-semibold text-[var(--admin-navy)]">Demande enregistrée dans la maquette. Aucune carte n’est débitée.</p>
      ) : (
        <>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1" checked={ok} onChange={(event) => setOk(event.target.checked)} />
            <span>Je suis Raphael et je confirme ce prélèvement de {formatMoney(180, "EUR")}.</span>
          </label>
          <button type="button" disabled={!ok} className="h-11 rounded-full bg-[var(--admin-navy)] px-5 text-sm font-semibold text-white disabled:opacity-40" onClick={() => setDone(true)}>
            Prélever
          </button>
        </>
      )}
    </div>
  );
}

function Alerts() {
  const rows = [
    { title: "Nouvelle inscription", body: `${CLUB_MEMBER.firstName} ${CLUB_MEMBER.lastName} · ${CLUB_MEMBER.code} · téléphone vérifié · carte OK` },
    { title: "Réservation Club", body: `${CLUB_STAY.hotel.name} · ${CLUB_STAY.when} · dossier ${CLUB_STAY.dossier}` },
  ];
  return (
    <div className="mt-6 space-y-3">
      <p className="text-sm text-muted">Les mêmes alertes partent par e-mail. Aperçu seulement.</p>
      {rows.map((row) => (
        <Card key={row.title}>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--admin-gold)]">Dans le CRM</p>
          <p className="mt-1 font-semibold text-[var(--admin-navy)]">{row.title}</p>
          <p className="mt-1 text-sm text-muted">{row.body}</p>
        </Card>
      ))}
      <Link href="/admin/maquette-club/alertes/email" className="inline-flex text-sm font-semibold text-[var(--admin-navy)] underline">
        Voir l’e-mail
      </Link>
    </div>
  );
}

function EmailAlert() {
  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      <Card>
        <p className="text-xs uppercase tracking-[0.12em] text-muted">Aperçu · non envoyé</p>
        <p className="mt-2 text-sm text-muted">À l’agence · Nouvelle inscription</p>
        <h2 className="mt-2 font-display text-lg font-semibold text-[var(--admin-navy)]">Club · inscription à valider</h2>
        <p className="mt-3 text-sm leading-relaxed">
          {CLUB_MEMBER.firstName} {CLUB_MEMBER.lastName} vient de s’inscrire. Code {CLUB_MEMBER.code}. Téléphone vérifié. Carte de garantie enregistrée. La file attend un clic Valider ou Refuser.
        </p>
      </Card>
      <Card>
        <p className="text-xs uppercase tracking-[0.12em] text-muted">Aperçu · non envoyé</p>
        <p className="mt-2 text-sm text-muted">À l’agence · Réservation</p>
        <h2 className="mt-2 font-display text-lg font-semibold text-[var(--admin-navy)]">Club · séjour réservé</h2>
        <p className="mt-3 text-sm leading-relaxed">
          {CLUB_MEMBER.firstName} {CLUB_MEMBER.lastName} a réservé {CLUB_STAY.hotel.name}, {CLUB_STAY.when}, {formatMoney(CLUB_STAY.total, "EUR")} TTC. Le dossier {CLUB_STAY.dossier} est créé automatiquement.
        </p>
      </Card>
    </div>
  );
}

function Dashboard() {
  const max = Math.max(...CLUB_MONTHS.map((month) => month.count));
  const current = CLUB_MONTHS[CLUB_MONTHS.length - 1];
  return (
    <div className="mt-6 space-y-4">
      <Card>
        <p className="text-sm text-muted">Indicateur principal</p>
        <p className="mt-1 font-display text-4xl font-bold text-[var(--admin-navy)]">{current.count}</p>
        <p className="text-sm">réservations en {current.label.toLowerCase()} 2026</p>
      </Card>
      <Card>
        <h2 className="font-semibold text-[var(--admin-navy)]">Réservations par mois</h2>
        <ul className="mt-4 space-y-3">
          {CLUB_MONTHS.map((month) => (
            <li key={month.label} className="grid grid-cols-[4.5rem_1fr_2rem] items-center gap-3 text-sm">
              <span>{month.label}</span>
              <span className="h-3 overflow-hidden rounded-full bg-[#f4efe6]">
                <span className="block h-full rounded-full bg-[var(--admin-navy)]" style={{ width: `${(month.count / max) * 100}%` }} />
              </span>
              <span className="text-right font-semibold">{month.count}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
