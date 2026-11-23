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
  return <article className="admin-af-card rounded-2xl p-4">{children}</article>;
}

function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "alert" }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
        tone === "alert" ? "bg-[var(--admin-peach)] text-[var(--admin-navy)]" : "bg-[var(--admin-sky)] text-[var(--admin-navy)]"
      }`}
    >
      {children}
    </span>
  );
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
      <div className="admin-af-card overflow-hidden rounded-2xl">
        <ul className="divide-y divide-border lg:hidden">
          {rows.map((row) => (
            <li key={row.name} className="space-y-2 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-[var(--admin-navy)]">{row.name}</p>
                <Badge tone={row.status === "Suspendu" ? "alert" : "neutral"}>{row.status}</Badge>
              </div>
              <p className="text-sm text-muted">{row.note}</p>
              {row.href ? (
                <Link href={row.href} className="text-sm font-semibold text-[var(--admin-navy)] underline">
                  Ouvrir la fiche
                </Link>
              ) : null}
              {row.name === "Camille Exemplaire" ? (
                <button type="button" className="admin-af-btn rounded-full px-4 py-2 text-sm" disabled={suspended} onClick={() => setSuspended(true)}>
                  {suspended ? "Suspendue" : "Suspendre"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--admin-sky)]/70 font-label text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
              <tr>
                <th className="px-5 py-3">Membre</th>
                <th className="px-5 py-3">Note</th>
                <th className="px-5 py-3">Statut</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.name} className="hover:bg-[var(--admin-sky)]/40">
                  <td className="px-5 py-3 font-semibold text-[var(--admin-navy)]">
                    {row.href ? <Link href={row.href}>{row.name}</Link> : row.name}
                  </td>
                  <td className="px-5 py-3 text-muted">{row.note}</td>
                  <td className="px-5 py-3">
                    <Badge tone={row.status === "Suspendu" ? "alert" : "neutral"}>{row.status}</Badge>
                  </td>
                  <td className="px-5 py-3 text-right">
                    {row.name === "Camille Exemplaire" ? (
                      <button type="button" className="admin-af-btn rounded-full px-4 py-2 text-sm" disabled={suspended} onClick={() => setSuspended(true)}>
                        {suspended ? "Suspendue" : "Suspendre"}
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function QueueActions({ decision, onDecide }: { decision?: string; onDecide: (value: string) => void }) {
  if (decision) return <p className="text-sm font-semibold text-[var(--admin-navy)]">{decision} Rien n’est enregistré.</p>;
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <button type="button" className="admin-af-btn rounded-full px-4 py-2 text-sm" onClick={() => onDecide("Validée.")}>
        Valider
      </button>
      <button type="button" className="rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--admin-navy)]" onClick={() => onDecide("Refusée.")}>
        Refuser
      </button>
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
      <div className="admin-af-card overflow-hidden rounded-2xl">
        <ul className="divide-y divide-border lg:hidden">
          {rows.map((row) => (
            <li key={row.id} className="space-y-2 px-4 py-4">
              <p className="font-semibold text-[var(--admin-navy)]">{row.name}</p>
              <p className="text-sm text-muted">{row.code}</p>
              <p className="text-sm text-muted">{row.phone}</p>
              <p className="text-sm text-muted">{row.card}</p>
              <QueueActions decision={decisions[row.id]} onDecide={(value) => setDecisions((current) => ({ ...current, [row.id]: value }))} />
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--admin-sky)]/70 font-label text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
              <tr>
                <th className="px-5 py-3">Membre</th>
                <th className="px-5 py-3">Parrainage</th>
                <th className="px-5 py-3">Téléphone</th>
                <th className="px-5 py-3">Carte</th>
                <th className="px-5 py-3 text-right">Décision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-5 py-3 font-semibold text-[var(--admin-navy)]">{row.name}</td>
                  <td className="px-5 py-3">{row.code}</td>
                  <td className="px-5 py-3">{row.phone}</td>
                  <td className="px-5 py-3">{row.card}</td>
                  <td className="px-5 py-3 text-right">
                    <QueueActions decision={decisions[row.id]} onDecide={(value) => setDecisions((current) => ({ ...current, [row.id]: value }))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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
      <Link href="/admin/maquette-club/membres/lea-exemplaire/prelever" className="admin-af-btn inline-flex h-11 items-center rounded-full px-5 text-sm">
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
          <button type="button" disabled={!ok} className="admin-af-btn h-11 rounded-full px-5 text-sm disabled:opacity-40" onClick={() => setDone(true)}>
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
